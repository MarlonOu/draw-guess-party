export type GameMode = 'DRAW_GUESS' | 'FRAGMENT_DRAW' | 'DRAW_TELEPHONE';
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type RoundPhase = 'drawing' | 'roundEnd';

export interface RoomPlayer {
  id: string;
  displayName: string;
  score: number;
  connected: boolean;
}

export interface RoomSettings {
  mode: GameMode;
  roundDurationSec: number;
  categoryFilter: string[];
  difficultyFilter: string[];
  /**
   * 只有 mode === 'DRAW_TELEPHONE' 時才有意義，其餘模式忽略這個欄位。
   *  - 'combined'（預設，即原本唯一的玩法）：除了第一棒（沒有前一棒可猜）以外，
   *    每一位都是「先猜前一棒的畫、再畫下自己的猜測」，猜跟畫是同一個人在同一次
   *    輪到自己時連續完成，一棒＝一次「猜+畫」。
   *  - 'alternating'（新玩法，用來解決人數過多時每一棒都要「猜+畫」導致總時長
   *    過長的問題）：猜跟畫拆給不同人做，接龍順序裡奇數位（第1、3、5...棒）只畫、
   *    偶數位（第2、4、6...棒）只猜（猜的對象一樣是「上一位畫的」），沒有人需要
   *    在同一次輪到自己時同時做兩件事，總棒數雖然不變，但每一棒只需要做一半的事，
   *    整場遊戲的總時長可以壓在原本「猜+畫」流程的一半左右。
   */
  telephoneFlow: 'combined' | 'alternating';
}

/**
 * DRAW_TELEPHONE 模式：接龍裡已經完成的一棒。
 *
 * 'combined' 流程（見 RoomSettings.telephoneFlow）：strokes 一定有內容（唯一例外是
 * 玩家逾時/斷線被自動代打交出空白畫布），guessText 除了第一棒以外都會有值
 * （這個人對上一棒的猜測，接著才畫下這個猜測）。
 *
 * 'alternating' 流程：猜跟畫拆成兩種不同性質的 entry，靠 strokes 是否為空陣列來
 * 分辨是哪一種——
 *  - 畫的 entry：strokes 有內容，guessText 是 undefined
 *  - 猜的 entry：strokes 是空陣列 []，guessText 有內容（猜測文字本身）
 * 前端畫廊渲染時要依此分開處理，不能假設每個 entry 都同時有畫布內容可以顯示。
 */
export interface TelephoneEntry {
  playerId: string;
  displayName: string;
  strokes: import('./stroke').Stroke[];
  /** 這一棒的人對「上一棒的畫」給出的猜測文字；第一棒（拿到原始題目的人）沒有這個欄位 */
  guessText?: string;
}

/**
 * DRAW_TELEPHONE 模式：整條接龍結束後的完整公布內容。
 * 'combined' 流程沒有獨立的「最終猜測」欄位——所有玩家（含接龍最後一棒）都是
 * 「先猜再畫」，最後一棒的猜測就是 entries 陣列最後一筆的 guessText，跟其他棒次
 * 同一套結構，不需要另外特例處理。'alternating' 流程則是猜跟畫各自獨立成一筆
 * entry（見 TelephoneEntry 的說明），entries 長度固定等於接龍人數，跟 'combined'
 * 流程一致，只是內容組成方式不同。
 */
export interface TelephoneReveal {
  originalWord: string;
  entries: TelephoneEntry[];
}

/**
 * DRAW_TELEPHONE 模式的公開狀態摘要：不曝露任何「內容」（畫布筆畫、猜測文字），
 * 那些只透過私訊給當事人，其他人在 reveal 之前完全看不到——這是「傳話接龍」
 * 這個玩法的核心：中途誰都不該偷看到別人畫了/猜了什麼，只有輪到自己時才看得到
 * 「前一棒的畫」，一直到最後才整條攤開公布。
 */
export interface TelephoneSummary {
  /** 依隨機順序排列的整條接龍玩家 id */
  chainOrder: string[];
  /** 目前輪到 chainOrder 的第幾位（0 起算） */
  currentIndex: number;
  /** 目前這一位在接龍裡的子階段：guessing（先看前一棒的畫、寫下猜測）或 drawing（畫自己的猜測） */
  subPhase: 'guessing' | 'drawing' | null;
  /** 目前輪到誰，null 代表比賽尚未開始或已經進入 reveal */
  activePlayerId: string | null;
  /**
   * 目前這個子階段（猜測或作畫）開始的時間戳（epoch ms），null 代表沒有正在進行
   * 的子階段。廣播給全房間所有人（不是只有正在動作的那個人），讓旁觀者也能算出
   * 跟當事人同步的剩餘時間倒數——猜測/作畫各自的限時秒數是固定常數
   * （見 lib/shared/telephoneConstants.ts），前端用 `Date.now() - subPhaseStartedAt`
   * 換算經過的時間，全房間的人都能用同一個時間戳算出一致的倒數，不需要伺服器
   * 每秒推播一次剩餘秒數。
   */
  subPhaseStartedAt: number | null;
  /** 已經完成的棒數（不含還在進行中的這一棒） */
  completedCount: number;
  /** 整條接龍會有幾位玩家（等於比賽開始當下的連線人數） */
  totalPlayers: number;
  /** 只有進入公布階段才非 null */
  reveal: TelephoneReveal | null;
  /**
   * 公布階段（作品列表）的「準備好下一場」投票名單，只有 reveal 非 null 時才有
   * 意義。原本是只有房主能按一個按鈕直接返回大廳，改成每個人都要各自投票表態，
   * 等目前連線中的所有玩家都投票了才會自動返回大廳。前端用這個陣列的長度跟
   * players 裡連線中的人數比對，顯示「X / Y 人已準備」的進度。
   */
  readyForNextRoundIds: string[];
}

export interface RoomSummary {
  joinCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: RoomPlayer[];
  currentRoundIndex: number;
  roundCount: number;
  roundPhase: RoundPhase | null;
  drawerPlayerId: string | null;
  /**
   * 目前的房主，只有這個人可以修改房間設定（分類、難度、每輪限時）、
   * 以及在比賽結束畫面選擇「先不要自動開始下一場」。不影響「開始遊戲」按鈕——
   * 那個任何人都能按，房主身分只管房間設定這一塊。房主離開房間時會自動從
   * 剩下的人裡隨機挑一位頂替，房間不會因此變成沒有房主。
   */
  hostPlayerId: string | null;
  /** 下一位輪到畫圖的玩家 id；比賽尚未開始（turnOrder 還沒決定）時為 null */
  nextDrawerPlayerId: string | null;
  /**
   * 本輪畫圖者是否已經選定題目。不曝露題目內容本身（那是私訊給畫圖者的），
   * 只給一個布林值，讓其他玩家的畫布知道現在是「等對方選題」還是「對方已經在畫了」。
   */
  wordChosen: boolean;
  /** 這一題目前已經猜對的玩家 id（依猜對先後排序），round 開始時清空 */
  correctGuesserIds: string[];
  /** 只有 mode === 'DRAW_TELEPHONE' 時才有意義，其餘模式固定為 null */
  telephone: TelephoneSummary | null;
}
