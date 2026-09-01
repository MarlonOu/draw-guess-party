import type { WordBankEntry } from '../types/word';

/**
 * 隨機排定整條接龍的玩家順序（Fisher-Yates 洗牌）。
 * 輸入：目前連線中的玩家 id 列表
 * 輸出：洗牌後的新陣列（不修改原陣列）
 */
export function shuffleChainOrder(playerIds: string[]): string[] {
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 隨機抽一個題目給接龍第一棒（跟 DRAW_GUESS 不同，這裡不用讓玩家選，直接隨機指定一個）。
 * 輸出：題目文字，或 null（題庫是空的，理論上呼叫端應該先確認題庫至少有 1 題）
 */
export function pickRandomWord(wordBank: { id: string; text: string }[]): WordBankEntry['text'] | null {
  if (wordBank.length === 0) return null;
  return wordBank[Math.floor(Math.random() * wordBank.length)].text;
}

/**
 * 從目前的接龍位置往後找下一個「還在房間裡」的玩家索引，跳過中途已經離開的人。
 * 輸入：整條接龍順序、目前位置（0 起算，-1 代表還沒開始任何一棒）、目前還在房間裡的玩家 id 集合
 * 輸出：下一個有效位置的索引，或 null（後面已經沒有還在房間裡的人了，接龍提前結束）
 * 邊界條件：只往後找，不會往回找已經跑過的位置；如果 chainOrder 後面的人陸續都離開了，
 *          會一路跳到底找不到人為止，回傳 null
 */
export function findNextActiveIndex(
  chainOrder: string[],
  currentIndex: number,
  presentPlayerIds: Set<string>
): number | null {
  for (let i = currentIndex + 1; i < chainOrder.length; i++) {
    if (presentPlayerIds.has(chainOrder[i])) return i;
  }
  return null;
}
