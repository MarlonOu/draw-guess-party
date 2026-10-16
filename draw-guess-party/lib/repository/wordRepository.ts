import type { WordBankEntry } from '../types/word';
import { getAllWords, getWordsByFilter } from '../server/wordManager';

export interface WordRepository {
  getAll(): Promise<WordBankEntry[]>;
  getByFilter(categoryFilter: string[], difficultyFilter: string[]): Promise<WordBankEntry[]>;
}

/**
 * 目前實作：讀取 wordManager 的記憶體題庫（含管理後台新增/編輯過的題目）。
 * 之後接上 PostgreSQL/Prisma 時，置換本檔案內部實作即可，呼叫端（roundOrchestrator、
 * 建房 API）的函式簽名不需修改。
 */
export const wordRepository: WordRepository = {
  async getAll(): Promise<WordBankEntry[]> {
    return getAllWords();
  },
  async getByFilter(
    categoryFilter: string[],
    difficultyFilter: string[]
  ): Promise<WordBankEntry[]> {
    return getWordsByFilter(categoryFilter, difficultyFilter);
  },
};
