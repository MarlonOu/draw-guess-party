import type { ClientLogEntry, ReportEnv } from '../types/report';

/**
 * 前端操作／系統紀錄收集器：玩家按「回報問題」時，最近的紀錄會隱藏附在回報裡一起送出，
 * 讓管理員能重現「他按了什麼、系統當時發生什麼事」。
 *
 * 隱私原則：只記「做了什麼」，不記「輸入了什麼」。
 *  - 點擊：只記元素種類與按鈕／連結上的文字（截短），不記任何輸入框、選單的內容
 *  - 聊天與猜測：只記事件名稱，不記文字
 *  - 網路請求：只記方法、路徑（不含查詢字串）、狀態碼、耗時，不記內容
 * 紀錄只留在記憶體與 sessionStorage（關閉分頁即清除），玩家按下送出才會離開瀏覽器。
 */

const MAX_ENTRIES = 300;
const STORAGE_KEY = 'dgp:clientlog';
const MERGE_WINDOW_MS = 5000;

interface Entry extends ClientLogEntry {
  c?: number;
}

const g = globalThis as unknown as { __dgpLog?: { entries: Entry[]; installed: boolean; loadedAt: number } };

function state() {
  if (!g.__dgpLog) g.__dgpLog = { entries: [], installed: false, loadedAt: Date.now() };
  return g.__dgpLog;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (typeof window === 'undefined' || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state().entries));
    } catch {
      // 無痕模式或容量滿：只留記憶體
    }
  }, 600);
}

export function pushLog(k: string, m: string): void {
  if (typeof window === 'undefined') return;
  const s = state();
  const msg = m.length > 180 ? `${m.slice(0, 180)}…` : m;
  const now = Date.now();
  const last = s.entries[s.entries.length - 1];
  if (last && last.k === k && last.m === msg && now - last.t < MERGE_WINDOW_MS) {
    last.c = (last.c ?? 1) + 1;
    last.t = now;
  } else {
    s.entries.push({ t: now, k, m: msg });
    if (s.entries.length > MAX_ENTRIES) s.entries.splice(0, s.entries.length - MAX_ENTRIES);
  }
  scheduleSave();
}

/** 目前的紀錄（重複的連續事件已合併成「×N」） */
export function getLogs(): ClientLogEntry[] {
  return state().entries.map((e) => ({ t: e.t, k: e.k, m: e.c && e.c > 1 ? `${e.m} ×${e.c}` : e.m }));
}

export function collectEnv(): ReportEnv {
  if (typeof window === 'undefined') return {};
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timezone = undefined;
  }
  return {
    url: location.pathname + location.search,
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    online: navigator.onLine,
    connection: conn ? [conn.effectiveType, conn.downlink != null ? `${conn.downlink}Mbps` : '', conn.rtt != null ? `rtt${conn.rtt}ms` : ''].filter(Boolean).join(' ') : undefined,
    loadedAt: state().loadedAt,
    sentAt: Date.now(),
  };
}

// ------------------------------------------------------------ 安裝監聽 ---

function describeTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest('button, a, [role="button"], [role="tab"], [role="switch"], summary, label, input, select, textarea, canvas, dialog');
  if (!el) return null;
  if (el.closest('[data-nolog]')) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const type = (el as HTMLInputElement).type;
    return `${tag}${type && type !== 'text' ? `[${type}]` : ''}${el.id ? `#${el.id}` : ''}`;
  }
  if (tag === 'canvas') return 'canvas';
  const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const href = tag === 'a' ? (el.getAttribute('href') ?? '').split('?')[0].slice(0, 40) : '';
  return `${tag}${label ? ` 「${label}」` : ''}${href ? ` → ${href}` : ''}`;
}

function shortUrl(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw, location.href);
    return u.origin === location.origin ? u.pathname : `${u.host}${u.pathname}`;
  } catch {
    return 'unknown';
  }
}

function fmtArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ')
    .slice(0, 180);
}

export function installClientLog(): void {
  if (typeof window === 'undefined') return;
  const s = state();
  if (s.installed) return;
  s.installed = true;

  // 還原同一個分頁先前（例如重新整理前）的紀錄
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const old = JSON.parse(raw) as Entry[];
      if (Array.isArray(old)) s.entries = old.filter((e) => e && typeof e.t === 'number').slice(-MAX_ENTRIES);
    }
  } catch {
    // ignore
  }
  pushLog('system', `載入頁面 ${location.pathname}`);

  document.addEventListener(
    'click',
    (e) => {
      const d = describeTarget(e.target);
      if (d) pushLog('click', d);
    },
    true
  );
  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target instanceof HTMLFormElement ? e.target : null;
      if (f?.closest('[data-nolog]')) return;
      pushLog('click', `送出表單${f?.id ? `#${f.id}` : ''}`);
    },
    true
  );

  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window && e.target instanceof Element) {
      const src = (e.target as HTMLImageElement).src || (e.target as HTMLLinkElement).href || '';
      pushLog('error', `資源載入失敗 <${e.target.tagName.toLowerCase()}> ${src.split('?')[0].slice(-80)}`);
      return;
    }
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
    pushLog('error', `${e.message}${where}`);
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    pushLog('error', `未處理的 Promise 錯誤：${r instanceof Error ? `${r.name}: ${r.message}` : fmtArgs([r])}`);
  });

  for (const level of ['error', 'warn'] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      try {
        pushLog('console', `${level} ${fmtArgs(args)}`);
      } catch {
        // 紀錄本身不能影響原本的 console
      }
      original.apply(console, args);
    };
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = shortUrl(input);
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // 回報本身，以及 Next.js 的頁面預取（_rsc）不記，避免洗掉真正有用的紀錄
    if (url.startsWith('/api/bug-reports') || raw.includes('_rsc=')) return originalFetch(input, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const started = performance.now();
    try {
      const res = await originalFetch(input, init);
      pushLog('fetch', `${method} ${url} → ${res.status} ${Math.round(performance.now() - started)}ms`);
      return res;
    } catch (err) {
      pushLog('fetch', `${method} ${url} 失敗：${err instanceof Error ? err.message : 'network error'}`);
      throw err;
    }
  };

  document.addEventListener('visibilitychange', () => pushLog('system', document.visibilityState === 'hidden' ? '分頁切到背景' : '分頁回到前景'));
  window.addEventListener('online', () => pushLog('system', '網路恢復連線'));
  window.addEventListener('offline', () => pushLog('system', '網路中斷'));
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => pushLog('system', `視窗大小 ${window.innerWidth}x${window.innerHeight}`), 500);
  });
}

// ------------------------------------------------------------ Socket ---

/** socket.io 連線事件的最小結構，避免這個檔案依賴 socket.io-client 的型別 */
interface LoggableSocket {
  on(event: string, cb: (...args: unknown[]) => void): unknown;
  onAny(cb: (event: string, ...args: unknown[]) => void): unknown;
  onAnyOutgoing(cb: (event: string, ...args: unknown[]) => void): unknown;
}

/** 太頻繁、對除錯沒有幫助的事件不記 */
const SKIP_EVENTS = new Set(['stroke:points', 'room:playerListUpdated']);

export function attachSocketLog(socket: LoggableSocket): void {
  socket.on('connect', () => pushLog('socket', '已連線'));
  socket.on('disconnect', (reason) => pushLog('socket', `斷線：${String(reason)}`));
  socket.on('connect_error', (err) => pushLog('socket', `連線錯誤：${err instanceof Error ? err.message : String(err)}`));

  socket.onAnyOutgoing((event) => {
    if (!SKIP_EVENTS.has(event)) pushLog('socket', `送出 ${event}`);
  });
  socket.onAny((event, ...args) => {
    if (SKIP_EVENTS.has(event)) return;
    const p = args[0] as Record<string, unknown> | undefined;
    if (event === 'room:state' && p && typeof p === 'object') {
      const bits = [`status=${String(p.status)}`, p.roundPhase ? `phase=${String(p.roundPhase)}` : '', typeof p.currentRoundIndex === 'number' ? `round=${p.currentRoundIndex}/${String(p.roundCount)}` : ''];
      pushLog('socket', `收到 room:state ${bits.filter(Boolean).join(' ')}`);
    } else if (event === 'room:error' && p && typeof p.message === 'string') {
      pushLog('socket', `收到 room:error ${p.message}`);
    } else {
      pushLog('socket', `收到 ${event}`);
    }
  });
}
