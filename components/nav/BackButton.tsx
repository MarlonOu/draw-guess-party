'use client';

import { useRouter } from 'next/navigation';

interface BackButtonProps {
  /** 明確指定返回目標；不指定時使用瀏覽器歷史記錄（router.back()） */
  href?: string;
  label?: string;
  onBeforeLeave?: () => void;
}

/**
 * 統一的返回按鈕，用於除了首頁以外的所有頁面。
 * 房間頁面會傳入 onBeforeLeave 在離開前先呼叫 leaveRoom()，
 * 避免玩家離開房間畫面卻沒有真的離開房間（伺服器仍認為他在線上）。
 */
export function BackButton({ href, label = '返回', onBeforeLeave }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    onBeforeLeave?.();
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="dg-btn"
      style={{ padding: '8px 14px', fontSize: 14 }}
    >
      ‹ {label}
    </button>
  );
}
