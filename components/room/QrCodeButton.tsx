'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeButtonProps {
  /** 要編碼成 QR code 的內容，通常是邀請連結網址 */
  value: string;
  /** 按鈕的無障礙標籤 */
  label: string;
}

/**
 * 一鍵顯示 QR code 的按鈕：點擊後在按鈕下方彈出一個小面板，用 `qrcode` 套件把
 * 傳入的網址即時轉成 QR code 圖片（data URL，直接塞進 <img>，不需要額外的
 * canvas 操作或後端產圖服務）。比照另一個猜歌專案已有的分享機制，讓現場其他人
 * 可以直接掃碼加入房間，不用手動輸入房間代碼或複製貼上連結。
 *
 * 面板用簡單的「點擊按鈕切換顯示/隱藏＋點擊面板以外區域自動收合」實作，不引入
 * 額外的 modal/popover library——這個互動夠單純，不值得為此多一個依賴。
 */
export function QrCodeButton({ value, label }: QrCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(value, { width: 200, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' } })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // 產生失敗（理論上不太會發生，value 是純文字網址）就安靜收合，不用跳錯誤訊息
        if (!cancelled) setOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        className="dg-btn"
        style={{
          padding: '4px 10px',
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
        </svg>
        QR Code
      </button>

      {open && (
        <div
          className="dg-card"
          style={{
            position: 'absolute',
            top: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            width: 220,
          }}
        >
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 動態產生的 data URL，不是靜態素材，不適用 next/image 的最佳化流程
            <img src={dataUrl} alt="房間邀請連結的 QR code" width={196} height={196} style={{ borderRadius: 'var(--radius-sm)' }} />
          ) : (
            <div style={{ width: 196, height: 196, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>產生中…</span>
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center' }}>掃描加入房間</p>
        </div>
      )}
    </div>
  );
}
