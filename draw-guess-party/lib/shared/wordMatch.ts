/**
 * 題目文字的「正規化」與「相近」判斷，供投稿查重使用。
 *
 * 正規化的目標是把「人眼看起來是同一個詞」的寫法收斂成同一個字串：
 *  - NFKC：全形半形、相容字元統一（ＡＢＣ → ABC、㈱ → (株)）
 *  - 小寫、去掉空白與標點符號（「 熱 氣球！」→「熱氣球」）
 *  - 常見的異體寫法（臺／台、裏／裡、著／着 等）統一
 * 不處理簡繁轉換（沒有可靠的免依賴做法，硬做容易誤判），所以「气球」跟「氣球」會被當成
 * 不同的詞——這是已知的限制，審核者看得出來。
 */

const VARIANT_MAP: Record<string, string> = {
  臺: '台',
  裏: '裡',
  着: '著',
  衞: '衛',
  峯: '峰',
  綫: '線',
  羣: '群',
  爲: '為',
};

export function normalizeWord(input: string): string {
  const nfkc = input.normalize('NFKC').toLowerCase();
  let out = '';
  for (const ch of nfkc) {
    // 只留字母、數字、漢字（含擴充）；空白與標點全部丟掉
    if (/[\p{L}\p{N}]/u.test(ch)) out += VARIANT_MAP[ch] ?? ch;
  }
  return out;
}

/** 兩個字串的編輯距離（只在字串很短時使用，題目通常 2~8 個字） */
export function editDistance(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  const dp: number[] = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= B.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (A[i - 1] === B[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[B.length];
}

/**
 * 兩個「已正規化」的題目算不算相近（不含完全相同，那由呼叫端另外處理）：
 *  1. 其中一個完整包含另一個，且較短的至少 2 個字
 *     （「貓咪」vs「貓」只有 1 個字不算；「熱氣球」vs「氣球」算）
 *  2. 長度都 ≥ 3 且編輯距離為 1（只差一個字，例如「冰淇淋」vs「冰淇淋」打錯一個字）
 * 兩個字的詞不用規則 2——「大象／大衣」差一個字卻是完全不同的東西，會造成大量誤報。
 */
export function isSimilarWord(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 2 && long.includes(short)) return true;
  if (short.length >= 3 && Math.abs(a.length - b.length) <= 1 && editDistance(a, b) === 1) return true;
  return false;
}
