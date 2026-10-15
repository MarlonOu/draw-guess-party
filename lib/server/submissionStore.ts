import fs from 'node:fs';
import path from 'node:path';
import type { WordSubmission } from '../types/submission';
import type { WordBankEntry } from '../types/word';

/**
 * 投稿資料的持久化。
 *
 * 題庫本身目前只存在記憶體（見 wordManager.ts），伺服器一重啟，後台新增的題目就沒了；
 * 投稿跟審核結果不能這樣——玩家花時間投稿、管理員花時間審核，重啟後全部歸零會是很糟的體驗。
 * 所以這裡把所有投稿（含已通過／已退回的紀錄）存成一份 JSON 檔：
 *  - 預設路徑 data/submissions.json，可用環境變數 SUBMISSIONS_FILE 指定（部署時 rsync 已排除 data/）
 *  - 寫入採「寫暫存檔再 rename」，中途當機不會留下寫一半的壞檔
 *  - 啟動時讀一次進記憶體；之後所有讀取走記憶體，只有變更時才寫檔
 * 已通過的投稿在題庫啟動時會被併入題庫（見 wordManager.buildSeed），所以通過審核的題目
 * 重啟後仍然存在。
 *
 * 跟 roomManager／wordManager 一樣掛在 globalThis：Next 的 API Route bundle 與 server.ts
 * 各自載入本模組時才不會各自持有一份不同步的資料。
 */
const globalForSubmissions = globalThis as unknown as {
  __drawGuessPartySubmissions?: Map<string, WordSubmission>;
};

function filePath(): string {
  // turbopackIgnore：這是執行期才決定的資料檔路徑，不是要打包進去的靜態資源，
  // 不加這行 Turbopack 會因為動態檔案存取而試圖追蹤整個專案目錄
  return process.env.SUBMISSIONS_FILE ?? path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'submissions.json');
}

function load(): Map<string, WordSubmission> {
  const map = new Map<string, WordSubmission>();
  try {
    const raw = fs.readFileSync(filePath(), 'utf-8');
    const list = JSON.parse(raw) as WordSubmission[];
    if (Array.isArray(list)) {
      for (const s of list) if (s && typeof s.id === 'string') map.set(s.id, s);
    }
  } catch {
    // 檔案不存在（第一次執行）或內容壞掉：從空的開始。壞檔不覆寫，等下一次成功寫入時才取代
  }
  return map;
}

const submissions: Map<string, WordSubmission> =
  globalForSubmissions.__drawGuessPartySubmissions ?? load();
globalForSubmissions.__drawGuessPartySubmissions = submissions;

function persist(): void {
  const target = filePath();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Array.from(submissions.values()), null, 2), 'utf-8');
    fs.renameSync(tmp, target);
  } catch (err) {
    // 寫檔失敗不該讓投稿或審核的請求整個失敗（資料還在記憶體裡），只記錄下來
    console.error('[submissionStore] 寫入投稿檔失敗：', err);
  }
}

export function listSubmissions(): WordSubmission[] {
  return Array.from(submissions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getSubmission(id: string): WordSubmission | undefined {
  return submissions.get(id);
}

export function saveSubmission(s: WordSubmission): void {
  submissions.set(s.id, s);
  persist();
}

export function deleteSubmission(id: string): boolean {
  const ok = submissions.delete(id);
  if (ok) persist();
  return ok;
}

/** 已通過、且對應題庫題目還在的投稿 → 啟動時併入題庫 */
export function getApprovedWordsForBank(): WordBankEntry[] {
  const out: WordBankEntry[] = [];
  for (const s of submissions.values()) {
    if (s.status === 'approved' && s.wordId) {
      out.push({
        id: s.wordId,
        text: s.text,
        category: s.category,
        difficulty: s.difficulty,
        createdAt: s.reviewedAt ?? s.createdAt,
      });
    }
  }
  return out;
}

/** 題庫那邊刪掉了一筆（管理後台刪除），對應的投稿標記為 removed，避免下次啟動又被併回題庫 */
export function markWordRemoved(wordId: string): void {
  let changed = false;
  for (const s of submissions.values()) {
    if (s.wordId === wordId && s.status === 'approved') {
      s.status = 'removed';
      changed = true;
    }
  }
  if (changed) persist();
}

/** 題庫那邊修改了一筆（管理後台編輯），同步回對應的投稿，重啟後才不會變回舊內容 */
export function syncApprovedWord(entry: WordBankEntry): void {
  let changed = false;
  for (const s of submissions.values()) {
    if (s.wordId === entry.id && s.status === 'approved') {
      s.text = entry.text;
      s.category = entry.category;
      s.difficulty = entry.difficulty;
      changed = true;
    }
  }
  if (changed) persist();
}
