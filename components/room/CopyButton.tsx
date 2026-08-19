'use client';

import { useState } from 'react';

interface CopyButtonProps {
  value: string;
  label: string;
}

/**
 * 一鍵複製按鈕（房間代碼、邀請連結共用）。
 * `navigator.clipboard` 在非 HTTPS 或使用者拒絕權限時可能失敗，安靜忽略即可，
 * 沒複製成功頂多使用者自己手動選取文字，不是需要跳錯誤訊息打斷體驗的等級。
 */
export function CopyButton({ value, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略：複製失敗不影響其他功能
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {copied ? '已複製' : '複製'}
    </button>
  );
}
