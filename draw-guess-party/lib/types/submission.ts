import type { WordDifficulty } from './word';

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'removed';

/** 玩家投稿的題目。通過審核後會寫進題庫（wordId 指向題庫裡的那一筆） */
export interface WordSubmission {
  id: string;
  text: string;
  category: string;
  difficulty: WordDifficulty;
  /** 投稿者的備註（選填），例如「這題適合畫圖者用形狀表現」 */
  note?: string;
  /** 投稿者自己填的暱稱（選填，不驗證身分） */
  submitterName?: string;
  status: SubmissionStatus;
  createdAt: string;
  reviewedAt?: string;
  /** 退回時給投稿者／下一位審核者看的理由（選填） */
  rejectReason?: string;
  /** 通過後對應的題庫題目 id；題庫那邊被刪除時 status 會改成 'removed' */
  wordId?: string;
}

/**
 * 查重結果的一筆比對。
 *  - exact：跟題庫既有題目「正規化後完全相同」→ 不可投稿
 *  - pending：跟另一筆待審投稿完全相同 → 不可投稿（已經有人投了）
 *  - similar：相近（互相包含，或只差一個字）→ 警告，投稿者確認後仍可送出
 *  - rejected：先前被退回過的同一題 → 警告並附上退回理由
 */
export type DuplicateKind = 'exact' | 'pending' | 'similar' | 'rejected';

export interface DuplicateMatch {
  kind: DuplicateKind;
  /** 比對到的那一筆在哪裡 */
  source: 'bank' | 'submission';
  text: string;
  category: string;
  /** 只有 kind === 'rejected' 才可能有 */
  reason?: string;
}

export interface DuplicateCheckResult {
  /** blocked：有 exact／pending，不能送出；warning：只有相近或曾被退回，可確認後送出；ok：沒有問題 */
  verdict: 'ok' | 'warning' | 'blocked';
  matches: DuplicateMatch[];
}
