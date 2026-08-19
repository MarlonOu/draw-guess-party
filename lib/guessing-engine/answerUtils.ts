/**
 * 正規化使用者輸入與正解字串，供各模式 judgeAnswer 共用。
 * 輸入：任意字串
 * 輸出：去除頭尾空白、內部空白、轉為小寫後的字串
 * 邊界條件：空字串正規化後仍為空字串，呼叫端需另行判斷是否視為未作答
 */
export function normalizeAnswer(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toLowerCase();
}

export function isAnswerMatch(userAnswer: string, correctTitle: string): boolean {
  const normalizedUser = normalizeAnswer(userAnswer);
  if (normalizedUser.length === 0) return false;
  return normalizedUser === normalizeAnswer(correctTitle);
}
