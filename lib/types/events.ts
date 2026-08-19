import type { RoomPlayer, RoomSummary } from './room';
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
   *  重啟，但事件本身仍照樣送出這個預期倒數值，前端據此顯示「X 秒後開始新的一場」 */
  'game:finished': (payload: { nextMatchInSec: number }) => void;

  'chat:message': (payload: GuessMessage) => void;
}
