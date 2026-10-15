/**
 * FRAGMENT_DRAW 模式的限時常數，伺服器（fragmentOrchestrator.ts）跟前端
 * （FragmentRoomView.tsx 的倒數橫條）共用同一份數字。
 *
 * 起手／補全的「畫圖時間」不在這裡：由房間設定決定（RoomSettings.roundDurationSec，
 * 預設 90 秒，見 lib/shared/drawTime.ts），兩段使用相同秒數。這裡只留不可調的猜題限時。
 */

/** 跨組猜題階段，一組作品公布後，其他組所有人平行作答的限時 */
export const FRAGMENT_GUESS_TIMEOUT_SEC = 30;

/** 最少需要幾人才能開始：兩人一組、至少要有兩組 */
export const FRAGMENT_MIN_PLAYERS = 4;
