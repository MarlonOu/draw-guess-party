import type { WordDifficulty } from '../types/word';
import type {
  DuplicateCheckResult,
  DuplicateMatch,
  WordSubmission,
} from '../types/submission';
import { normalizeWord, isSimilarWord } from '../shared/wordMatch';
import { getAllWords, createWord, getCategories } from './wordManager';
import {
  listSubmissions,
  getSubmission,
  saveSubmission,
  deleteSubmission,
} from './submissionStore';

export const SUBMISSION_LIMITS = {
  textMax: 20,
  categoryMax: 12,
  noteMax: 60,
  nameMax: 16,
  /** 待審投稿的總量上限，避免被灌爆後審核不完 */
  pendingMax: 500,
};

const VALID_DIFFICULTIES: WordDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/** 去掉控制字元、把連續空白壓成一個空格 */
function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export interface SubmissionInput {
  text?: unknown;
  category?: unknown;
  difficulty?: unknown;
  note?: unknown;
  submitterName?: unknown;
}

export interface ValidInput {
  text: string;
  category: string;
  difficulty: WordDifficulty;
  note?: string;
  submitterName?: string;
}

/** 欄位驗證與清理。回傳字串代表錯誤訊息（給使用者看的） */
export function validateInput(input: SubmissionInput): ValidInput | string {
  const text = cleanText(input.text, SUBMISSION_LIMITS.textMax + 1);
  if (!text) return '請輸入題目';
  if (Array.from(text).length > SUBMISSION_LIMITS.textMax) return `題目最多 ${SUBMISSION_LIMITS.textMax} 個字`;
  if (!normalizeWord(text)) return '題目要包含文字，不能只有符號';

  const category = cleanText(input.category, SUBMISSION_LIMITS.categoryMax + 1);
  if (!category) return '請選擇或輸入分類';
  if (Array.from(category).length > SUBMISSION_LIMITS.categoryMax) return `分類最多 ${SUBMISSION_LIMITS.categoryMax} 個字`;

  const difficulty = VALID_DIFFICULTIES.includes(input.difficulty as WordDifficulty)
    ? (input.difficulty as WordDifficulty)
    : 'MEDIUM';

  const note = cleanText(input.note, SUBMISSION_LIMITS.noteMax);
  const submitterName = cleanText(input.submitterName, SUBMISSION_LIMITS.nameMax);

  // 分類大小寫／前後空白不同但其實是既有分類時，沿用既有寫法，避免題庫出現「animal」「Animal」兩個分類
  const existing = getCategories().find((c) => c.toLowerCase() === category.toLowerCase());

  return {
    text,
    category: existing ?? category,
    difficulty,
    ...(note ? { note } : {}),
    ...(submitterName ? { submitterName } : {}),
  };
}

/**
 * 查重：比對題庫與其他投稿。
 * @param excludeId 審核時排除「這筆投稿自己」，不然永遠會跟自己比對到
 */
export function checkDuplicates(text: string, excludeId?: string): DuplicateCheckResult {
  const key = normalizeWord(text);
  if (!key) return { verdict: 'ok', matches: [] };

  const exact: DuplicateMatch[] = [];
  const similar: DuplicateMatch[] = [];
  const rejected: DuplicateMatch[] = [];

  for (const w of getAllWords()) {
    const k = normalizeWord(w.text);
    if (k === key) exact.push({ kind: 'exact', source: 'bank', text: w.text, category: w.category });
    else if (isSimilarWord(k, key)) similar.push({ kind: 'similar', source: 'bank', text: w.text, category: w.category });
  }

  for (const s of listSubmissions()) {
    if (s.id === excludeId) continue;
    const k = normalizeWord(s.text);
    if (s.status === 'pending') {
      if (k === key) exact.push({ kind: 'pending', source: 'submission', text: s.text, category: s.category });
      else if (isSimilarWord(k, key)) similar.push({ kind: 'similar', source: 'submission', text: s.text, category: s.category });
    } else if (s.status === 'rejected' && k === key) {
      rejected.push({ kind: 'rejected', source: 'submission', text: s.text, category: s.category, reason: s.rejectReason });
    }
  }

  const blocked = exact.length > 0;
  const matches = [...exact, ...rejected, ...similar].slice(0, 8);
  return {
    verdict: blocked ? 'blocked' : similar.length > 0 || rejected.length > 0 ? 'warning' : 'ok',
    matches,
  };
}

export type SubmitResult =
  | { ok: true; submission: WordSubmission }
  | { ok: false; code: 'invalid'; message: string }
  | { ok: false; code: 'blocked' | 'needsConfirm' | 'full'; message: string; check?: DuplicateCheckResult };

/**
 * 新增投稿。伺服器端一律重新查重（前端的即時查重只是提示，不能信任）：
 *  - 完全重複（題庫已有／已有人投稿待審）→ blocked，不收
 *  - 相近或曾被退回 → needsConfirm，投稿者明確確認（confirmSimilar）後才收
 */
export function submitWord(input: SubmissionInput, confirmSimilar: boolean): SubmitResult {
  const valid = validateInput(input);
  if (typeof valid === 'string') return { ok: false, code: 'invalid', message: valid };

  if (listSubmissions().filter((s) => s.status === 'pending').length >= SUBMISSION_LIMITS.pendingMax) {
    return { ok: false, code: 'full', message: '目前待審的投稿太多了，請稍後再來' };
  }

  const check = checkDuplicates(valid.text);
  if (check.verdict === 'blocked') {
    return { ok: false, code: 'blocked', message: '這個題目已經在題庫裡，或已經有人投稿了', check };
  }
  if (check.verdict === 'warning' && !confirmSimilar) {
    return { ok: false, code: 'needsConfirm', message: '有相近的題目，確認要投稿嗎？', check };
  }

  const submission: WordSubmission = {
    id: crypto.randomUUID(),
    ...valid,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  saveSubmission(submission);
  return { ok: true, submission };
}

export function getSubmissionCounts(): Record<WordSubmission['status'], number> {
  const counts = { pending: 0, approved: 0, rejected: 0, removed: 0 };
  for (const s of listSubmissions()) counts[s.status] += 1;
  return counts;
}

/** 後台列表：待審的每一筆附上即時查重結果，審核者一眼看出哪些跟題庫重複 */
export function listForAdmin(): { submissions: (WordSubmission & { check?: DuplicateCheckResult })[]; counts: ReturnType<typeof getSubmissionCounts> } {
  const submissions = listSubmissions().map((s) =>
    s.status === 'pending' ? { ...s, check: checkDuplicates(s.text, s.id) } : s
  );
  return { submissions, counts: getSubmissionCounts() };
}

export type ReviewResult =
  | { ok: true; submission: WordSubmission }
  | { ok: false; status: 400 | 404 | 409; message: string; check?: DuplicateCheckResult };

/** 通過：可以先改文字／分類／難度；題庫已有完全相同的題目時擋下（除非 force） */
export function approveSubmission(
  id: string,
  overrides: SubmissionInput,
  force: boolean
): ReviewResult {
  const s = getSubmission(id);
  if (!s) return { ok: false, status: 404, message: '找不到這筆投稿' };
  if (s.status !== 'pending') return { ok: false, status: 409, message: '這筆投稿已經審核過了' };

  const valid = validateInput({
    text: overrides.text ?? s.text,
    category: overrides.category ?? s.category,
    difficulty: overrides.difficulty ?? s.difficulty,
  });
  if (typeof valid === 'string') return { ok: false, status: 400, message: valid };

  const check = checkDuplicates(valid.text, s.id);
  const bankExact = check.matches.find((m) => m.kind === 'exact' && m.source === 'bank');
  if (bankExact && !force) {
    return { ok: false, status: 409, message: `題庫已經有「${bankExact.text}」了`, check };
  }

  const word = createWord({ text: valid.text, category: valid.category, difficulty: valid.difficulty });
  if (!word) return { ok: false, status: 400, message: '題目與分類不可為空白' };

  const updated: WordSubmission = {
    ...s,
    text: word.text,
    category: word.category,
    difficulty: word.difficulty,
    status: 'approved',
    reviewedAt: new Date().toISOString(),
    wordId: word.id,
  };
  saveSubmission(updated);
  return { ok: true, submission: updated };
}

export function rejectSubmission(id: string, reason: unknown): ReviewResult {
  const s = getSubmission(id);
  if (!s) return { ok: false, status: 404, message: '找不到這筆投稿' };
  if (s.status !== 'pending') return { ok: false, status: 409, message: '這筆投稿已經審核過了' };
  const rejectReason = cleanText(reason, 80);
  const updated: WordSubmission = {
    ...s,
    status: 'rejected',
    reviewedAt: new Date().toISOString(),
    ...(rejectReason ? { rejectReason } : {}),
  };
  saveSubmission(updated);
  return { ok: true, submission: updated };
}

/** 永久刪除一筆審核紀錄（清理用）；通過的投稿刪紀錄不會動到題庫裡的題目 */
export function removeSubmissionRecord(id: string): boolean {
  return deleteSubmission(id);
}

// ------------------------------------------------------------ 投稿頻率限制 ---

/**
 * 兩層限制（都以來源 IP 計算，10 分鐘一個視窗）：
 *  - 「嘗試」上限 40 次：不管成功或失敗，擋掉用腳本狂打 API 的行為
 *  - 「成功投稿」上限 8 筆：一般玩家 10 分鐘投不到 8 題，灌題庫的人會被擋下
 * 只有真的成功建立投稿才計入第二層——使用者重複輸入被擋下的題目、改了幾次文字，
 * 不該因此被判定「投稿太頻繁」。
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 40;
const RATE_MAX_ACCEPTED = 8;
const globalForRate = globalThis as unknown as {
  __drawGuessPartySubmitRate?: { attempts: Map<string, number[]>; accepted: Map<string, number[]> };
};
const rate = globalForRate.__drawGuessPartySubmitRate ?? { attempts: new Map(), accepted: new Map() };
globalForRate.__drawGuessPartySubmitRate = rate;

function recent(map: Map<string, number[]>, key: string): number[] {
  const now = Date.now();
  const list = (map.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  map.set(key, list);
  return list;
}

/** 這次請求要不要放行；放行時記一次「嘗試」 */
export function takeAttemptSlot(key: string): boolean {
  const list = recent(rate.attempts, key);
  if (list.length >= RATE_MAX_ATTEMPTS || recent(rate.accepted, key).length >= RATE_MAX_ACCEPTED) return false;
  list.push(Date.now());
  return true;
}

/** 成功建立投稿後呼叫 */
export function recordAcceptedSubmission(key: string): void {
  recent(rate.accepted, key).push(Date.now());
}
