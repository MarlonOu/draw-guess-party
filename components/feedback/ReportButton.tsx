'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { collectEnv, getLogs } from '../../lib/client/clientLog';
import { REPORT_CATEGORIES, REPORT_CATEGORY_LABEL, type ReportCategory } from '../../lib/types/report';

export type ReportButtonVariant = 'fab' | 'icon' | 'inline';

interface ReportButtonProps {
  /** fab：全站右下／左下浮動按鈕；icon：房間標題列的小圖示按鈕；inline：一般文字按鈕（例如錯誤頁） */
  variant?: ReportButtonVariant;
  /** 預先帶入的內容（例如錯誤頁帶入錯誤訊息） */
  prefill?: { message?: string; category?: ReportCategory };
  label?: string;
}

const MESSAGE_MAX = 1000;
const CATEGORY_HINT: Record<ReportCategory, string> = {
  bug: '按了沒反應、卡住、出現錯誤訊息',
  layout: '文字被切到、按鈕重疊、畫面歪掉',
  gameplay: '計分、順序、計時看起來不對',
  other: '建議或其他想告訴我們的事',
};

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

type Phase = 'form' | 'sending' | 'done';

/**
 * 「回報問題」按鈕＋彈窗。送出時自動附上：最近的操作／系統紀錄（見 lib/client/clientLog.ts）
 * 與裝置、頁面資訊，玩家只需要寫「發生了什麼事」。
 * 彈窗內的互動標記 data-nolog，不會被寫進操作紀錄。
 */
export function ReportButton({ variant = 'fab', prefill, label = '回報問題' }: ReportButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const errId = useId();
  const [category, setCategory] = useState<ReportCategory>(prefill?.category ?? 'bug');
  const [message, setMessage] = useState(prefill?.message ?? '');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      setError(null);
      if (phase === 'done') {
        setPhase('form');
        setMessage('');
        setContact('');
      }
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [phase]);

  const open = () => {
    setError(null);
    if (phase === 'done') setPhase('form');
    dialogRef.current?.showModal();
    // 稍後再聚焦，避免 iOS 在彈窗動畫中跳出鍵盤把版面推走
    setTimeout(() => textRef.current?.focus({ preventScroll: true }), 50);
  };

  const close = () => dialogRef.current?.close();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === 'sending') return;
    if (message.trim().length < 5) {
      setError('請至少寫 5 個字，說明發生了什麼事');
      textRef.current?.focus();
      return;
    }
    setPhase('sending');
    setError(null);
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message, contact, website, logs: getLogs(), env: collectEnv() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? '送出失敗，請稍後再試');
        setPhase('form');
        return;
      }
      setReportId(typeof data.id === 'string' ? data.id.slice(0, 8).toUpperCase() : '');
      setPhase('done');
    } catch {
      setError('網路連線有問題，沒有送出，請檢查網路後再試一次');
      setPhase('form');
    }
  };

  const trigger =
    variant === 'fab' ? (
      <button type="button" className="rp-fab" onClick={open} aria-haspopup="dialog" aria-label={label} data-nolog>
        <FlagIcon />
        <span className="rp-fab-label">{label}</span>
      </button>
    ) : variant === 'icon' ? (
      <button type="button" className="dg-btn dg-btn-sm rp-icon-btn" onClick={open} aria-haspopup="dialog" aria-label={label} title={label} data-nolog>
        <FlagIcon />
      </button>
    ) : (
      <button type="button" className="dg-btn" onClick={open} aria-haspopup="dialog" data-nolog>
        <FlagIcon />
        <span>{label}</span>
      </button>
    );

  return (
    <>
      {trigger}
      <dialog ref={dialogRef} className="dg-card rm-dialog rp-dialog" aria-labelledby={titleId} data-nolog>
        {phase === 'done' ? (
          <div className="rm-dialog-body">
            <h2 id={titleId} className="rm-dialog-title">已收到，謝謝你</h2>
            <p className="dg-hint">我們會查看這筆回報{reportId && <>（編號 <strong>{reportId}</strong>）</>}。有需要時會用你留的聯絡方式回覆。</p>
            <div className="rm-dialog-actions">
              <button type="button" className="dg-btn dg-btn-primary" onClick={close}>
                關閉
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="rm-dialog-body">
            <h2 id={titleId} className="rm-dialog-title">回報問題</h2>
            <p className="dg-hint">遇到錯誤、跑版，或覺得哪裡怪怪的？寫下來，我們會查看。</p>

            <fieldset className="rp-field">
              <legend className="dg-label">問題類型</legend>
              <div className="rp-chips" role="group" aria-label="問題類型">
                {REPORT_CATEGORIES.map((c) => (
                  <button key={c} type="button" className="dg-chip dg-chip-sm" aria-pressed={category === c} onClick={() => setCategory(c)}>
                    {REPORT_CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
              <p className="dg-hint rp-cat-hint">{CATEGORY_HINT[category]}</p>
            </fieldset>

            <div className="dg-field">
              <label htmlFor={`${titleId}-msg`} className="dg-label">發生了什麼事？</label>
              <textarea
                id={`${titleId}-msg`}
                ref={textRef}
                className="dg-input rp-textarea"
                rows={4}
                maxLength={MESSAGE_MAX}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setError(null);
                }}
                placeholder="例如：畫完按下送出後，畫面一直停在「等待其他人」"
                aria-invalid={error !== null}
                aria-describedby={error ? errId : undefined}
              />
              <span className="rp-count" aria-hidden="true">{message.length}/{MESSAGE_MAX}</span>
            </div>

            <div className="dg-field">
              <label htmlFor={`${titleId}-contact`} className="dg-label">聯絡方式（選填）</label>
              <input
                id={`${titleId}-contact`}
                className="dg-input"
                value={contact}
                maxLength={80}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email 或 LINE，需要追問時才會用到"
                autoComplete="off"
              />
            </div>

            {/* 蜜罐：真人看不到 */}
            <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="rp-honey" />

            <p className="dg-hint">送出時會自動附上裝置資訊與最近的操作紀錄，協助我們重現問題。</p>

            {error && (
              <p id={errId} className="rm-dialog-error" role="alert">
                {error}
              </p>
            )}

            <div className="rm-dialog-actions">
              <button type="submit" className="dg-btn dg-btn-primary" disabled={phase === 'sending'}>
                {phase === 'sending' ? '送出中…' : '送出回報'}
              </button>
              <button type="button" className="dg-btn dg-btn-ghost" onClick={close}>
                取消
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
