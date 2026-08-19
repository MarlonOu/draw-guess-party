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

export interface RoomSummary {
  joinCode: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: RoomPlayer[];
  currentRoundIndex: number;
  roundCount: number;
  roundPhase: RoundPhase | null;
  drawerPlayerId: string | null;
  /** 下一位輪到畫圖的玩家 id；比賽尚未開始（turnOrder 還沒決定）時為 null */
  nextDrawerPlayerId: string | null;
  /**
   * 本輪畫圖者是否已經選定題目。不曝露題目內容本身（那是私訊給畫圖者的），
   * 只給一個布林值，讓其他玩家的畫布知道現在是「等對方選題」還是「對方已經在畫了」。
   */
  wordChosen: boolean;
  /** 這一題目前已經猜對的玩家 id（依猜對先後排序），round 開始時清空 */
  correctGuesserIds: string[];
}
