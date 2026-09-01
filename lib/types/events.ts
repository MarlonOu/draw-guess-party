import type { RoomPlayer, RoomSummary, TelephoneReveal } from './room';
import type { Stroke, StrokePoint } from './stroke';
import type { GuessMessage } from './round';

export interface WordOption {
  id: string;
  text: string;
}

/** Client -> Server */
export interface ClientToServerEvents {
  'room:join': (payload: { joinCode: string; displayName: string; playerId?: string }) => void;
  'room:leave': () => void;
  'room:start': () => void;
  /** 只有房主的請求會生效，其他人的請求伺服器直接忽略（不特別回錯誤，避免洩漏誰是房主的猜測空間有意義的訊號） */
  'room:updateSettings': (payload: {
    roundDurationSec?: number;
    categoryFilter?: string[];
    difficultyFilter?: string[];
  }) => void;
  /** 比賽結束畫面，房主選擇「先不要自動開始下一場」，改回 lobby 讓大家調整設定 */
  'room:cancelAutoRestart': () => void;
  /** 畫圖者從 round:start 私訊拿到的兩個候選題目中選一個 */
  'round:chooseWord': (payload: { wordId: string }) => void;

  'stroke:start': (payload: {
    strokeId: string;
    color: string;
    width: number;
    tool: 'pen' | 'eraser';
    point: StrokePoint;
  }) => void;
  'stroke:points': (payload: { strokeId: string; points: StrokePoint[] }) => void;
  'stroke:end': (payload: { strokeId: string }) => void;
  'canvas:clear': () => void;
  'canvas:undo': () => void;

  'chat:message': (payload: { text: string }) => void;

  /** DRAW_TELEPHONE 模式：輪到自己時，先送出對「上一棒的畫」的猜測文字 */
  'telephone:submitGuess': (payload: { text: string }) => void;
  /** DRAW_TELEPHONE 模式：輪到自己畫的時候，畫完按下「交給下一位」，沒有額外資料——
   *  這一棒的筆畫資料伺服器早就透過 stroke:start/points/end 即時收著了 */
  'telephone:submitDrawing': () => void;
}

/** Server -> Client */
export interface ServerToClientEvents {
  'room:state': (payload: RoomSummary) => void;
  'room:playerListUpdated': (payload: { players: RoomPlayer[] }) => void;
  'room:error': (payload: { message: string }) => void;
  /** 私訊 ack：只送給剛加入成功的那個 socket，讓 client 知道自己被指派的 playerId */
  'room:joined': (payload: { playerId: string }) => void;

  'stroke:start': (payload: {
    strokeId: string;
    playerId: string;
    color: string;
    width: number;
    tool: 'pen' | 'eraser';
    point: StrokePoint;
  }) => void;
  'stroke:points': (payload: { strokeId: string; points: StrokePoint[] }) => void;
  'stroke:end': (payload: { strokeId: string }) => void;
  'canvas:clear': (payload: { playerId: string }) => void;
  'canvas:undo': (payload: { playerId: string }) => void;
  'canvas:snapshot': (payload: { strokes: Stroke[] }) => void;

  'round:start': (payload: {
    roundIndex: number;
    roundCount: number;
    roundDurationSec: number;
    drawerPlayerId: string;
    /** 只有畫圖者收到的私人事件才會帶這個欄位：兩個候選題目，供其擇一 */
    wordOptions?: WordOption[];
  }) => void;
  /** 私訊：只送給畫圖者本人，告知他剛才選定的題目文字 */
  'round:wordChosen': (payload: { word: string }) => void;
  'round:end': (payload: {
    roundIndex: number;
    word: string;
    drawerPlayerId: string;
    /** 這輪猜中的所有人（依猜中先後排序），空陣列代表沒人猜中（逾時流局） */
    correctGuesses: { playerId: string; points: number }[];
    drawerPoints: number;
    /** 停留幾秒後自動開始下一輪（或結束比賽），供前端顯示倒數 */
    nextRoundInSec: number;
  }) => void;
  /** nextMatchInSec：幾秒後會自動開始新的一場比賽；連線人數不足時伺服器屆時不會真的
   *  重啟，改用 null 表示「這次不會自動重啟」，前端據此顯示不同文字 */
  'game:finished': (payload: { nextMatchInSec: number | null }) => void;

  'chat:message': (payload: GuessMessage) => void;

  /**
   * DRAW_TELEPHONE 模式：私訊，只送給「現在輪到」的那個人，告知他該做什麼。
   * subPhase 'guessing' 時附上前一棒的畫布筆畫供他觀察猜測；'drawing' 時附上他自己
   * 剛才送出的猜測文字（或者，如果他是接龍第一棒，附上系統隨機指定的原始題目）
   * 作為這一棒要畫的提示——注意這裡刻意不讓他在畫圖時同時看得到前一棒的畫面，
   * 只給文字提示，避免變成照著畫、失去「傳話」該有的失真效果。
   */
  'telephone:yourTurn': (
    payload:
      | { subPhase: 'guessing'; previousStrokes: Stroke[] }
      | { subPhase: 'drawing'; promptText: string }
  ) => void;
  /** 廣播：接龍跑完最後一棒，公布原始題目跟整條鏈的所有作品／猜測，供大家欣賞 */
  'telephone:reveal': (payload: TelephoneReveal) => void;
}
