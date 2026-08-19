import type { WordBankEntry, WordDifficulty } from '../types/word';
import seedWords from '../../data/words.json';

const globalForWords = globalThis as unknown as {
  __drawGuessPartyWords?: Map<string, WordBankEntry>;
};

function buildSeed(): Map<string, WordBankEntry> {
  const map = new Map<string, WordBankEntry>();
  for (const w of seedWords as WordBankEntry[]) map.set(w.id, w);
  return map;
}

/**
 * 題庫狀態掛在 globalThis 上，理由與 roomManager.ts 相同：Next.js 對 API Route 的打包
 * 與 server.ts 直接以原始碼匯入本模組時，會各自產生獨立模組實例，若各自持有一份
 * Map，管理後台新增的題目就不會出現在遊戲實際抽題的來源裡。
 */
const words: Map<string, WordBankEntry> = globalForWords.__drawGuessPartyWords ?? buildSeed();
globalForWords.__drawGuessPartyWords = words;

export function getAllWords(): WordBankEntry[] {
  return Array.from(words.values()).sort((a, b) =>
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  );
}

export function getWordsByFilter(
  categoryFilter: string[],
  difficultyFilter: string[]
): WordBankEntry[] {
  return getAllWords().filter((w) => {
    const categoryOk = categoryFilter.length === 0 || categoryFilter.includes(w.category);
    const difficultyOk = difficultyFilter.length === 0 || difficultyFilter.includes(w.difficulty);
    return categoryOk && difficultyOk;
  });
}

export function getCategories(): string[] {
  return Array.from(new Set(getAllWords().map((w) => w.category))).sort();
}

export interface WordInput {
  text: string;
  category: string;
  difficulty: WordDifficulty;
}

/**
 * 新增題目
 * 輸入：題目內容、分類、難度
 * 輸出：新建立的 WordBankEntry，或 null（text/category 為空字串）
 * 邊界條件：不接受空白題目或空白分類，避免題庫混入無效資料
 */
export function createWord(input: WordInput): WordBankEntry | null {
  const text = input.text.trim();
  const category = input.category.trim();
  if (!text || !category) return null;

  const entry: WordBankEntry = {
    id: crypto.randomUUID(),
    text,
    category,
    difficulty: input.difficulty,
    createdAt: new Date().toISOString(),
  };
  words.set(entry.id, entry);
  return entry;
}

export function updateWord(id: string, patch: Partial<WordInput>): WordBankEntry | null {
  const existing = words.get(id);
  if (!existing) return null;

  const updated: WordBankEntry = {
    ...existing,
    text: patch.text !== undefined ? patch.text.trim() : existing.text,
    category: patch.category !== undefined ? patch.category.trim() : existing.category,
    difficulty: patch.difficulty ?? existing.difficulty,
  };
  if (!updated.text || !updated.category) return null;

  words.set(id, updated);
  return updated;
}

export function deleteWord(id: string): boolean {
  return words.delete(id);
}

/**
 * 批次匯入
 * 輸入：多筆題目
 * 輸出：{ created, skipped }，skipped 為與現有題目「文字+分類」完全相同而略過的筆數
 * 邊界條件：比對已存在項目避免重複匯入，不做模糊比對，只比對完全相同的 text+category 組合
 */
export function bulkImportWords(entries: WordInput[]): { created: number; skipped: number } {
  const existingKeys = new Set(
    getAllWords().map((w) => `${w.text}::${w.category}`)
  );
  let created = 0;
  let skipped = 0;

  for (const entry of entries) {
    const text = entry.text.trim();
    const category = entry.category.trim();
    if (!text || !category) {
      skipped += 1;
      continue;
    }
    const key = `${text}::${category}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    createWord({ text, category, difficulty: entry.difficulty });
    existingKeys.add(key);
    created += 1;
  }

  return { created, skipped };
}
