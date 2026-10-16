/**
 * 「畫圖時間」設定：三種模式共用同一個欄位（RoomSettings.roundDurationSec），
 * 各模式把它套用在「畫圖」的那一段：
 *  - DRAW_GUESS：每一輪的作畫時間（選題 5 秒另外算，不受影響）
 *  - DRAW_TELEPHONE：每一棒的「作畫」時間；猜測時間固定 25 秒
 *  - FRAGMENT_DRAW：起手畫圖、補全畫圖各自的時間（兩段相同）；跨組猜題固定 30 秒
 *
 * 伺服器（roomManager／orchestrators）與前端（設定面板、倒數橫條、玩法介紹文字）
 * 共用這份數字與函式，避免兩邊各寫一份、改一邊漏改另一邊。
 */
import type { GameMode } from '../types/room';

export const DRAW_TIME_MIN_SEC = 15;
export const DRAW_TIME_MAX_SEC = 180;

/** 設定面板提供的快選秒數 */
export const DRAW_TIME_OPTIONS = [30, 45, 60, 90, 120, 180] as const;

/** 各模式建房時的預設畫圖時間（維持這個功能出現之前的實際體感：接龍 60、拼圖起手 90） */
export const DEFAULT_DRAW_TIME_SEC: Record<GameMode, number> = {
  DRAW_GUESS: 60,
  DRAW_TELEPHONE: 60,
  FRAGMENT_DRAW: 90,
};

export function clampDrawTime(sec: unknown, fallback = 60): number {
  const n = typeof sec === 'number' && Number.isFinite(sec) ? Math.round(sec) : fallback;
  return Math.min(DRAW_TIME_MAX_SEC, Math.max(DRAW_TIME_MIN_SEC, n));
}

/** 秒數轉成人看的文字：90 → 「1 分 30 秒」、60 → 「1 分鐘」、45 → 「45 秒」 */
export function formatDrawTime(sec: number): string {
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} 分鐘` : `${m} 分 ${s} 秒`;
}
