'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

/**
 * 「選這個玩法」按鈕：點下後立刻鎖定，避免路由載入期間連點
 * （連點在 iOS Safari 會被當成雙擊縮放，導致整頁放大）。
 */
export function ModeCta({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Link
      href={href}
      className="dg-btn hm-mode-cta"
      aria-label={label}
      aria-busy={busy}
      onClick={() => setBusy(true)}
    >
      {children}
    </Link>
  );
}
