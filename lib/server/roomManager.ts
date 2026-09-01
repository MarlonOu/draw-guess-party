import type {
  RoomPlayer,
  RoomSettings,
  RoomSummary,
  RoomStatus,
  RoundPhase,
  TelephoneSummary,
} from '../types/room';
import type { Stroke } from '../types/stroke';
import {
  shuffleChainOrder,
  pickRandomWord,
  findNextActiveIndex,
} from '../engine/telephoneEngine';
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
  };
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
  for (const player of room.players.values()) {
    player.score = 0;
  }
}

export interface RoomSettingsPatch {
  roundDurationSec?: number;
  categoryFilter?: string[];
  difficultyFilter?: string[];
}

/**
 * 修改房間設定（每輪限時、分類篩選、難度篩選）。
 * 輸入：房間、要求修改的玩家 id、要修改的欄位
 * 輸出：是否修改成功
 * 邊界條件：
 *  - 只有房主可以改，不是房主的請求直接拒絕
 *  - 只有房間還在 lobby 階段可以改，比賽進行中或已結束時修改設定沒有意義
 *    （進行中的比賽早就用當初的設定決定好題庫跟輪數了，中途改不會回頭套用）
 *  - roundDurationSec 限制在 15~180 秒之間，避免被亂改成 0 秒或幾小時這種不合理的值
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
  };

  return { firstPlayerId: chainOrder[0], word };
}

/**
 * 目前輪到的人送出對「前一棒的畫」的猜測。所有玩家（含接龍最後一棒）都走同一套
 * 「先猜、再畫」流程，不再有「最後一棒只猜不畫」的特例——猜完一律進入作畫階段，
 * 是不是真的還有「下一位」交棒，留給 submitTelephoneDrawing 交出畫作之後才判斷。
 * 輸出：
 *  - null：不符合條件（不是他的回合、房間不是接龍模式、已經公布過了……）
 *  - { playerId; promptText }：這個人接著要用自己剛才的猜測文字（promptText）去畫
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
  t.pendingGuessText = trimmed;
  t.subPhase = 'drawing';
  t.subPhaseStartedAt = Date.now();
  t.currentStrokes = [];
  return { playerId, promptText: trimmed };
}

/**
 * 目前輪到的人交出這一棒的畫作，推進到接龍下一位。
 * 輸出：
 *  - null：不符合條件
 *  - { advanced: true; nextPlayerId }：正常推進到下一位，下一位子階段一律是 guessing
 *    （接龍第一棒以外，每一位都是先猜再畫，包含接龍最後一棒——最後一棒猜完一樣要畫，
 *    畫完交出去之後才會因為「找不到下一位」而觸發下面的公布階段）
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

  const player = room.players.get(playerId);
  t.entries.push({
    playerId,
    displayName: player?.displayName ?? '離線玩家',
    strokes: t.currentStrokes,
    guessText: t.pendingGuessText ?? undefined,
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
  t.subPhase = 'guessing';
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
