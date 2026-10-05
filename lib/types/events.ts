import type { RoomPlayer, RoomSummary, TelephoneReveal, FragmentReveal, FragmentSplitOrientation, FragmentHalf } from './room';
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
  /** DRAW_TELEPHONE 模式：公布階段（作品列表）投「準備好下一場」的票，沒有額外資料——
   *  伺服器從 socket.data 裡的 playerId 判斷是誰投的票 */
  'telephone:voteReady': () => void;

  /** FRAGMENT_DRAW 模式：起手作畫中，切換畫布切割方向（左右切／上下切）。
   *  切換會清空目前畫的內容，見 lib/types/room.ts 的 FragmentSplitOrientation 說明 */
  'fragment:setOrientation': (payload: { orientation: FragmentSplitOrientation }) => void;
  /** FRAGMENT_DRAW 模式：起手畫完，交出這一組的作品（系統會隨機保留其中一半給補全者） */
  'fragment:submitDrawing1': () => void;
  /** FRAGMENT_DRAW 模式：補全畫完，交出這一組的作品 */
  'fragment:submitDrawing2': () => void;
  /** FRAGMENT_DRAW 模式：猜題階段，對目前正在公布的那一組作品送出猜測 */
  'fragment:submitGuess': (payload: { text: string }) => void;
  /** FRAGMENT_DRAW 模式：公布階段（作品列表）投「準備好下一場」的票，設計理由
   *  跟 telephone:voteReady 完全一致 */
  'fragment:voteReady': () => void;
  /** FRAGMENT_DRAW 模式：lobby 階段點擊「加入」把自己移到指定組別（不是交換，
   *  是單純移動自己過去；開始遊戲前允許組別人數暫時不對稱）。房間裡任何人都
   *  可以呼叫，不限房主，見使用者需求「可以自由組隊」 */
  'fragment:joinTeam': (payload: { teamNumber: number }) => void;
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

  /**
   * FRAGMENT_DRAW 模式：私訊，只送給「現在輪到」的那個人（起手或補全），告知
   * 他該做什麼。'drawing1'（起手）附上題目跟目前選擇的切割方向（可以中途透過
   * fragment:setOrientation 切換）；'drawing2'（補全）額外附上起手保留下來
   * 那一半的內容（keptStrokes）跟是保留了哪一半（keptHalf，補全只能畫在
   * 「另一半」，伺服器端也會驗證，不是只靠前端限制）。
   */
  'fragment:yourTurn': (
    payload:
      | { teamId: string; subPhase: 'drawing1'; word: string; splitOrientation: FragmentSplitOrientation }
      | {
          teamId: string;
          subPhase: 'drawing2';
          word: string;
          splitOrientation: FragmentSplitOrientation;
          keptHalf: FragmentHalf;
          keptStrokes: Stroke[];
        }
  ) => void;
  /**
   * FRAGMENT_DRAW 模式：私訊，只送給「現在該猜這一組」的那位玩家，告知他
   * 該猜什麼。跟舊版最大的差異：不再是廣播給全房間所有人（含自己組成員）
   * ——每個人各自依自己的節奏往下猜（見使用者需求「每個人可以一直接續猜題，
   * 直到把所有題目猜完」），不會有「全房間現在都在看同一組」這回事，自己組
   * 的作品本來就不會出現在自己的猜題序列裡，不需要另外用 isOwnTeam 判斷
   * 要不要顯示猜測輸入框——收到這個事件就代表「這是你現在該猜的」。
   */
  'fragment:guessPhase': (payload: {
    teamId: string;
    word: string;
    splitOrientation: FragmentSplitOrientation;
    keptHalf: FragmentHalf;
    keptStrokes: Stroke[];
    completedStrokes: Stroke[];
  }) => void;
  /** 廣播：所有組別都公布猜完了，公布每一組的完整作品跟外組玩家各自的猜測，供大家欣賞 */
  'fragment:reveal': (payload: FragmentReveal) => void;
  /**
   * FRAGMENT_DRAW 模式：私訊，只送給起手（隊友），告知補全階段開始了、他可以
   * 即時旁觀補全過程（見模組層級對應檔案裡「此時第一位看的到繪畫過程」的需求）。
   * 帶上跟 fragment:yourTurn 的 'drawing2' 分支一樣的內容，讓起手的畫面能顯示
   * 一樣的切割線跟保留下來的那一半內容，只是他自己不能下筆（畫面上用
   * disabled 呈現，不是靠沒收到這個事件），補全過程的即時筆畫另外透過
   * 正常的 stroke:start／stroke:points／stroke:end 廣播過來。
   */
  'fragment:teammateDrawing': (payload: {
    teamId: string;
    splitOrientation: FragmentSplitOrientation;
    keptHalf: FragmentHalf;
    keptStrokes: Stroke[];
  }) => void;
}
