export type ReportCategory = 'bug' | 'layout' | 'gameplay' | 'other';
export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'wontfix';

export const REPORT_CATEGORIES: ReportCategory[] = ['bug', 'layout', 'gameplay', 'other'];
export const REPORT_STATUSES: ReportStatus[] = ['open', 'in_progress', 'resolved', 'wontfix'];

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  bug: '功能異常',
  layout: '畫面跑版',
  gameplay: '遊戲玩法',
  other: '其他',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: '未處理',
  in_progress: '處理中',
  resolved: '已解決',
  wontfix: '不處理',
};

/**
 * 前端自動收集的一筆紀錄。
 *  - t：發生時間（epoch ms）
 *  - k：類型 click／nav／fetch／socket／error／console／system
 *  - m：描述文字（已截短）。只記「做了什麼」，不記玩家輸入的文字內容
 */
export interface ClientLogEntry {
  t: number;
  k: string;
  m: string;
}

/** 回報當下的裝置與頁面資訊（前端收集，伺服器再補上房間快照） */
export interface ReportEnv {
  url?: string;
  userAgent?: string;
  language?: string;
  timezone?: string;
  viewport?: string;
  screen?: string;
  pixelRatio?: number;
  touch?: boolean;
  online?: boolean;
  connection?: string;
  loadedAt?: number;
  sentAt?: number;
}

export interface RoomSnapshot {
  joinCode: string;
  mode: string;
  status: string;
  playerCount: number;
  connectedCount: number;
  roundIndex?: number;
  roundCount?: number;
  roundDurationSec?: number;
}

export interface BugReport {
  id: string;
  category: ReportCategory;
  message: string;
  /** 回報者自願留的聯絡方式（選填） */
  contact?: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt?: string;
  /** 管理員備註 */
  adminNote?: string;
  env: ReportEnv;
  room?: RoomSnapshot;
  logs: ClientLogEntry[];
}

/** 列表用：不含完整 log，只帶筆數，避免後台一次載入大量資料 */
export type BugReportSummary = Omit<BugReport, 'logs'> & { logCount: number };
