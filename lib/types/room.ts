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
}

/** DRAW_TELEPHONE 模式：接龍裡已經完成的一棒。 */
export interface TelephoneEntry {
  playerId: string;
  displayName: string;
  strokes: import('./stroke').Stroke[];
  /** 這一棒的人對「上一棒的畫」給出的猜測文字；第一棒（拿到原始題目的人）沒有這個欄位 */
  guessText?: string;
}

/**
 * DRAW_TELEPHONE 模式：整條接龍結束後的完整公布內容。
 * 沒有獨立的「最終猜測」欄位——現在所有玩家（含接龍最後一棒）都是「先猜再畫」，
 * 最後一棒的猜測就是 entries 陣列最後一筆的 guessText，跟其他棒次同一套結構，
 * 不需要另外特例處理。
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
