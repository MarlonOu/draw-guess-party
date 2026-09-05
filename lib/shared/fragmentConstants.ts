/**
 * FRAGMENT_DRAW 模式的限時常數，伺服器（fragmentOrchestrator.ts）跟前端
 * （FragmentRoomView.tsx 的倒數橫條）共用同一份數字，避免兩邊各自寫死、
 * 改一邊忘了改另一邊導致前端倒數橫條跟伺服器實際逾時判定的秒數對不上。
 *
 * 畫布比其他模式大（使用者需求明確要求「更大一點」），且起手要畫滿整個
 * 畫布（不是像接龍模式那樣只補一小塊），時限給得比接龍模式的作畫限時
 * （60 秒）更寬裕一些。補全階段內容量通常比起手少（只需要畫半張），
 * 時限可以稍微短一點，但差距不用太大——補全者也要花時間觀察、構思怎麼接。
 */
export const FRAGMENT_DRAWING1_TIMEOUT_SEC = 90;
export const FRAGMENT_DRAWING2_TIMEOUT_SEC = 75;

/** 跨組猜題階段，一組作品公布後，其他組所有人平行作答的限時 */
export const FRAGMENT_GUESS_TIMEOUT_SEC = 30;

/** 最少需要幾人才能開始：兩人一組、至少要有兩組 */
export const FRAGMENT_MIN_PLAYERS = 4;
