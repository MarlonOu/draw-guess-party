import type {
  RoomPlayer,
  RoomSettings,
  RoomSummary,
  RoomStatus,
  RoundPhase,
  TelephoneSummary,
  FragmentSummary,
  FragmentSplitOrientation,
  FragmentHalf,
} from '../types/room';
import type { Stroke, StrokePoint } from '../types/stroke';
import {
  shuffleChainOrder,
  pickRandomWord,
  findNextActiveIndex,
} from '../engine/telephoneEngine';
import {
  pickWordsForTeams,
  pickRandomHalf,
  filterStrokesByHalf,
  isPointInAllowedHalf,
} from '../engine/fragmentEngine';
import {
  getNextDrawer,
  computeRoundCount,
  pickWordOptions,
  computeGuesserPointsByRank,
  DRAWER_POINTS_PER_GUESSER,
} from '../engine/drawGuessEngine';

interface WordOption {
  id: string;
  text: string;
}

export interface CorrectGuessRecord {
  playerId: string;
  points: number;
}

export interface TelephoneEntry {
  playerId: string;
  displayName: string;
  strokes: Stroke[];
  /** 這一棒的人對「上一棒的畫」給出的猜測文字；接龍第一棒沒有這個欄位（他沒有前一棒可以猜） */
  guessText?: string;
}

/**
 * DRAW_TELEPHONE 模式的伺服器內部完整狀態（含還沒公布前不能讓其他人看到的內容）。
 * 只有 room.settings.mode === 'DRAW_TELEPHONE' 時才會是非 null。
 */
export interface TelephoneState {
  /** 依隨機順序排列的整條接龍玩家 id，比賽開始時決定，中途不變動（離開的人用 findNextActiveIndex 動態跳過，不修改這個陣列本身） */
  chainOrder: string[];
  /** 目前輪到 chainOrder 的第幾位（0 起算） */
  currentIndex: number;
  /** 目前這一位在接龍裡的子階段：guessing（先看前一棒的畫、寫下猜測）、drawing（畫自己的猜測）；
   *  revealed 為 true 之後固定是 null */
  subPhase: 'guessing' | 'drawing' | null;
  /** 目前這個子階段開始的時間戳（epoch ms），跟 subPhase 同時設定、同時清空。
   *  廣播給全房間所有人，讓旁觀者也能算出跟當事人同步的剩餘時間倒數，
   *  不用只有正在動作的那個人自己心裡默默倒數、其他人完全看不到進度。 */
  subPhaseStartedAt: number | null;
  /** 是否已經公布，公布之後整條接龍就結束了，不會再回到 guessing/drawing */
  revealed: boolean;
  /** 接龍第一棒的原始題目，只有第一棒的人看得到（透過私訊），其他人要等 revealed 才看得到 */
  originalWord: string | null;
  /** 已經完成的每一棒，依接龍順序累積 */
  entries: TelephoneEntry[];
  /** 目前這一位在 guessing 子階段送出、還沒進到 drawing 前暫存的猜測文字 */
  pendingGuessText: string | null;
  /** 目前這一位正在畫的筆畫（即時累積，這一棒交出去後打包進 entries，開始新的一棒時清空） */
  currentStrokes: Stroke[];
  /**
   * 公布階段（revealed 為 true 之後）的「準備好下一場」投票名單。原本是只有房主
   * 能點一個按鈕直接返回大廳，改成每個人都要各自按下「我準備好了」表態，等目前
   * 連線中的所有玩家都投票之後才會自動返回大廳——見 voteReadyForNextRound。
   * revealed 為 false 時固定是空集合，沒有意義。
   */
  readyForNextRoundIds: Set<string>;
}

/**
 * FRAGMENT_DRAW 模式：單一組的伺服器內部完整狀態（含還沒公布前不能讓其他人看到
 * 的畫布內容）。跟 TelephoneState 最大的不同：接龍模式全房間共用「一條鏈、一個
 * 目前位置」，這個模式是每一組各自獨立一份狀態、平行推進——不用等其他組畫完，
 * 所以狀態是「一組一份」而不是「整個房間一份」。
 */
export interface FragmentTeamState {
  id: string;
  /** [起手, 補全]，組隊當下（比賽開始時）就固定，不會中途更動 */
  playerIds: [string, string];
  /** 這一組隨機抽到的題目 */
  word: string;
  /** 目前（或起手交卷當下）選擇的切割方向，起手作畫中可以隨時透過
   *  setFragmentOrientation 切換（切換會清空 firstDrawerStrokes，見那個函式的說明） */
  splitOrientation: FragmentSplitOrientation;
  /** 起手正在畫／已經畫完的完整內容（drawing1 進行中即時累積） */
  firstDrawerStrokes: Stroke[];
  /** 起手交卷後，系統隨機決定保留哪一半；drawing1 階段固定是 null */
  keptHalf: FragmentHalf | null;
  /** 從 firstDrawerStrokes 篩選出保留半邊的內容，drawing2 開始後才會有值，
   *  是補全者看到的「已經畫好的那一半」 */
  keptStrokes: Stroke[];
  /** 補全者正在畫／已經畫完的內容（只會落在允許的那一半，伺服器端有驗證，
   *  見 isPointInAllowedHalf） */
  secondDrawerStrokes: Stroke[];
  subPhase: 'drawing1' | 'drawing2' | 'done';
  subPhaseStartedAt: number | null;
  /** 猜題階段：外組玩家對這組作品的猜測，key 是猜測者 playerId，依送出先後
   *  用 Map 的插入順序自然排列（JS 的 Map 保證迭代順序 = 插入順序） */
  guesses: Map<string, { displayName: string; text: string }>;
}

/**
 * FRAGMENT_DRAW 模式的伺服器內部完整狀態。只有 room.settings.mode ===
 * 'FRAGMENT_DRAW' 時才會是非 null。
 */
export interface FragmentState {
  /** 每一組各自獨立推進，不是像接龍模式那樣共用一個「目前輪到第幾位」的序列 */
  teams: FragmentTeamState[];
  /**
   * 猜題階段是否已經開始（所有組別都畫完了才會是 true）。
   *
   * 使用者明確要求這個階段不要「一組一組公布、大家要互相等」，改成「每個人
   * 各自依自己的節奏往下猜，猜完自己該猜的所有組別後才等其他人」——所以這裡
   * 不需要（也不能有）「目前公布到第幾組」這種全房間共用的單一進度指標，
   * 每個人現在該猜哪一組，是動態依「這個人對哪些組別已經留下猜測紀錄」去
   * 推算出來的（見 findNextTeamToGuessForPlayer），不是一個要另外維護、
   * 讓所有人共用同一個值的欄位。
   */
  guessingStarted: boolean;
  /**
   * 每位玩家「目前正在猜的這一組」開始的時間戳，key 是玩家 id——因為現在
   * 每個人進度不同，倒數計時器要各自獨立算，不能像舊版那樣共用一個
   * 全房間的時間戳。玩家猜完自己該猜的所有組別後，這裡的紀錄會被移除
   * （不需要繼續倒數）。
   */
  guessStartedAtByPlayer: Map<string, number>;
  /** 是否已經全部公布完畢，公布之後就不會再回到 drawing/guessing */
  revealed: boolean;
  /** 「準備好下一場」投票名單，設計理由跟 TelephoneState.readyForNextRoundIds
   *  完全一致，這個模式沿用同一套機制 */
  readyForNextRoundIds: Set<string>;
}

export interface RoomState {
  joinCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: Map<string, RoomPlayer & { socketId: string | null }>;
  /**
   * 目前的房主：只有這個人可以改房間設定、在比賽結束畫面選擇先不自動重啟。
   * 不影響誰能按「開始遊戲」——那個所有人都能按。房主離開時會從剩下的人裡
   * 隨機重新指派（見 removePlayer），房間不會因此變成沒有房主。
   */
  hostPlayerId: string | null;
  currentRoundIndex: number;
  roundCount: number;
  /** DRAW_GUESS 模式使用：本輪正確答案，畫圖者尚未從候選題目中選定時為 null */
  currentWord: string | null;
  currentWordId: string | null;
  /** 畫圖者尚未選題時，這裡放著等他選的候選題目（通常 2 個） */
  pendingWordOptions: WordOption[];
  /** 本輪開始的時間戳（epoch ms），計時與搶分計算都以此為基準 */
  roundStartedAt: number | null;
  /** 這一輪目前為止猜中的人（依猜中先後順序），round 開始時清空 */
  correctGuesses: CorrectGuessRecord[];
  /** 固定的輪流順序（玩家 id），比賽開始時決定，中途不變動 */
  turnOrder: string[];
  /** 目前輪到 turnOrder 中的第幾個索引，-1 代表尚未開始任何一輪 */
  drawerIndex: number;
  drawerPlayerId: string | null;
  roundPhase: RoundPhase | null;
  usedWordIds: Set<string>;
  /** 目前這一輪的完整筆畫資料，round 結束時整理落地、開始新一輪時清空 */
  currentStrokes: Stroke[];
  /** DRAW_TELEPHONE 模式專用狀態，其餘模式固定為 null */
  telephone: TelephoneState | null;
  /** FRAGMENT_DRAW 模式專用狀態，其餘模式固定為 null */
  fragment: FragmentState | null;
  /**
   * FRAGMENT_DRAW 模式專用：lobby 階段每個玩家目前選擇加入的組別編號（從 0
   * 起）。key 是玩家 id、value 是組別編號。預設依進房順序，依序填入還沒滿
   * （少於 2 人）的組別（見 joinRoom 裡的維護邏輯）。開始遊戲前不強制每組剛好
   * 2 人——允許暫時不對稱（例如某組暫時 3 人、某組暫時 0 人），玩家可以自由
   * 點擊任何一組的加入按鈕把自己移過去；但真正要開始遊戲時（見
   * beginFragmentGame）每一組都必須剛好 2 人才會通過驗證。
   * 其餘模式這個 Map 固定是空的，沒有意義。
   */
  fragmentTeamAssignment: Map<string, number>;
}

const globalForRooms = globalThis as unknown as { __drawGuessPartyRooms?: Map<string, RoomState> };

/**
 * 房間狀態掛在 globalThis 上，避免 Next.js 對 API Route 的打包與 server.ts
 * 直接以原始碼引入本模組時各自產生獨立模組實例、各自持有一份不同步的 Map。
 * 確保無論從哪個模組圖（API Route bundle 或 server.ts 直接匯入）存取，
 * 都是同一份房間狀態。
 */
const rooms: Map<string, RoomState> =
  globalForRooms.__drawGuessPartyRooms ?? new Map<string, RoomState>();
globalForRooms.__drawGuessPartyRooms = rooms;

/**
 * 找出目前人數還沒滿（少於 2 人）的第一個組別編號，讓新玩家有預設的加入位置——
 * 新玩家依序自動填入還沒滿的組別，不需要自己手動選（雖然之後隨時可以自己
 * 改），這樣「一開始就有合理的預設分組」這件事才會自然成立。
 */
function findFirstAvailableTeamNumber(assignment: Map<string, number>): number {
  const counts = new Map<number, number>();
  for (const teamNumber of assignment.values()) {
    counts.set(teamNumber, (counts.get(teamNumber) ?? 0) + 1);
  }
  let teamNumber = 0;
  while ((counts.get(teamNumber) ?? 0) >= 2) {
    teamNumber += 1;
  }
  return teamNumber;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除易混淆字元 0/O、1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * 建立房間。
 * 建立者自動成為房主（見 RoomState.hostPlayerId 的說明）：房主只影響「誰能改房間
 * 設定、誰能在比賽結束畫面選擇先不自動重啟」，不影響誰能按「開始遊戲」——那個
 * 房間裡任何人都能按，兩者是分開的權限。
 * 輸入：建立者顯示名稱、遊戲設定
 * 輸出：新建立的 RoomState
 * 邊界條件：加入代碼碰撞時重新產生，直到取得未使用的代碼
 */
export function createRoom(creatorDisplayName: string, settings: RoomSettings): RoomState {
  let joinCode = generateJoinCode();
  while (rooms.has(joinCode)) {
    joinCode = generateJoinCode();
  }

  const creatorPlayerId = crypto.randomUUID();
  const room: RoomState = {
    joinCode,
    status: 'lobby',
    settings,
    players: new Map([
      [
        creatorPlayerId,
        {
          id: creatorPlayerId,
          displayName: creatorDisplayName,
          score: 0,
          connected: false,
          socketId: null,
        },
      ],
    ]),
    hostPlayerId: creatorPlayerId,
    currentRoundIndex: 0,
    roundCount: 0,
    currentWord: null,
    currentWordId: null,
    pendingWordOptions: [],
    roundStartedAt: null,
    correctGuesses: [],
    turnOrder: [],
    drawerIndex: -1,
    drawerPlayerId: null,
    roundPhase: null,
    usedWordIds: new Set(),
    currentStrokes: [],
    telephone: null,
    fragment: null,
    fragmentTeamAssignment: new Map(),
  };

  if (settings.mode === 'FRAGMENT_DRAW') {
    room.fragmentTeamAssignment.set(creatorPlayerId, 0);
  }

  rooms.set(joinCode, room);
  return room;
}

export function getRoom(joinCode: string): RoomState | undefined {
  return rooms.get(joinCode);
}

/**
 * 玩家加入房間
 * 輸入：房間代碼、顯示名稱、socket id、可選的既有 playerId
 * 輸出：對應的玩家物件，或 null（房間不存在／加入條件不成立）
 * 邊界條件：
 *  - 帶入既有 playerId 且該玩家存在於房間內時，視為「綁定連線」（建立房間後第一次
 *    連上 socket、或斷線重連），不建立新玩家、不受房間狀態限制
 *  - 未帶入 playerId 時視為全新玩家加入，房間狀態非 lobby 時拒絕，避免遊戲進行中途插入玩家
 */
/**
 * 玩家加入房間
 * 輸入：房間代碼、顯示名稱、socket id、可選的既有 playerId
 * 輸出：對應的玩家物件，或 null（房間不存在／加入條件不成立）
 * 邊界條件：
 *  - 帶入既有 playerId 且該玩家存在於房間內時，視為「綁定連線」（建立房間後第一次
 *    連上 socket、或斷線重連），不建立新玩家、不受房間狀態限制
 *  - 帶入既有 playerId 但該玩家已經不存在於房間內時（斷線緩衝期過後被硬刪除、
 *    或帶著別的房間留下的舊 id 誤連到這裡），不能直接判定失敗——這裡曾經是一個
 *    真實發生過的 bug：使用者瀏覽器端快取的 playerId 一旦失效，每次重新整理
 *    頁面重連都繼續帶著同一個已經不存在的 id 去查，注定每次都失敗，永遠卡在
 *    「找不到這個房間，或房間目前無法加入」的錯誤訊息，即使房間本身其實還在、
 *    也還能加入。正確的行為是落到下面「當作全新玩家加入」繼續處理，讓對方能
 *    順利用新的 playerId 重新加入這個房間
 *  - 未帶入 playerId（或帶入了但查無此人，如上一點）時視為全新玩家加入。
 *    房間狀態為 lobby 時正常加入；房間狀態為 playing 時也接受加入，直接排到
 *    輪流順序最後面（見下方），這一場多算一輪給他，不會插隊排到還沒輪到的人
 *    前面；房間狀態為 finished 時不接受（這是等待自動回到 lobby 或重啟新一場
 *    的過渡狀態，不必特地處理中途加入）
 */
export function joinRoom(
  joinCode: string,
  displayName: string,
  socketId: string,
  existingPlayerId?: string
): RoomPlayer | null {
  const room = rooms.get(joinCode);
  if (!room) return null;

  if (existingPlayerId) {
    const existing = room.players.get(existingPlayerId);
    if (existing) {
      existing.socketId = socketId;
      existing.connected = true;
      return existing;
    }
    // 找不到這個 id 對應的玩家——不要在這裡直接回傳 null，繼續往下走，
    // 當作全新玩家加入處理
  }

  if (room.status === 'finished') return null;

  const playerId = crypto.randomUUID();
  const player = {
    id: playerId,
    displayName,
    score: 0,
    connected: true,
    socketId,
  };
  room.players.set(playerId, player);

  if (room.settings.mode === 'FRAGMENT_DRAW' && room.status === 'lobby') {
    // 新玩家預設填進目前人數還沒滿的第一個組別（見 findFirstAvailableTeamNumber
    // 的說明），之後隨時可以自己點擊別組的加入按鈕改變分組。
    room.fragmentTeamAssignment.set(playerId, findFirstAvailableTeamNumber(room.fragmentTeamAssignment));
  }

  if (room.status === 'playing') {
    // 中途加入的人排到輪流順序最後面，這一場多算一輪給他；
    // 不重新洗牌，避免打亂原本已經在進行中的順序
    room.turnOrder.push(playerId);
    room.roundCount += 1;
  }

  return player;
}

/**
 * 只標記離線，不刪除玩家。用於「這個人斷線了，但可能只是暫時的（例如手機切到別的
 * App、瀏覽器分頁被系統暫停），先保留他的座位，給一段緩衝時間讓他有機會重新連回來」
 * ——實際的硬刪除交給 removePlayer，在緩衝時間到期、確定沒有回來時才呼叫（見
 * socketHandlers/room.ts 的 GRACE_PERIOD_MS 機制）。
 */
export function markPlayerDisconnected(joinCode: string, playerId: string): void {
  const room = rooms.get(joinCode);
  const player = room?.players.get(playerId);
  if (player) {
    player.socketId = null;
    player.connected = false;
  }
}

/**
 * 硬刪除一名玩家，並修正因此失真的比賽狀態（turnOrder、drawerIndex、roundCount、
 * correctGuesses）。呼叫時機：主動離開房間（沒有緩衝，立刻執行），或斷線緩衝時間
 * 到期仍未重新連回來（見 socketHandlers/room.ts）。
 *
 * 移除的人如果排在「還沒輪到」的位置（idx 在目前 drawerIndex 之後），代表他那一輪
 * 直接整個取消，不會有人代打頂替他的位置——所以 roundCount（總輪數）要跟著少一輪，
 * 而不是讓陣列變短之後，繞回去重複找到還在線上的人（例如 3 人比賽，第 3 位還沒
 * 輪到就離線，若 roundCount 沒跟著調整，getNextDrawer 的模數運算會繞回陣列開頭，
 * 讓第 1 位又被排到「第 3 輪」重畫一次）。
 *
 * 移除的人如果排在「已經輪過、或正在輪到」的位置（idx <= drawerIndex），代表這一輪
 * 已經算在 currentRoundIndex 裡了（不管是正常畫完、還是像下面 wasCurrentDrawer 那樣
 * 被中途中斷），roundCount 不需要跟著減少——後面還沒輪到的人依然要正常拿到他們的
 * 那一輪，只需要把 drawerIndex 往前挪一格，確保「目前輪到誰」在陣列變短之後仍然
 * 正確對應到同一個人（或者，如果被刪的正好是目前的畫圖者，正確對應到下一個人）。
 *
 * 輸出：{ wasCurrentDrawer, roomDeleted }
 *  - wasCurrentDrawer：離開的人是不是正處於 drawing 階段的畫圖者本人，呼叫端據此決定
 *    要不要立刻中斷這一輪
 *  - roomDeleted：房間是不是因為刪完之後空無一人而被整個移除，呼叫端不應該再對這個
 *    房間做任何後續廣播
 */
export function removePlayer(
  joinCode: string,
  playerId: string
): { wasCurrentDrawer: boolean; wasActiveTelephonePlayer: boolean; roomDeleted: boolean } {
  const room = rooms.get(joinCode);
  if (!room) return { wasCurrentDrawer: false, wasActiveTelephonePlayer: false, roomDeleted: false };

  const wasCurrentDrawer =
    room.status === 'playing' && room.roundPhase === 'drawing' && playerId === room.drawerPlayerId;

  const wasActiveTelephonePlayer =
    room.settings.mode === 'DRAW_TELEPHONE' &&
    room.telephone !== null &&
    !room.telephone.revealed &&
    room.telephone.chainOrder[room.telephone.currentIndex] === playerId;

  room.players.delete(playerId);

  // 離開的剛好是房主：從剩下的人裡隨機重新指派一位，房間不會因此變成沒有房主
  if (room.hostPlayerId === playerId && room.players.size > 0) {
    const remainingIds = Array.from(room.players.keys());
    room.hostPlayerId = remainingIds[Math.floor(Math.random() * remainingIds.length)];
  }

  const idx = room.turnOrder.indexOf(playerId);
  if (idx !== -1) {
    room.turnOrder.splice(idx, 1);
    if (idx <= room.drawerIndex) {
      room.drawerIndex -= 1;
    } else if (room.status === 'playing') {
      room.roundCount = Math.max(0, room.roundCount - 1);
    }
  }

  room.correctGuesses = room.correctGuesses.filter((g) => g.playerId !== playerId);

  room.fragmentTeamAssignment.delete(playerId);

  if (room.players.size === 0) {
    rooms.delete(joinCode);
    return { wasCurrentDrawer, wasActiveTelephonePlayer, roomDeleted: true };
  }

  return { wasCurrentDrawer, wasActiveTelephonePlayer, roomDeleted: false };
}

function getNextDrawerPlayerId(room: RoomState): string | null {
  if (room.turnOrder.length === 0) return null;
  const nextIndex = (room.drawerIndex + 1) % room.turnOrder.length;
  return room.turnOrder[nextIndex];
}

function toTelephoneSummary(room: RoomState): TelephoneSummary | null {
  const t = room.telephone;
  if (!t) return null;
  return {
    chainOrder: t.chainOrder,
    currentIndex: t.currentIndex,
    subPhase: t.subPhase,
    subPhaseStartedAt: t.subPhaseStartedAt,
    activePlayerId:
      !t.revealed && t.currentIndex >= 0 && t.currentIndex < t.chainOrder.length
        ? t.chainOrder[t.currentIndex]
        : null,
    completedCount: t.entries.length,
    totalPlayers: t.chainOrder.length,
    reveal: t.revealed
      ? {
          originalWord: t.originalWord ?? '',
          entries: t.entries,
        }
      : null,
    readyForNextRoundIds: Array.from(t.readyForNextRoundIds),
  };
}

/**
 * FRAGMENT_DRAW 模式的公開狀態摘要。跟 toTelephoneSummary 同樣的原則：只曝露
 * 「進度」（誰在畫、畫到第幾組、猜了沒），不曝露任何「內容」（題目文字、畫布
 * 筆畫、猜測文字）——那些只透過私訊給當事人，或是在 reveal 之後才整包公開。
 */
function toFragmentSummary(room: RoomState): FragmentSummary | null {
  const f = room.fragment;
  if (!f) return null;

  const playersStillGuessingCount = f.guessingStarted
    ? Array.from(room.players.values()).filter(
        (p) => p.connected && findNextTeamToGuessForPlayer(f, p.id) !== null
      ).length
    : 0;

  return {
    teams: f.teams.map((t) => ({
      id: t.id,
      playerIds: t.playerIds,
      subPhase: t.subPhase,
      subPhaseStartedAt: t.subPhase === 'done' ? null : t.subPhaseStartedAt,
      activePlayerId:
        t.subPhase === 'drawing1' ? t.playerIds[0] : t.subPhase === 'drawing2' ? t.playerIds[1] : null,
    })),
    guessingStarted: f.guessingStarted,
    playersStillGuessingCount,
    reveal: f.revealed
      ? {
          teams: f.teams.map((t) => ({
            teamId: t.id,
            word: t.word,
            memberIds: t.playerIds,
            memberNames: t.playerIds.map((id) => room.players.get(id)?.displayName ?? '離線玩家') as [
              string,
              string,
            ],
            splitOrientation: t.splitOrientation,
            keptHalf: t.keptHalf ?? 'a',
            keptStrokes: t.keptStrokes,
            completedStrokes: t.secondDrawerStrokes,
            guesses: Array.from(t.guesses.entries()).map(([guesserId, g]) => ({
              guesserId,
              guesserDisplayName: g.displayName,
              text: g.text,
            })),
          })),
        }
      : null,
    readyForNextRoundIds: Array.from(f.readyForNextRoundIds),
  };
}

export function toRoomSummary(room: RoomState): RoomSummary {
  return {
    joinCode: room.joinCode,
    status: room.status,
    settings: room.settings,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      score: p.score,
      connected: p.connected,
    })),
    currentRoundIndex: room.currentRoundIndex,
    roundCount: room.roundCount,
    roundPhase: room.roundPhase,
    drawerPlayerId: room.drawerPlayerId,
    hostPlayerId: room.hostPlayerId,
    nextDrawerPlayerId: getNextDrawerPlayerId(room),
    wordChosen: room.currentWord !== null,
    correctGuesserIds: room.correctGuesses.map((g) => g.playerId),
    telephone: toTelephoneSummary(room),
    fragment: toFragmentSummary(room),
    fragmentTeamAssignment:
      room.status === 'lobby' ? Object.fromEntries(room.fragmentTeamAssignment) : {},
  };
}

/**
 * 開始整場比賽：固定輪流順序、計算總輪數、狀態轉為 playing
 * 每位玩家輪流畫一次算一場比賽（roundCount = 參與人數）。
 * 任何在房間裡的人都可以觸發開始（沒有房主限制），呼叫端只需確認連線中人數 >= 2。
 *
 * 只把「目前還連線著」的人排進這場比賽的輪流順序：離線的人排進去也沒用，輪到他畫圖時
 * 沒人能操作畫布，那一輪就整個浪費掉（用於「一場比賽結束後自動開新一場」的重啟情境，
 * 這時候距離上次確認連線已經過了一整場比賽，很可能已經有人中途離開）。
 *
 * 輸入：房間
 * 輸出：無（直接修改房間狀態）
 * 邊界條件：連線中玩家數為 0 時不應被呼叫（呼叫端需先確保至少 2 人連線中）
 */
export function beginGame(room: RoomState): void {
  const playerIds = Array.from(room.players.values())
    .filter((p) => p.connected)
    .map((p) => p.id);
  // Fisher-Yates 洗牌，決定固定的輪流順序
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }

  room.status = 'playing';
  room.turnOrder = playerIds;
  room.roundCount = computeRoundCount(playerIds.length);
  room.currentRoundIndex = -1;
  room.drawerIndex = -1;
  room.usedWordIds = new Set();
}

/**
 * 開始下一輪：決定畫圖者、抽出兩個候選題目（等畫圖者選一個）、清空畫布、時間開始跑
 * 輸入：房間、可用題庫（已依房間分類/難度篩選）
 * 輸出：本輪資訊（畫圖者、候選題目），或 null（沒有更多輪次或題庫已用完）
 * 邊界條件：
 *  - 候選題目數不足 2 個時，有幾個給幾個（至少 1 個才能開始這一輪）
 *  - 題庫完全用完（0 個候選）時回傳 null，呼叫端應視為比賽提前結束並轉為 finished
 *  - 選題期間計時已經開始（room.roundStartedAt 在這裡就設定），不是選定題目後才開始算，
 *    呼應「時間照跑」的設計：畫圖者猶豫選哪題也會消耗作答時間
 */
export function startNextRound(
  room: RoomState,
  wordBank: { id: string; text: string }[]
): { drawerPlayerId: string; roundIndex: number; wordOptions: WordOption[] } | null {
  if (room.currentRoundIndex + 1 >= room.roundCount) return null;

  const next = getNextDrawer(room.turnOrder, room.drawerIndex);
  if (!next) return null;

  const options = pickWordOptions(wordBank, room.usedWordIds, 2);
  if (options.length === 0) return null;

  room.drawerIndex = next.index;
  room.drawerPlayerId = next.playerId;
  room.currentRoundIndex += 1;
  room.currentWordId = null;
  room.currentWord = null;
  room.pendingWordOptions = options.map((w) => ({ id: w.id, text: w.text }));
  room.roundPhase = 'drawing';
  room.currentStrokes = [];
  room.roundStartedAt = Date.now();
  room.correctGuesses = [];

  return {
    drawerPlayerId: next.playerId,
    roundIndex: room.currentRoundIndex,
    wordOptions: room.pendingWordOptions,
  };
}

/**
 * 畫圖者從候選題目中選定一題
 * 輸入：房間、選題的玩家 id、選中的題目 id
 * 輸出：選定的題目文字，或 null（不是畫圖者本人選的／該 id 不在候選清單中／房間不在選題階段）
 */
export function chooseWord(room: RoomState, playerId: string, wordId: string): string | null {
  if (room.roundPhase !== 'drawing' || playerId !== room.drawerPlayerId) return null;
  const chosen = room.pendingWordOptions.find((w) => w.id === wordId);
  if (!chosen) return null;

  room.currentWordId = chosen.id;
  room.currentWord = chosen.text;
  room.usedWordIds.add(chosen.id);
  room.pendingWordOptions = [];
  return chosen.text;
}

/**
 * 時間到（或畫圖者中途離開）但還沒選題時的保底機制：自動選候選清單的第一個，
 * 確保這一輪一定有答案可以公布，不會卡在「沒有題目」的狀態
 * 輸出：自動選定的題目文字，或 null（早就選過了／根本沒有候選可選，理論上不會發生）
 */
export function autoPickPendingWordIfNeeded(room: RoomState): string | null {
  if (room.currentWord !== null) return null;
  const fallback = room.pendingWordOptions[0];
  if (!fallback) return null;

  room.currentWordId = fallback.id;
  room.currentWord = fallback.text;
  room.usedWordIds.add(fallback.id);
  room.pendingWordOptions = [];
  return fallback.text;
}

/**
 * 這一輪還需要幾個人猜對才算「全部猜完」：畫圖者之外，房間裡目前剩下的人數。
 * 斷線的人已經被 removePlayer 整個從名單移除（不再是「留著但標記離線」），
 * 所以這裡不需要再另外過濾連線狀態，room.players 裡的人本來就都是還在線上的。
 */
/**
 * 這一輪還需要幾個人猜對才算「全部猜完」：畫圖者之外，只算目前還連線著的人。
 * 中途斷線（處於緩衝期）的人不計入，理由：不然只要一個人正在緩衝期、還沒被真的
 * 移除，這一輪就永遠不會提前結束，剩下還在線上、都已經猜對的人只能乾等到逾時。
 */
function countGuessers(room: RoomState): number {
  return Array.from(room.players.values()).filter(
    (p) => p.id !== room.drawerPlayerId && p.connected
  ).length;
}

/**
 * 記錄一次猜中（搶答制：多人可以各自猜中，直到全部猜完或逾時才結束這一輪）
 * 輸入：房間、猜中的玩家 id
 * 輸出：{ points, allGuessed } — points 是這個人這次猜中拿到的分數；allGuessed 代表
 *      「除了畫圖者之外、目前還連線著的所有人」是不是都猜中了；或 null（不符合猜題
 *      條件，例如已經猜過、是畫圖者本人、房間不在 drawing 階段）
 * 邊界條件：同一個人在同一輪重複猜中不會重複計分（呼叫前應先由 chat handler 排除，
 *          這裡仍再檢查一次做防禦）
 */
/**
 * 記錄一次猜中（搶答制：多人可以各自猜中，直到全部猜完或逾時才結束這一輪）
 * 輸入：房間、猜中的玩家 id
 * 輸出：{ points, allGuessed } — points 是這個人這次猜中拿到的分數（依名次計算，
 *      跟猜多久無關）；allGuessed 代表「除了畫圖者之外的所有人」是不是都猜中了；
 *      或 null（不符合猜題條件，例如已經猜過、是畫圖者本人、房間不在 drawing 階段）
 * 邊界條件：同一個人在同一輪重複猜中不會重複計分（呼叫前應先由 chat handler 排除，
 *          這裡仍再檢查一次做防禦）
 */
export function recordCorrectGuess(
  room: RoomState,
  playerId: string
): { points: number; allGuessed: boolean } | null {
  if (room.roundPhase !== 'drawing' || room.currentWord === null) return null;
  if (playerId === room.drawerPlayerId) return null;
  if (room.correctGuesses.some((g) => g.playerId === playerId)) return null;

  const rank = room.correctGuesses.length + 1;
  const points = computeGuesserPointsByRank(rank);

  const player = room.players.get(playerId);
  if (player) player.score += points;
  room.correctGuesses.push({ playerId, points });

  const allGuessed = room.correctGuesses.length >= countGuessers(room);
  return { points, allGuessed };
}

export interface RoundEndResult {
  word: string;
  drawerPlayerId: string;
  correctGuesses: CorrectGuessRecord[];
  drawerPoints: number;
}

/**
 * 結束目前這一輪（全部人猜中、時間到、或畫圖者中途離開），順便結算畫圖者的分數
 * 輸出：本輪公布用資訊；若房間根本還沒選出題目（currentWord 為 null，理論上呼叫前
 *      應已透過 autoPickPendingWordIfNeeded 補上）則回傳 null
 *
 * 計分規則：
 *  - 猜中的人：各自依「這一輪第幾個猜對」拿 1~10 分（見 recordCorrectGuess／
 *    computeGuesserPointsByRank），猜中當下就已經計分，這裡不重複計算
 *  - 畫圖者：這輪每有一人猜中就加 DRAWER_POINTS_PER_GUESSER 分，猜中的人越多分數越高；
 *    沒人猜中（時間到流局，或畫圖者中途離開導致提前結束）則不給分
 */
export function endCurrentRound(room: RoomState): RoundEndResult | null {
  if (room.currentWord === null || room.drawerPlayerId === null) return null;
  room.roundPhase = 'roundEnd';

  const drawerPoints = room.correctGuesses.length * DRAWER_POINTS_PER_GUESSER;
  if (drawerPoints > 0) {
    const drawer = room.players.get(room.drawerPlayerId);
    if (drawer) drawer.score += drawerPoints;
  }

  return {
    word: room.currentWord,
    drawerPlayerId: room.drawerPlayerId,
    correctGuesses: [...room.correctGuesses],
    drawerPoints,
  };
}

export function isGameFinished(room: RoomState): boolean {
  return room.currentRoundIndex + 1 >= room.roundCount;
}

/**
 * 開新一場比賽前，把所有人的分數歸零。
 * 用於「一場比賽結束、公布名次後，自動開始下一場全新比賽」的循環：
 * 每一場都是獨立的競賽，分數不跨場累計，否則玩家一開始看到的名次就永遠追不上。
 */
export function resetScoresForNewMatch(room: RoomState): void {
  for (const player of room.players.values()) {
    player.score = 0;
  }
}

export function countConnectedPlayers(room: RoomState): number {
  return Array.from(room.players.values()).filter((p) => p.connected).length;
}

export function finishGame(room: RoomState): void {
  room.status = 'finished';
  room.roundPhase = null;
  room.currentWord = null;
  room.currentWordId = null;
  room.pendingWordOptions = [];
  room.drawerPlayerId = null;
  room.roundStartedAt = null;
  room.correctGuesses = [];
}

/**
 * 把房間重設回「剛建立房間」的狀態：分數歸零、輪流順序與回合資訊全部清空、狀態改回
 * lobby。用於「比賽因為連線人數不足而中途結束、且不會自動開新一場」的情境——與其讓
 * 房間卡在 finished 狀態走不出去（沒人能加入、也不會重啟），不如直接回到等待畫面，
 * 剩下的人可以繼續等其他人加入，房間就能繼續被使用，不用整個作廢重開一間。
 */
export function returnToLobby(room: RoomState): void {
  room.status = 'lobby';
  room.roundPhase = null;
  room.currentWord = null;
  room.currentWordId = null;
  room.pendingWordOptions = [];
  room.drawerPlayerId = null;
  room.roundStartedAt = null;
  room.correctGuesses = [];
  room.turnOrder = [];
  room.drawerIndex = -1;
  room.roundCount = 0;
  room.currentRoundIndex = 0;
  room.usedWordIds = new Set();
  room.telephone = null;
  room.fragment = null;
  for (const player of room.players.values()) {
    player.score = 0;
  }
}

export interface RoomSettingsPatch {
  roundDurationSec?: number;
  categoryFilter?: string[];
  difficultyFilter?: string[];
  telephoneFlow?: 'combined' | 'alternating';
}

/**
 * 修改房間設定（每輪限時、分類篩選、難度篩選、接龍流程）。
 * 輸入：房間、要求修改的玩家 id、要修改的欄位
 * 輸出：是否修改成功
 * 邊界條件：
 *  - 只有房主可以改，不是房主的請求直接拒絕
 *  - 只有房間還在 lobby 階段可以改，比賽進行中或已結束時修改設定沒有意義
 *    （進行中的比賽早就用當初的設定決定好題庫跟輪數了，中途改不會回頭套用）
 *  - roundDurationSec 限制在 15~180 秒之間，避免被亂改成 0 秒或幾小時這種不合理的值
 *  - telephoneFlow 只有 mode === 'DRAW_TELEPHONE' 才允許修改，其他模式的房間
 *    這個設定沒有意義，直接忽略這個欄位（不報錯，只是不生效），避免非接龍模式
 *    的房間莫名其妙帶著一個永遠用不到的設定被改動
 */
export function updateRoomSettings(
  room: RoomState,
  playerId: string,
  patch: RoomSettingsPatch
): boolean {
  if (room.status !== 'lobby') return false;
  if (playerId !== room.hostPlayerId) return false;

  if (patch.roundDurationSec !== undefined) {
    const clamped = Math.min(180, Math.max(15, Math.round(patch.roundDurationSec)));
    room.settings.roundDurationSec = clamped;
  }
  if (patch.categoryFilter !== undefined) {
    room.settings.categoryFilter = patch.categoryFilter.filter((c) => typeof c === 'string');
  }
  if (patch.difficultyFilter !== undefined) {
    room.settings.difficultyFilter = patch.difficultyFilter.filter((d) => typeof d === 'string');
  }
  if (patch.telephoneFlow !== undefined && room.settings.mode === 'DRAW_TELEPHONE') {
    room.settings.telephoneFlow = patch.telephoneFlow === 'alternating' ? 'alternating' : 'combined';
  }
  return true;
}

export function findRoomBySocketId(
  socketId: string
): { room: RoomState; playerId: string } | null {
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.socketId === socketId) {
        return { room, playerId: player.id };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DRAW_TELEPHONE 模式
// ---------------------------------------------------------------------------

export const TELEPHONE_MIN_PLAYERS = 3;

/**
 * 開始一場接龍：隨機排定順序、隨機抽一個題目給第一棒，狀態轉為 playing。
 * 輸入：房間、可用題庫（已依房間分類/難度篩選）
 * 輸出：{ firstPlayerId, word }，或 null（連線人數不足 3 人、或題庫是空的）
 * 邊界條件：只抽連線中的玩家排進接龍順序，理由跟 DRAW_GUESS 的 beginGame 一樣——
 *          排進去的人如果沒連線，輪到他時沒人能操作
 */
export function beginTelephoneGame(
  room: RoomState,
  wordBank: { id: string; text: string }[]
): { firstPlayerId: string; word: string } | null {
  const connectedIds = Array.from(room.players.values())
    .filter((p) => p.connected)
    .map((p) => p.id);
  if (connectedIds.length < TELEPHONE_MIN_PLAYERS) return null;

  const word = pickRandomWord(wordBank);
  if (!word) return null;

  const chainOrder = shuffleChainOrder(connectedIds);

  room.status = 'playing';
  room.telephone = {
    chainOrder,
    currentIndex: 0,
    subPhase: 'drawing', // 接龍第一棒只需要畫，不用猜（沒有前一棒可以猜）
    subPhaseStartedAt: Date.now(),
    revealed: false,
    originalWord: word,
    entries: [],
    pendingGuessText: null,
    currentStrokes: [],
    readyForNextRoundIds: new Set(),
  };

  return { firstPlayerId: chainOrder[0], word };
}

/**
 * 目前輪到的人送出對「前一棒的畫」的猜測。
 *
 * 'combined' 流程（原本唯一的玩法，這段邏輯完全不變）：所有玩家（含接龍最後一棒）
 * 都走同一套「先猜、再畫」——猜完一律進入 drawing 子階段，同一個人接著畫，
 * 是不是真的還有「下一位」交棒，留給 submitTelephoneDrawing 交出畫作之後才判斷。
 *
 * 'alternating' 流程（新玩法）：猜測本身就是這一位的完整回合，不會接著自己畫——
 * 直接產生一筆「純猜測」的 entry（strokes 給空陣列，guessText 是猜測文字本身，
 * 見 TelephoneEntry 的說明），然後直接推進到下一位，不像 combined 流程那樣把
 * 猜測暫存在 pendingGuessText、等同一個人畫完才一起打包成一筆 entry。
 *
 * 輸出：
 *  - null：不符合條件（不是他的回合、房間不是接龍模式、已經公布過了……）
 *  - { playerId; promptText }：'combined' 流程下，這個人接著要用 promptText 去畫；
 *    'alternating' 流程下，promptText 純粹回傳猜測內容本身供呼叫端記錄用途，
 *    呼叫端（telephoneOrchestrator 的 advanceTelephone）實際上只把回傳值當
 *    truthy/falsy 判斷用，不會解構讀取內容，接下來該對誰做什麼一律重新讀取
 *    room.telephone 的最新狀態決定，這裡回傳什麼形狀都不影響呼叫端的控制流程。
 *
 * 猜測文字統一裁切到 60 字、去除頭尾空白，避免整段貼上的內容把畫面撐爆；
 * 空字串一律視為「（空白）」，維持接龍鏈上每一棒都有內容可以往下傳。
 */
export function submitTelephoneGuess(
  room: RoomState,
  playerId: string,
  text: string
): { playerId: string; promptText: string } | null {
  const t = room.telephone;
  if (!t || t.revealed || t.subPhase !== 'guessing') return null;
  if (t.chainOrder[t.currentIndex] !== playerId) return null;

  const trimmed = text.trim().slice(0, 60) || '（空白）';

  if (room.settings.telephoneFlow === 'alternating') {
    const player = room.players.get(playerId);
    t.entries.push({
      playerId,
      displayName: player?.displayName ?? '離線玩家',
      strokes: [],
      guessText: trimmed,
    });
    t.currentStrokes = [];

    const presentIds = new Set(room.players.keys());
    const nextIndex = findNextActiveIndex(t.chainOrder, t.currentIndex, presentIds);

    if (nextIndex === null) {
      t.revealed = true;
      t.subPhase = null;
      t.subPhaseStartedAt = null;
      return { playerId, promptText: trimmed };
    }

    t.currentIndex = nextIndex;
    // 奇偶決定下一位是畫還是猜——用最終落點的 index 判斷（不是單純 +1），
    // 中途有人離線被跳過時依然正確：跟 beginTelephoneGame 給第一棒（index 0，
    // 偶數）'drawing' 的邏輯一致，偶數 index 畫、奇數 index 猜。
    t.subPhase = nextIndex % 2 === 0 ? 'drawing' : 'guessing';
    t.subPhaseStartedAt = Date.now();
    return { playerId, promptText: trimmed };
  }

  t.pendingGuessText = trimmed;
  t.subPhase = 'drawing';
  t.subPhaseStartedAt = Date.now();
  t.currentStrokes = [];
  return { playerId, promptText: trimmed };
}

/**
 * 目前輪到的人交出這一棒的畫作。
 *
 * 'combined' 流程（原本唯一的玩法，這段邏輯完全不變）：推進到下一位，下一位子階段
 * 一律是 guessing（接龍第一棒以外，每一位都是先猜再畫，包含接龍最後一棒——最後一棒
 * 猜完一樣要畫，畫完交出去之後才會因為「找不到下一位」而觸發公布階段）。
 *
 * 'alternating' 流程（新玩法）：這一位的回合到交出畫作就結束了，不會有猜測要
 * 一起打包（entry 的 guessText 保持 undefined，見 TelephoneEntry 的說明），
 * 推進到下一位時用奇偶決定對方是畫還是猜。
 *
 * 輸出：
 *  - null：不符合條件
 *  - { advanced: true; nextPlayerId }：正常推進到下一位
 *  - { advanced: false }：已經是接龍最後一棒交出畫作、或後面的人陸續都離開了找不到
 *    下一個還在房間裡的人，兩種情況都直接進入公布階段
 */
export function submitTelephoneDrawing(
  room: RoomState,
  playerId: string
): { advanced: true; nextPlayerId: string } | { advanced: false } | null {
  const t = room.telephone;
  if (!t || t.revealed || t.subPhase !== 'drawing') return null;
  if (t.chainOrder[t.currentIndex] !== playerId) return null;

  const isAlternating = room.settings.telephoneFlow === 'alternating';
  const player = room.players.get(playerId);
  t.entries.push({
    playerId,
    displayName: player?.displayName ?? '離線玩家',
    strokes: t.currentStrokes,
    guessText: isAlternating ? undefined : (t.pendingGuessText ?? undefined),
  });
  t.pendingGuessText = null;
  t.currentStrokes = [];

  const presentIds = new Set(room.players.keys());
  const nextIndex = findNextActiveIndex(t.chainOrder, t.currentIndex, presentIds);

  if (nextIndex === null) {
    t.revealed = true;
    t.subPhase = null;
    t.subPhaseStartedAt = null;
    return { advanced: false };
  }

  t.currentIndex = nextIndex;
  t.subPhase = isAlternating ? (nextIndex % 2 === 0 ? 'drawing' : 'guessing') : 'guessing';
  t.subPhaseStartedAt = Date.now();
  return { advanced: true, nextPlayerId: t.chainOrder[nextIndex] };
}

/**
 * 目前輪到的人逾時、或斷線緩衝期到期仍未回來時，自動代他送出一個空白內容
 * （guessing 子階段送「（沒有人猜）」；drawing 子階段直接交出目前累積到的筆畫，
 * 可能是空白畫布），確保接龍不會被卡住。回傳值跟被代打的那個動作
 * （submitTelephoneGuess 或 submitTelephoneDrawing）完全一致，呼叫端不需要另外分支處理。
 */
export function autoSubmitTelephoneTurn(
  room: RoomState
):
  | ReturnType<typeof submitTelephoneGuess>
  | ReturnType<typeof submitTelephoneDrawing>
  | null {
  const t = room.telephone;
  if (!t || t.revealed) return null;
  const activePlayerId = t.chainOrder[t.currentIndex];

  if (t.subPhase === 'guessing') {
    return submitTelephoneGuess(room, activePlayerId, '（沒有人猜）');
  }
  if (t.subPhase === 'drawing') {
    return submitTelephoneDrawing(room, activePlayerId);
  }
  return null;
}

/**
 * 檢查公布階段是不是所有「目前連線中」的玩家都已經投過「準備好下一場」的票，
 * 是的話直接呼叫 returnToLobby。拆成獨立函式的原因：這個檢查需要在兩個不同的
 * 時間點各自觸發——(1) 有人主動投票時（voteReadyForNextRound）、(2) 投票階段
 * 有人斷線被硬移除時（見 socketHandlers/room.ts 的 performRemoval）。第二種
 * 情況如果沒有重新檢查一次，會發生「原本 3 人差 1 票，那個沒投票的人自己先斷線
 * 被移除，剩下 2 人早就都投過票了，卻永遠等不到會自動觸發返回大廳的下一次投票」
 * 這種房間卡死的邊界情況——連線人數變少了，門檻也要跟著重新算一次。
 * 回傳是否真的觸發了 returnToLobby。
 */
export function checkTelephoneVotesAndMaybeReturn(room: RoomState): boolean {
  const t = room.telephone;
  if (!t || !t.revealed) return false;

  const connectedCount = countConnectedPlayers(room);
  const readyConnectedCount = Array.from(t.readyForNextRoundIds).filter(
    (id) => room.players.get(id)?.connected
  ).length;

  if (connectedCount > 0 && readyConnectedCount >= connectedCount) {
    returnToLobby(room);
    return true;
  }
  return false;
}

/**
 * 公布階段（作品列表）的「準備好下一場」投票。原本是只有房主能按一個按鈕直接
 * 返回大廳，改成每個人都要各自表態——這個函式只負責記錄這個人投了票，並判斷
 * 是不是所有目前連線中的玩家都投票了；真的都投齊了才會呼叫 returnToLobby，
 * 不是投了票就立刻返回。
 *
 * 輸入：房間、投票的玩家 id
 * 輸出：
 *  - null：不符合條件（房間不是接龍模式、還沒進入公布階段、房間已經回到 lobby
 *    了、這個玩家不在房間裡……），呼叫端據此判斷要不要廣播房間狀態
 *  - { allReady: boolean }：投票成功，allReady 代表這一票是不是剛好湊滿所有
 *    連線中的玩家（湊滿的話，這個函式內部已經呼叫過 returnToLobby，房間狀態
 *    已經是全新的 lobby 了，呼叫端不需要另外處理）
 *
 * 邊界條件：
 *  - 用「目前連線中」的人數當門檻，不是「接龍開始當下」的人數——公布階段可能
 *    有人已經離開了，門檻應該看現在還在的人，不然少一個人永久投不滿、房間卡死
 *    （這個門檻在有人斷線被移除時也會重新檢查一次，見 checkTelephoneVotesAndMaybeReturn）
 *  - 同一個人重複投票是安全的（Set 天生防重複），不會被算成兩票
 *  - 投票名單只在公布階段（revealed 為 true）才有意義，其餘任何時候呼叫都直接
 *    回傳 null，不會不小心把還沒開始猜/畫的接龍過程誤判成投票
 */
export function voteReadyForNextRound(room: RoomState, playerId: string): { allReady: boolean } | null {
  const t = room.telephone;
  if (!t || !t.revealed) return null;
  if (!room.players.has(playerId)) return null;

  t.readyForNextRoundIds.add(playerId);
  const allReady = checkTelephoneVotesAndMaybeReturn(room);
  return { allReady };
}

/* ============================================================================
 * FRAGMENT_DRAW 模式：兩人一組，起手自由畫滿整個畫布，系統隨機保留一半，
 * 補全者只能在空白那一半接續畫；全部組別畫完後，每一組的作品輪流給其他組
 * 所有人平行猜題；不計分，公布後跟接龍模式一樣用投票決定要不要開下一場。
 *
 * 跟 DRAW_TELEPHONE 最大的結構差異：接龍模式全房間共用「一條鏈、一個目前
 * 位置」，這個模式是「每一組各自獨立一份狀態、平行推進」——不用等其他組
 * 畫完，所以下面這些函式大多要先在 f.teams 裡找出「是哪一組、這個人在組裡
 * 是哪個角色」，不能像接龍模式那樣直接看一個全房間共用的 currentIndex。
 * ========================================================================== */

/**
 * lobby 階段點擊「加入」把自己移到指定組別。跟舊版「交換兩人位置」不同，這裡
 * 是單純「把自己移過去」，不影響原本在那個位置的其他人（開始遊戲前允許人數
 * 暫時不對稱，例如某組暫時 3 人、某組暫時 0 人，見 RoomState.fragmentTeamAssignment
 * 的說明）。房間裡任何人都可以呼叫（不限房主），呼應使用者需求「可以自由組隊」。
 * 輸出：是否移動成功
 *  - 不成功：不是 FRAGMENT_DRAW 模式、房間不在 lobby 階段、這個玩家不存在、
 *    或者他本來就已經在這個組別（見使用者需求「某玩家在該組那該玩家就不能
 *    點擊該組的 ICON」——前端會把這個情境的按鈕直接disable掉，這裡再做一次
 *    伺服器端驗證，避免略過前端限制直接呼叫事件）
 */
export function joinFragmentTeam(room: RoomState, playerId: string, teamNumber: number): boolean {
  if (room.settings.mode !== 'FRAGMENT_DRAW' || room.status !== 'lobby') return false;
  if (!room.players.has(playerId)) return false;
  if (room.fragmentTeamAssignment.get(playerId) === teamNumber) return false;

  room.fragmentTeamAssignment.set(playerId, teamNumber);
  return true;
}

/**
 * 開始整場比賽：驗證人數（至少 4 人、且必須是偶數才能兩兩成組）、依 lobby 裡
 * 排定的組隊順序（見 RoomState.fragmentTeamOrder，玩家可以自由調整，不是每次
 * 開始都重新隨機配對）兩兩成組、每組各自抽一個題目、初始化每一組的狀態。
 * 輸入：房間、題庫（依房間設定的分類/難度篩選過的）
 * 輸出：
 *  - null：人數不符合條件（少於 4 人，或人數是奇數湊不出整數組）、或題庫是空的
 *  - { teams: {teamId, firstPlayerId, word}[] }：每一組的起手玩家 id 跟題目，
 *    給呼叫端（fragmentOrchestrator）用來私訊通知每組的起手該畫什麼
 */
export function beginFragmentGame(
  room: RoomState,
  wordBank: { id: string; text: string }[]
): { teams: { teamId: string; firstPlayerId: string; word: string }[] } | null {
  // 依 fragmentTeamAssignment 把「目前連線中」的玩家依組別編號分組（Map 的
  // 迭代順序＝插入順序，同一組內先插入/最近一次改分組的順序自然決定了誰是
  // 「先加入這組的」，用這個順序決定組內兩人誰是起手、誰是補全，不需要另外
  // 記錄一個時間戳）。理論上每個連線中的玩家都應該已經有分組（見 joinRoom／
  // removePlayer 的維護邏輯），但保險起見，把任何「連線中卻沒有分組」的玩家
  // （理論上不會發生）視為驗證失敗，不要在開始遊戲這一刻意外把人排除在外
  // 導致組隊結果跟畫面顯示的不一致。
  const connectedIds = new Set(
    Array.from(room.players.values())
      .filter((p) => p.connected)
      .map((p) => p.id)
  );

  const teamGroups = new Map<number, string[]>();
  for (const [playerId, teamNumber] of room.fragmentTeamAssignment.entries()) {
    if (!connectedIds.has(playerId)) continue; // 已離線的人不列入驗證
    const group = teamGroups.get(teamNumber) ?? [];
    group.push(playerId);
    teamGroups.set(teamNumber, group);
  }

  const assignedCount = Array.from(teamGroups.values()).reduce((sum, g) => sum + g.length, 0);
  if (assignedCount !== connectedIds.size) return null; // 有連線中的人沒有分組，理論上不會發生，保守拒絕

  const teamNumbers = Array.from(teamGroups.keys()).sort((a, b) => a - b);
  if (teamNumbers.length < 2 || teamNumbers.length * 2 !== connectedIds.size) return null;
  // 每一組都必須剛好 2 人才能開始——這是使用者明確要求的卡控條件，任何一組
  // 人數不是 2（不管是 0、1、3 以上）都直接拒絕開始，不會有「湊合著開始」
  // 這種情況。
  for (const teamNumber of teamNumbers) {
    if (teamGroups.get(teamNumber)?.length !== 2) return null;
  }

  const pairs: [string, string][] = teamNumbers.map((teamNumber) => {
    const group = teamGroups.get(teamNumber)!;
    // 組內誰是起手、誰是補全是隨機決定的（使用者明確要求「進遊戲的作畫順序是
    // 隨機的」），不是照組隊當下的加入先後順序——不然「誰先點加入按鈕」會
    // 間接決定「誰要負責起手構圖」這種原本不該由使用者自己選的分工，隨機
    // 洗牌一次剛好打散這個關聯性。
    return Math.random() < 0.5 ? [group[0], group[1]] : [group[1], group[0]];
  });

  const words = pickWordsForTeams(wordBank, pairs.length);
  if (!words) return null;

  const teams: FragmentTeamState[] = pairs.map((playerIds, i) => ({
    id: `team-${i}`,
    playerIds,
    word: words[i],
    splitOrientation: 'vertical',
    firstDrawerStrokes: [],
    keptHalf: null,
    keptStrokes: [],
    secondDrawerStrokes: [],
    subPhase: 'drawing1',
    subPhaseStartedAt: Date.now(),
    guesses: new Map(),
  }));

  room.status = 'playing';
  room.fragment = {
    teams,
    guessingStarted: false,
    guessStartedAtByPlayer: new Map(),
    revealed: false,
    readyForNextRoundIds: new Set(),
  };

  return {
    teams: teams.map((t) => ({ teamId: t.id, firstPlayerId: t.playerIds[0], word: t.word })),
  };
}

/** 找出某個玩家目前所屬的組別，回傳組別狀態本身跟他在組裡的角色；不在任何進行中組別（不管是根本沒組、還是這組早就done了）回傳 null */
function findFragmentTeamByPlayer(
  room: RoomState,
  playerId: string
): { team: FragmentTeamState; role: 'first' | 'second' } | null {
  const f = room.fragment;
  if (!f) return null;
  for (const team of f.teams) {
    if (team.playerIds[0] === playerId) return { team, role: 'first' };
    if (team.playerIds[1] === playerId) return { team, role: 'second' };
  }
  return null;
}

/**
 * 找出這個玩家「現在」是不是正輪到他畫（不管是起手還是補全），是的話回傳他
 * 目前該寫入的筆畫緩衝區，以及（只有補全階段才有意義的）隊友的 socketId——
 * 補全階段隊友可以即時看到補全過程，見模組開頭的說明。給 socketHandlers/stroke.ts
 * 用來判斷筆畫事件要不要收下、要轉發給誰。
 */
export function getFragmentActiveDrawContext(
  room: RoomState,
  playerId: string
): { team: FragmentTeamState; buffer: Stroke[]; watcherSocketId: string | null } | null {
  const found = findFragmentTeamByPlayer(room, playerId);
  if (!found) return null;
  const { team, role } = found;
  if (role === 'first' && team.subPhase === 'drawing1') {
    // 起手作畫中：沒有人在看（見模組開頭「後一位看不到前一位的繪畫過程」的說明）
    return { team, buffer: team.firstDrawerStrokes, watcherSocketId: null };
  }
  if (role === 'second' && team.subPhase === 'drawing2') {
    // 補全作畫中：起手（隊友）可以即時看到，見「此時第一位看的到繪畫過程」的需求
    const teammateSocketId = room.players.get(team.playerIds[0])?.socketId ?? null;
    return { team, buffer: team.secondDrawerStrokes, watcherSocketId: teammateSocketId };
  }
  return null;
}

/**
 * 起手作畫中，切換畫布切割方向（左右切／上下切）。切換會清空目前畫的內容——
 * 切完方向、原本畫的東西可能跨到另一半去了，留著沒有意義，乾脆清空重畫比較
 * 不會混亂（見 FragmentSplitOrientation 型別定義的說明）。
 * 輸出：切換是否成功（不成功：不是這個人的起手回合、或這一組根本不存在）
 */
export function setFragmentOrientation(
  room: RoomState,
  playerId: string,
  orientation: FragmentSplitOrientation
): boolean {
  const found = findFragmentTeamByPlayer(room, playerId);
  if (!found || found.role !== 'first' || found.team.subPhase !== 'drawing1') return false;
  found.team.splitOrientation = orientation;
  found.team.firstDrawerStrokes = [];
  return true;
}

/**
 * 起手交出這一組的作品：隨機決定保留哪一半，篩選出保留下來的筆畫，推進這一組
 * 進入補全階段。跟 DRAW_TELEPHONE 的 submitTelephoneDrawing 不同，這裡不會
 * 影響其他組——每一組各自獨立推進，這一組交卷不會讓任何其他組跟著動。
 * 輸出：null（不符合條件）或 { teamId, secondPlayerId, word, keptHalf,
 * splitOrientation, keptStrokes }，呼叫端用這些資訊私訊通知補全者該做什麼
 */
export function submitFragmentDrawing1(
  room: RoomState,
  playerId: string
): {
  teamId: string;
  secondPlayerId: string;
  word: string;
  keptHalf: FragmentHalf;
  splitOrientation: FragmentSplitOrientation;
  keptStrokes: Stroke[];
} | null {
  const found = findFragmentTeamByPlayer(room, playerId);
  if (!found || found.role !== 'first' || found.team.subPhase !== 'drawing1') return null;
  const { team } = found;

  const keptHalf = pickRandomHalf();
  team.keptHalf = keptHalf;
  team.keptStrokes = filterStrokesByHalf(team.firstDrawerStrokes, team.splitOrientation, keptHalf);
  team.firstDrawerStrokes = [];
  team.subPhase = 'drawing2';
  team.subPhaseStartedAt = Date.now();

  // 連鎖檢查：如果補全者這時候已經不在房間裡了（例如他比起手更早離開），
  // 沒有人可以進行補全，直接讓這一組以「補全空白」的狀態完成，不要卡在
  // drawing2 子階段等一個不會再回來的人——呼叫端（fragmentOrchestrator 的
  // sendFragmentDrawing2Turn）內部本來就有 `team.subPhase !== 'drawing2'` 的
  // 檢查，這裡改成 'done' 之後會自動跳過私訊通知，不會發生通知一個空氣的情況，
  // 呼叫端只需要照常檢查 allTeamsDone 就會正確把這一組算進去。
  if (!room.players.has(team.playerIds[1])) {
    team.subPhase = 'done';
    team.subPhaseStartedAt = null;
  }

  return {
    teamId: team.id,
    secondPlayerId: team.playerIds[1],
    word: team.word,
    keptHalf,
    splitOrientation: team.splitOrientation,
    keptStrokes: team.keptStrokes,
  };
}

/**
 * 補全交出這一組的作品：這一組正式進入 'done'。跟接龍模式不同，這裡不會直接
 * 觸發下一步——因為其他組可能還在畫，要所有組都到齊 'done' 才能開始猜題階段
 * （見 maybeStartFragmentGuessPhase）。
 * 輸出：null（不符合條件）或 { teamId; allTeamsDone: boolean }，
 * allTeamsDone 代表這一組交卷之後，是不是全部組別都已經畫完了——呼叫端據此
 * 決定要不要接著呼叫 maybeStartFragmentGuessPhase 進入猜題階段。
 */
export function submitFragmentDrawing2(
  room: RoomState,
  playerId: string
): { teamId: string; allTeamsDone: boolean } | null {
  const found = findFragmentTeamByPlayer(room, playerId);
  if (!found || found.role !== 'second' || found.team.subPhase !== 'drawing2') return null;
  const { team } = found;

  team.subPhase = 'done';
  team.subPhaseStartedAt = null;

  const f = room.fragment;
  const allTeamsDone = f !== null && f.teams.every((t) => t.subPhase === 'done');
  return { teamId: team.id, allTeamsDone };
}

/**
 * 所有組別都畫完後，正式開始猜題階段。跟舊版不同，這裡不會指定「從第幾組
 * 開始」——每個人現在該猜哪一組是動態算出來的（見 findNextTeamToGuessForPlayer），
 * 這個函式只需要把 guessingStarted 標記成 true，讓 findNextTeamToGuessForPlayer
 * 的判斷條件成立即可。只有在真的所有組都 'done' 時才會生效，呼叫端
 * （fragmentOrchestrator）要先確認 submitFragmentDrawing2 回傳的 allTeamsDone
 * 是 true 才呼叫這個函式，這裡不重複檢查（避免兩處邏輯各自判斷一次容易漏改
 * 其中一處）。
 */
export function maybeStartFragmentGuessPhase(room: RoomState): void {
  const f = room.fragment;
  if (!f || f.teams.length === 0) return;
  f.guessingStarted = true;
}

/**
 * 找出這個玩家「現在該猜哪一組」——依 teams 陣列順序，找第一個「不是自己組、
 * 自己還沒對它留下猜測紀錄」的組別。這是整個「玩家各自依自己節奏推進」設計
 * 的核心：不需要另外維護一個「這個人目前進度到第幾組」的欄位，直接檢查
 * teams 裡每一組的 guesses Map 有沒有這個玩家的紀錄，天生就是「這個人猜過
 * 哪些組」的真實紀錄，用它反推「還沒猜的第一組是誰」不會有額外狀態要同步、
 * 不會有跟 guesses 本身對不上的風險。
 * 輸出：null 代表這個人已經把所有該猜的組別（不含自己組）都猜完了。
 */
function findNextTeamToGuessForPlayer(f: FragmentState, playerId: string): FragmentTeamState | null {
  for (const team of f.teams) {
    if (team.playerIds.includes(playerId)) continue; // 自己組的作品不用猜
    if (!team.guesses.has(playerId)) return team;
  }
  return null;
}

/**
 * 檢查是不是「所有連線中的玩家」都已經把該猜的組別全部猜完了——猜題階段
 * 結束的條件不是「所有組別都被猜過」（人數一多，達成這個條件的時間點反而
 * 比較晚），是「所有連線中的玩家自己都沒有下一組要猜了」，跟
 * findNextTeamToGuessForPlayer 是同一套判斷邏輯、只是換成檢查全房間。
 */
function allConnectedPlayersFinishedGuessing(room: RoomState, f: FragmentState): boolean {
  for (const player of room.players.values()) {
    if (!player.connected) continue;
    if (findNextTeamToGuessForPlayer(f, player.id) !== null) return false;
  }
  return true;
}

/**
 * 某位玩家對「他現在該猜的那一組」送出猜測。跟舊版最大的差異：不再是「全
 * 房間共用同一組在被猜」，每個人各自往自己的猜題序列前進，互不等待。
 *
 * 輸出：
 *  - null：不符合條件（猜題階段還沒開始、已經公布過了、這個人已經沒有
 *    下一組要猜了……）
 *  - { teamId; hasNextTeam; allPlayersDone }：
 *    - teamId：剛剛猜的是哪一組
 *    - hasNextTeam：這個人猜完這一組之後，還有沒有下一組要猜（有的話
 *      呼叫端要接著私訊通知他下一組是什麼；沒有的話這個人就進入「等待
 *      其他人猜完」的狀態）
 *    - allPlayersDone：這一票是不是剛好讓「所有連線中的玩家」都猜完了
 *      該猜的組別——呼叫端據此決定要不要正式進入公布階段
 *
 * 猜測文字統一裁切到 60 字、去除頭尾空白，避免整段貼上的內容把畫面撐爆；
 * 空字串一律視為「（空白）」。
 */
export function submitFragmentGuess(
  room: RoomState,
  playerId: string,
  text: string
): { teamId: string; hasNextTeam: boolean; allPlayersDone: boolean } | null {
  const f = room.fragment;
  if (!f || !f.guessingStarted || f.revealed) return null;
  const player = room.players.get(playerId);
  if (!player || !player.connected) return null;

  const team = findNextTeamToGuessForPlayer(f, playerId);
  if (!team) return null; // 這個人已經猜完了，不該再收到猜題請求

  const trimmed = text.trim().slice(0, 60) || '（空白）';
  team.guesses.set(playerId, { displayName: player.displayName, text: trimmed });

  const nextTeam = findNextTeamToGuessForPlayer(f, playerId);
  if (nextTeam) {
    f.guessStartedAtByPlayer.set(playerId, Date.now());
  } else {
    f.guessStartedAtByPlayer.delete(playerId);
  }

  return { teamId: team.id, hasNextTeam: nextTeam !== null, allPlayersDone: allConnectedPlayersFinishedGuessing(room, f) };
}

/**
 * 檢查是不是所有連線中的玩家都已經猜完了，是的話正式進入公布階段
 * （revealed = true）。這個檢查需要在兩個不同時間點各自觸發——(1) 有人送出
 * 猜測、剛好讓自己沒有下一組要猜時（見 submitFragmentGuess 回傳的
 * allPlayersDone）、(2) 還在猜題階段的玩家斷線被硬移除時（見
 * socketHandlers/room.ts 的 performRemoval）——第二種情況如果沒有重新檢查
 * 一次，會發生「還差最後一人的猜測，那個人自己先斷線被移除，其他人早就
 * 都猜完了，卻永遠不會有下一次投票觸發公布」這種房間卡住的邊界情況，跟
 * DRAW_TELEPHONE 模式「準備好下一場」投票的 checkTelephoneVotesAndMaybeReturn
 * 是同一種設計考量。
 * 輸出：是否真的觸發了公布。
 */
export function finishFragmentGuessingIfAllDone(room: RoomState): boolean {
  const f = room.fragment;
  if (!f || !f.guessingStarted || f.revealed) return false;
  if (!allConnectedPlayersFinishedGuessing(room, f)) return false;
  f.revealed = true;
  f.guessStartedAtByPlayer.clear();
  return true;
}

/**
 * 逾時保底：某位玩家「目前正在猜的那一組」時間到了，自動幫他送出空白猜測
 * （「（沒有人猜）」），推進到他自己的下一組（如果有的話）——不這樣做的話，
 * 有人只要不猜就能讓整個房間永遠卡在猜題階段進不了公布，跟接龍模式逾時
 * 自動代打的設計理由一致。內部直接重用 submitFragmentGuess 的邏輯，不需要
 * 另外寫一份幾乎一樣的程式碼。
 */
export function autoSubmitFragmentGuessForPlayer(
  room: RoomState,
  playerId: string
): { teamId: string; hasNextTeam: boolean; allPlayersDone: boolean } | null {
  return submitFragmentGuess(room, playerId, '（沒有人猜）');
}

/**
 * 逾時保底機制，統稱處理三種情境（呼叫端依當下情境呼叫對應的動作）：
 *  - 起手逾時還沒交卷：直接代他交出目前累積的內容（可能是空白畫布）
 *  - 補全逾時還沒交卷：同上
 *  - 目前在猜題的那一組時間到：不需要「代猜」，猜題本來就是「猜了算、沒猜就
 *    沒有」，直接呼叫 advanceFragmentGuessTeam 推進到下一組即可，不需要
 *    另外補一個「自動猜測」的動作
 * 這裡只處理前兩種（畫畫逾時的代打），猜題逾時的推進呼叫端直接呼叫
 * advanceFragmentGuessTeam，不需要經過這個函式。
 */
export function autoSubmitFragmentDrawing(
  room: RoomState,
  teamId: string
): { kind: 'drawing1' | 'drawing2'; teamId: string } | null {
  const f = room.fragment;
  const team = f?.teams.find((t) => t.id === teamId);
  if (!f || !team) return null;

  if (team.subPhase === 'drawing1') {
    submitFragmentDrawing1(room, team.playerIds[0]);
    return { kind: 'drawing1', teamId };
  }
  if (team.subPhase === 'drawing2') {
    submitFragmentDrawing2(room, team.playerIds[1]);
    return { kind: 'drawing2', teamId };
  }
  return null;
}

/**
 * 檢查是不是所有「目前連線中」的玩家都已經投過「準備好下一場」的票，是的話
 * 直接呼叫 returnToLobby。設計理由、拆成獨立函式的原因，都跟 DRAW_TELEPHONE
 * 模式的 checkTelephoneVotesAndMaybeReturn 完全一致（見那邊的說明），這個
 * 模式沿用同一套投票機制，只是換一個欄位（room.fragment 而不是 room.telephone）。
 */
export function checkFragmentVotesAndMaybeReturn(room: RoomState): boolean {
  const f = room.fragment;
  if (!f || !f.revealed) return false;

  const connectedCount = countConnectedPlayers(room);
  const readyConnectedCount = Array.from(f.readyForNextRoundIds).filter(
    (id) => room.players.get(id)?.connected
  ).length;

  if (connectedCount > 0 && readyConnectedCount >= connectedCount) {
    returnToLobby(room);
    return true;
  }
  return false;
}

export function voteReadyForNextFragmentRound(room: RoomState, playerId: string): { allReady: boolean } | null {
  const f = room.fragment;
  if (!f || !f.revealed) return null;
  if (!room.players.has(playerId)) return null;

  f.readyForNextRoundIds.add(playerId);
  const allReady = checkFragmentVotesAndMaybeReturn(room);
  return { allReady };
}

/**
 * 補全者送出的一個畫布座標點，是不是真的落在允許他畫的範圍內——伺服器端要做
 * 這層驗證，不能只靠前端畫布限制指標事件，見 fragmentEngine.ts 的
 * isPointInAllowedHalf 說明。給 socketHandlers/stroke.ts 在收到補全者的
 * stroke:start／stroke:points 時呼叫。
 */
export function isFragmentPointAllowed(team: FragmentTeamState, point: StrokePoint): boolean {
  if (team.keptHalf === null) return true; // 理論上不會發生（drawing2 階段一定已經有 keptHalf），保守放行
  return isPointInAllowedHalf(point, team.splitOrientation, team.keptHalf);
}

/**
 * 玩家被硬移除（斷線緩衝期到期）時，處理他所屬的 FRAGMENT_DRAW 組別。跟
 * DRAW_TELEPHONE 只需要判斷「是不是他的回合」不同，這個模式的複雜之處在於：
 * 就算現在不是他的回合，他的離開也可能讓「未來」某個時間點卡住（例如補全者
 * 提早離開，等起手畫完準備交棒時才發現補全者已經不在了）。
 *
 * 統一在這裡處理四種情境：
 *  - 他是起手，正在畫（drawing1）：直接代他交出目前累積的內容，正常推進到
 *    drawing2；如果補全者（team.playerIds[1]）自己也已經不在了，
 *    submitFragmentDrawing1 內部會連鎖處理成 'done'，這裡不需要再檢查一次。
 *  - 他是補全，正在畫（drawing2）：直接代他交出目前累積的內容，這一組變成 'done'。
 *  - 他是起手，但這一組已經進入 drawing2 階段（他只是隊友身分在旁邊看）：
 *    不影響進度，不需要做任何事。
 *  - 他是補全，但這一組還在 drawing1 階段（還沒輪到他）：不需要現在做任何事，
 *    等 drawing1 真的交出來、要進 drawing2 時，submitFragmentDrawing1 內部
 *    會自動檢查接手人選還在不在，不在的話直接連鎖完成整組（見上面的說明）。
 * 輸出：null（這個人不屬於任何 FRAGMENT_DRAW 組別、或這個模式根本不是
 * FRAGMENT_DRAW）；否則回傳受影響的組別 id，呼叫端（socketHandlers/room.ts）
 * 據此決定要不要進一步廣播、通知補全者、檢查是不是全部組別都到齊該進入猜題階段。
 */
export function handleFragmentPlayerRemoval(room: RoomState, playerId: string): { teamId: string } | null {
  if (room.settings.mode !== 'FRAGMENT_DRAW') return null;
  const found = findFragmentTeamByPlayer(room, playerId);
  if (!found) return null;
  const { team, role } = found;
  if (team.subPhase === 'done') return null;

  if (role === 'first' && team.subPhase === 'drawing1') {
    submitFragmentDrawing1(room, playerId);
  } else if (role === 'second' && team.subPhase === 'drawing2') {
    submitFragmentDrawing2(room, playerId);
  }
  // 其餘兩種情境（起手在 drawing2 旁觀、補全還沒輪到）不需要現在做任何事，
  // 交給 submitFragmentDrawing1 內部的連鎖檢查處理（見上面的函式說明）。

  return { teamId: team.id };
}
