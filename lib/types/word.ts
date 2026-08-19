export type WordDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface WordBankEntry {
  id: string;
  text: string;
  category: string;
  difficulty: WordDifficulty;
  createdAt: string;
}
