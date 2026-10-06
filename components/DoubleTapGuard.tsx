'use client';

import { useEffect } from 'react';

/**
 * 擋掉 iOS 的「雙擊縮放」與 Safari 的手勢縮放放大（遊戲操作需要連點，不該縮放頁面）。
 * - 350ms 內連續兩次 touchend → preventDefault（輸入框、canvas 例外，維持游標與繪圖行為）
 * - gesturestart（Safari 專有的捏合手勢）→ preventDefault
 */
export function DoubleTapGuard() {
  useEffect(() => {
    let last = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, canvas, [contenteditable="true"]')) return;
      const now = Date.now();
      if (now - last < 350) e.preventDefault();
      last = now;
    };
    const onGesture = (e: Event) => e.preventDefault();
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('gesturestart', onGesture);
    return () => {
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('gesturestart', onGesture);
    };
  }, []);
  return null;
}
