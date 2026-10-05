'use client';

import { useState } from 'react';

interface CopyButtonProps {
  value: string;
  label: string;
  /** 按鈕上的文字，預設「複製」 */
  text?: string;
}

/**
 * 一鍵複製按鈕（房間代碼、邀請連結共用）。
 * `navigator.clipboard` 在非 HTTPS 或使用者拒絕權限時可能失敗，安靜忽略即可，
 * 沒複製成功頂多使用者自己手動選取文字，不是需要跳錯誤訊息打斷體驗的等級。
 * 複製成功後文字短暫變成「已複製」並以 aria-live 通知讀屏使用者。
 */
export function CopyButton({ value, label, text = '複製' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 忽略：複製失敗不影響其他功能
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={`dg-btn dg-btn-sm${copied ? ' dg-btn-mint' : ''}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {copied ? (
          <path d="M5 13l4 4L19 7" />
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
      <span aria-live="polite">{copied ? '已複製' : text}</span>
    </button>
  );
}
