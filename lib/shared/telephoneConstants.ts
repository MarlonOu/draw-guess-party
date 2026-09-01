/**
 * DRAW_TELEPHONE 模式的限時常數，伺服器（telephoneOrchestrator.ts）跟前端
 * （TelephoneRoomView.tsx 的倒數橫條）共用同一份數字，避免兩邊各自寫死、
 * 改一邊忘了改另一邊導致前端倒數橫條跟伺服器實際逾時判定的秒數對不上。
 */
export const TELEPHONE_GUESS_TIMEOUT_SEC = 25;
export const TELEPHONE_DRAWING_TIMEOUT_SEC = 60;
