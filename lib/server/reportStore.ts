import fs from 'node:fs';
import path from 'node:path';
import type { BugReport } from '../types/report';

/**
 * 錯誤回報的持久化，作法同 submissionStore：全部掛在 globalThis（Next API bundle 與
 * server.ts 共用同一份），啟動時讀一次進記憶體，變更時「寫暫存檔再 rename」。
 * 預設路徑 data/bug-reports.json，可用環境變數 REPORTS_FILE 覆寫（部署的 rsync 已排除 data/）。
 */
const globalForReports = globalThis as unknown as {
  __drawGuessPartyReports?: Map<string, BugReport>;
};

function filePath(): string {
  return process.env.REPORTS_FILE ?? path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'bug-reports.json');
}

function load(): Map<string, BugReport> {
  const map = new Map<string, BugReport>();
  try {
    const list = JSON.parse(fs.readFileSync(filePath(), 'utf-8')) as BugReport[];
    if (Array.isArray(list)) for (const r of list) if (r && typeof r.id === 'string') map.set(r.id, r);
  } catch {
    // 檔案不存在或壞掉：從空的開始
  }
  return map;
}

const reports: Map<string, BugReport> = globalForReports.__drawGuessPartyReports ?? load();
globalForReports.__drawGuessPartyReports = reports;

function persist(): void {
  const target = filePath();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Array.from(reports.values())), 'utf-8');
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error('[reportStore] 寫入回報檔失敗：', err);
  }
}

export function listReports(): BugReport[] {
  return Array.from(reports.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReport(id: string): BugReport | undefined {
  return reports.get(id);
}

export function saveReport(r: BugReport): void {
  reports.set(r.id, r);
  persist();
}

export function deleteReport(id: string): boolean {
  const ok = reports.delete(id);
  if (ok) persist();
  return ok;
}
