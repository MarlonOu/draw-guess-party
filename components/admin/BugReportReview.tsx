'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  REPORT_CATEGORY_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_STATUSES,
  type BugReport,
  type BugReportSummary,
  type ReportStatus,
} from '../../lib/types/report';

type Counts = Record<ReportStatus, number>;

const MODE_NAME: Record<string, string> = {
  DRAW_GUESS: '你畫我猜',
  DRAW_TELEPHONE: '畫圖接龍',
  FRAGMENT_DRAW: '拼圖接畫',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function clock(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 把 User-Agent 縮成「iPhone · Safari 17」這種一眼能看懂的描述 */
function describeDevice(ua?: string): string {
  if (!ua) return '未知裝置';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : '其他系統';
  const pick = (re: RegExp, name: string) => {
    const m = ua.match(re);
    return m ? `${name} ${m[1].split('.')[0]}` : null;
  };
  const browser =
    pick(/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge') ??
    pick(/(?:CriOS|Chrome)\/([\d.]+)/, 'Chrome') ??
    pick(/(?:FxiOS|Firefox)\/([\d.]+)/, 'Firefox') ??
    pick(/Version\/([\d.]+).*Safari/, 'Safari') ??
    '瀏覽器';
  return `${os} · ${browser}`;
}

/**
 * 題庫管理後台最下方的「錯誤回報」區塊：
 * 玩家回報會連同前端自動收集的操作紀錄與裝置資訊一起存下來，這裡依狀態分頁瀏覽，
 * 展開單筆可看完整 log（點擊、換頁、網路請求、socket 事件、錯誤），並設定處理狀態與備註。
 */
export function BugReportReview() {
  const [items, setItems] = useState<BugReportSummary[]>([]);
  const [counts, setCounts] = useState<Counts>({ open: 0, in_progress: 0, resolved: 0, wontfix: 0 });
  const [tab, setTab] = useState<ReportStatus>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BugReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/reports');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.reports);
      setCounts(data.counts);
      setError(null);
    } catch {
      setError('讀取回報失敗，請重新整理');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時讀取遠端資料，非同步呼叫
    void load();
  }, [load]);

  const visible = useMemo(() => items.filter((r) => r.status === tab), [items, tab]);

  const toggleDetail = async (r: BugReportSummary) => {
    if (openId === r.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(r.id);
    setDetail(null);
    setNoteDraft(r.adminNote ?? '');
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/reports/${r.id}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      setError('讀取這筆回報的紀錄失敗');
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError('更新失敗');
        return;
      }
      const updated: BugReport = await res.json();
      if (openId === id) setDetail(updated);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('永久刪除這筆回報與它的操作紀錄？')) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/reports/${id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!res.ok) {
      setError('刪除失敗');
      return;
    }
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
    }
    await load();
  };

  const copyAll = async (r: BugReport) => {
    const lines = [
      `[${REPORT_CATEGORY_LABEL[r.category]}] ${r.message}`,
      `時間：${r.createdAt}`,
      `頁面：${r.env.url ?? ''}`,
      `裝置：${r.env.userAgent ?? ''}`,
      `視窗：${r.env.viewport ?? ''}`,
      r.room ? `房間：${JSON.stringify(r.room)}` : '',
      '',
      ...r.logs.map((l) => `${clock(l.t)} [${l.k}] ${l.m}`),
    ].filter((l, i) => l !== '' || i > 0);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('複製失敗，請手動選取紀錄');
    }
  };

  return (
    <section className="dg-card adm-sub adm-rep" aria-labelledby="adm-rep-title">
      <div className="adm-sub-head">
        <h2 id="adm-rep-title" className="adm-h2">
          錯誤回報
          {counts.open > 0 && <span className="adm-badge" aria-label={`${counts.open} 筆未處理`}>{counts.open}</span>}
        </h2>
        <div
          className="dg-seg adm-tabs"
          role="tablist"
          aria-label="回報狀態"
          style={{ ['--n' as string]: 4, ['--idx' as string]: REPORT_STATUSES.indexOf(tab), width: 'min(100%, 420px)' }}
        >
          <span className="dg-seg-thumb" aria-hidden="true" />
          {REPORT_STATUSES.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)}>
              {REPORT_STATUS_LABEL[s]} {counts[s]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="dg-notice" role="alert">{error}</div>}

      {loading ? (
        <p>載入中…</p>
      ) : visible.length === 0 ? (
        <p className="adm-empty">{tab === 'open' ? '目前沒有未處理的回報。' : '沒有紀錄。'}</p>
      ) : (
        <ul className="adm-list">
          {visible.map((r) => {
            const isOpen = openId === r.id;
            return (
              <li key={r.id} className="adm-item">
                <div className="adm-item-main">
                  <p className="adm-item-text">
                    <span className="dg-tag">{REPORT_CATEGORY_LABEL[r.category]}</span>
                    <span className="adm-item-meta" style={{ margin: 0 }}>{formatTime(r.createdAt)}</span>
                  </p>
                  <p className="adm-rep-msg">{r.message}</p>
                  <div className="adm-rep-meta">
                    <span>{describeDevice(r.env.userAgent)}</span>
                    {r.env.viewport && <span>視窗 {r.env.viewport}</span>}
                    {r.env.url && <span>頁面 {r.env.url}</span>}
                    {r.room && (
                      <span>
                        房間 {r.room.joinCode}（{MODE_NAME[r.room.mode] ?? r.room.mode}・{r.room.status}・{r.room.connectedCount}/{r.room.playerCount} 人在線）
                      </span>
                    )}
                    {r.contact && <span>聯絡：{r.contact}</span>}
                    <span>{r.logCount} 筆紀錄</span>
                  </div>
                  {r.adminNote && <p className="adm-rep-note">備註：{r.adminNote}</p>}
                </div>

                <div className="adm-item-actions">
                  <button type="button" className="dg-btn dg-btn-sm" onClick={() => toggleDetail(r)} aria-expanded={isOpen}>
                    {isOpen ? '收合' : '看紀錄／處理'}
                  </button>
                </div>

                {isOpen && (
                  <div className="adm-rep-detail">
                    {detailLoading || !detail ? (
                      <p>載入中…</p>
                    ) : (
                      <>
                        <div className="adm-rep-status" role="group" aria-label="處理狀態">
                          {REPORT_STATUSES.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="dg-chip dg-chip-sm"
                              aria-pressed={detail.status === s}
                              disabled={busyId === r.id}
                              onClick={() => patch(r.id, { status: s })}
                            >
                              {REPORT_STATUS_LABEL[s]}
                            </button>
                          ))}
                        </div>

                        <div className="adm-rep-edit">
                          <input
                            className="dg-input"
                            aria-label="管理員備註"
                            placeholder="備註（處理方式、版本…）"
                            maxLength={500}
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <button type="button" className="dg-btn dg-btn-sm" disabled={busyId === r.id} onClick={() => patch(r.id, { adminNote: noteDraft })}>
                            儲存備註
                          </button>
                        </div>

                        <dl className="adm-rep-env">
                          <dt>回報編號</dt><dd>{detail.id}</dd>
                          <dt>裝置</dt><dd>{detail.env.userAgent}</dd>
                          <dt>視窗／螢幕</dt><dd>{detail.env.viewport ?? '-'}／{detail.env.screen ?? '-'}{detail.env.pixelRatio ? `（×${detail.env.pixelRatio}）` : ''}{detail.env.touch ? '・觸控' : ''}</dd>
                          <dt>語言／時區</dt><dd>{detail.env.language ?? '-'}／{detail.env.timezone ?? '-'}</dd>
                          <dt>網路</dt><dd>{detail.env.online === false ? '離線' : '在線'}{detail.env.connection ? `・${detail.env.connection}` : ''}</dd>
                          {detail.room && (
                            <>
                              <dt>房間快照</dt>
                              <dd>
                                {detail.room.joinCode}・{MODE_NAME[detail.room.mode] ?? detail.room.mode}・{detail.room.status}・第 {detail.room.roundIndex ?? '-'}/{detail.room.roundCount ?? '-'} 輪・畫圖 {detail.room.roundDurationSec ?? '-'} 秒
                              </dd>
                            </>
                          )}
                          {detail.env.loadedAt && detail.env.sentAt && (
                            <>
                              <dt>停留時間</dt><dd>回報時已在頁面約 {Math.round((detail.env.sentAt - detail.env.loadedAt) / 1000)} 秒</dd>
                            </>
                          )}
                        </dl>

                        <div className="adm-rep-edit">
                          <strong>操作紀錄（{detail.logs.length}）</strong>
                          <button type="button" className="dg-btn dg-btn-sm dg-btn-ghost" onClick={() => copyAll(detail)}>
                            {copied ? '已複製' : '複製全部'}
                          </button>
                        </div>
                        <pre className="adm-rep-log" tabIndex={0} aria-label="操作紀錄">
                          {detail.logs.length === 0
                            ? '（沒有紀錄）'
                            : detail.logs.map((l, i) => (
                                <span key={i} className={`k-${l.k}`}>
                                  {clock(l.t)} [{l.k}] {l.m}
                                  {'\n'}
                                </span>
                              ))}
                        </pre>

                        <div>
                          <button type="button" className="dg-btn dg-btn-sm dg-btn-ghost" disabled={busyId === r.id} onClick={() => remove(r.id)}>
                            刪除這筆回報
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
