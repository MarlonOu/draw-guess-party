import { randomUUID } from 'node:crypto';
import {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  type BugReport,
  type BugReportSummary,
  type ClientLogEntry,
  type ReportCategory,
  type ReportEnv,
  type ReportStatus,
  type RoomSnapshot,
} from '../types/report';
import { deleteReport, getReport, listReports, saveReport } from './reportStore';
import { getRoom } from './roomManager';

const MESSAGE_MIN = 5;
const MESSAGE_MAX = 1000;
const CONTACT_MAX = 80;
const NOTE_MAX = 500;
const LOG_MAX_ENTRIES = 300;
const LOG_MSG_MAX = 200;
/** 儲存上限：超過時先淘汰最舊的「已解決／不處理」，仍然滿就拒收 */
const STORE_MAX = 1000;

function clean(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
}

function cleanEnv(raw: unknown): ReportEnv {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const env: ReportEnv = {};
  const strs: (keyof ReportEnv)[] = ['url', 'userAgent', 'language', 'timezone', 'viewport', 'screen', 'connection'];
  for (const k of strs) {
    const v = clean(e[k], 300);
    if (v) (env as Record<string, unknown>)[k] = v;
  }
  if (typeof e.pixelRatio === 'number' && Number.isFinite(e.pixelRatio)) env.pixelRatio = Math.round(e.pixelRatio * 100) / 100;
  if (typeof e.touch === 'boolean') env.touch = e.touch;
  if (typeof e.online === 'boolean') env.online = e.online;
  if (typeof e.loadedAt === 'number') env.loadedAt = e.loadedAt;
  if (typeof e.sentAt === 'number') env.sentAt = e.sentAt;
  return env;
}

function cleanLogs(raw: unknown): ClientLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientLogEntry[] = [];
  for (const item of raw.slice(-LOG_MAX_ENTRIES)) {
    if (!item || typeof item !== 'object') continue;
    const { t, k, m } = item as Record<string, unknown>;
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    out.push({ t, k: clean(k, 16) || 'system', m: clean(m, LOG_MSG_MAX) });
  }
  return out;
}

/** 從回報當下的網址取出房間代碼，附上伺服器端看到的房間狀態（玩家人數、第幾輪…） */
function snapshotRoom(url: string | undefined): RoomSnapshot | undefined {
  const code = url?.match(/\/online\/room\/([A-Za-z0-9]{3,10})/)?.[1]?.toUpperCase();
  if (!code) return undefined;
  const room = getRoom(code);
  if (!room) return { joinCode: code, mode: '房間已不存在', status: '-', playerCount: 0, connectedCount: 0 };
  const players = Array.from(room.players.values());
  return {
    joinCode: code,
    mode: room.settings.mode,
    status: room.status,
    playerCount: players.length,
    connectedCount: players.filter((p) => p.socketId).length,
    roundIndex: room.currentRoundIndex,
    roundCount: room.roundCount,
    roundDurationSec: room.settings.roundDurationSec,
  };
}

export type SubmitReportResult =
  | { ok: true; report: BugReport }
  | { ok: false; status: number; message: string };

export function submitReport(body: Record<string, unknown>): SubmitReportResult {
  const message = clean(body.message, MESSAGE_MAX);
  if (message.length < MESSAGE_MIN) return { ok: false, status: 400, message: `請至少寫 ${MESSAGE_MIN} 個字，說明發生了什麼事` };
  const category = (REPORT_CATEGORIES as string[]).includes(body.category as string) ? (body.category as ReportCategory) : 'other';

  let all = listReports();
  if (all.length >= STORE_MAX) {
    const stale = all.filter((r) => r.status === 'resolved' || r.status === 'wontfix').reverse();
    for (const r of stale) {
      if (all.length < STORE_MAX) break;
      deleteReport(r.id);
      all = all.filter((x) => x.id !== r.id);
    }
    if (all.length >= STORE_MAX) return { ok: false, status: 503, message: '回報暫時額滿，請稍後再試' };
  }

  const env = cleanEnv(body.env);
  const contact = clean(body.contact, CONTACT_MAX);
  const room = snapshotRoom(env.url);
  const report: BugReport = {
    id: randomUUID(),
    category,
    message,
    ...(contact ? { contact } : {}),
    status: 'open',
    createdAt: new Date().toISOString(),
    env,
    ...(room ? { room } : {}),
    logs: cleanLogs(body.logs),
  };
  saveReport(report);
  return { ok: true, report };
}

export function toSummary(r: BugReport): BugReportSummary {
  const { logs, ...rest } = r;
  return { ...rest, logCount: logs.length };
}

export function listReportSummaries(): BugReportSummary[] {
  return listReports().map(toSummary);
}

export function getReportDetail(id: string): BugReport | undefined {
  return getReport(id);
}

export function updateReport(id: string, patch: Record<string, unknown>): BugReport | null {
  const r = getReport(id);
  if (!r) return null;
  const next: BugReport = { ...r };
  if ((REPORT_STATUSES as string[]).includes(patch.status as string)) next.status = patch.status as ReportStatus;
  if (typeof patch.adminNote === 'string') {
    const note = clean(patch.adminNote, NOTE_MAX);
    if (note) next.adminNote = note;
    else delete next.adminNote;
  }
  next.updatedAt = new Date().toISOString();
  saveReport(next);
  return next;
}

export function removeReport(id: string): boolean {
  return deleteReport(id);
}

// ------------------------------------------------------------ 頻率限制 ---

/** 同一來源 IP 10 分鐘最多 5 筆回報（成功才計）；嘗試次數另外限制 20 次，擋腳本狂打 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_REPORTS = 5;
const RATE_MAX_ATTEMPTS = 20;
const g = globalThis as unknown as {
  __drawGuessPartyReportRate?: { attempts: Map<string, number[]>; accepted: Map<string, number[]> };
};
const rate = g.__drawGuessPartyReportRate ?? { attempts: new Map(), accepted: new Map() };
g.__drawGuessPartyReportRate = rate;

function recent(map: Map<string, number[]>, key: string): number[] {
  const now = Date.now();
  const list = (map.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  map.set(key, list);
  return list;
}

export function takeReportSlot(key: string): boolean {
  const attempts = recent(rate.attempts, key);
  if (attempts.length >= RATE_MAX_ATTEMPTS || recent(rate.accepted, key).length >= RATE_MAX_REPORTS) return false;
  attempts.push(Date.now());
  return true;
}

export function recordAcceptedReport(key: string): void {
  recent(rate.accepted, key).push(Date.now());
}
