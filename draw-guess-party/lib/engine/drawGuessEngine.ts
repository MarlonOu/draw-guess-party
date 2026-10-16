/** pickWordOptions 只需要 id 與 text，接受完整 WordBankEntry 或精簡後的 {id,text} 都可 */
interface MinimalWordEntry {
  id: string;
  text: string;
}

/**
 * 抽題選項：讓畫圖者從中擇一，而不是直接指定單一題目
 * 輸入：題庫（已依分類/難度篩選）、本場已使用過的題目 id 集合、要抽出的選項數（預設 2）
 * 輸出：尚未使用過的題目陣列，長度可能小於 count（題庫剩餘不足時），為空陣列代表題庫已用完
 * 邊界條件：題庫為空或全數用完時回傳空陣列，呼叫端需對應處理（例如提前結束比賽），
 *          不得靜默失敗或拋出例外；回傳的題目彼此不重複
 */
export function pickWordOptions<T extends MinimalWordEntry>(
  wordBank: T[],
  usedWordIds: Set<string>,
  count = 2
): T[] {
  const available = [...wordBank.filter((w) => !usedWordIds.has(w.id))];
  const picked: T[] = [];
  while (available.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * available.length);
    picked.push(available[index]);
    available.splice(index, 1);
  }
  return picked;
}

/**
 * 決定下一輪畫圖的人（輪流制）
 * 輸入：固定順序的玩家 id 陣列（turnOrder）、目前輪到的索引（currentIndex，-1 代表尚未開始）
 * 輸出：下一輪畫圖者的 playerId 與其索引
 * 邊界條件：turnOrder 為空陣列時回傳 null；索引超出範圍時從頭循環（模數運算）
 */
export function getNextDrawer(
  turnOrder: string[],
  currentIndex: number
): { playerId: string; index: number } | null {
  if (turnOrder.length === 0) return null;
  const nextIndex = (currentIndex + 1) % turnOrder.length;
  return { playerId: turnOrder[nextIndex], index: nextIndex };
}

/**
 * 計算這場比賽的總輪數：DRAW_GUESS 模式為「每人畫一輪」
 */
export function computeRoundCount(playerCount: number): number {
  return playerCount;
}

/**
 * 畫圖者計分：改成「等全部人猜對或逾時才結束一輪」之後，一輪可能有多個人猜中，
 * 固定分數已經不合理（畫得好讓 5 個人都猜中，跟只有 1 個人猜中拿一樣的分數說不過去），
 * 改為每有一人猜中就加這個分數，猜中的人越多，畫圖者分數越高。
 */
export const DRAWER_POINTS_PER_GUESSER = 2;
const MAX_GUESSER_POINTS = 10;
const MIN_GUESSER_POINTS = 1;

/**
 * 搶分規則：猜對的人依「這一輪第幾個猜對」拿分，跟花了多少時間無關——
 * 第一個猜對的人拿最高分，之後每晚一名遞減，猜再久只要排到前面名次一樣拿高分。
 * 輸入：這次猜對是這一輪第幾個猜對（1 起算，1 代表第一個猜對的人）
 * 輸出：1~10 分之間的整數，名次越前面分數越高，第 5 名以後一律最低 1 分
 * 邊界條件：rank 小於 1（理論上不會發生，呼叫端保證至少是 1）時視為 1 處理
 */
export function computeGuesserPointsByRank(rank: number): number {
  const safeRank = Math.max(1, rank);
  return Math.max(MIN_GUESSER_POINTS, MAX_GUESSER_POINTS - (safeRank - 1) * 2);
}
