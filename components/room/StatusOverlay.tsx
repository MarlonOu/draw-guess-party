'use client';

import type { ReactNode } from 'react';
import { StatusIcon, type StatusIconKind } from './StatusIcon';

interface StatusOverlayProps {
  icon: StatusIconKind;
  iconColor: string;
  title: string;
  children?: ReactNode;
}

/**
 * 畫布疊層通知的統一外殼：圖示 + 標題 + 內容，所有「遊戲關鍵通知」
 * （尚未開始、選題中、等待選題、公布答案、比賽結束）都套用同一套版型，
 * 只是圖示種類、圖示底色、標題文字、內容不同，確保視覺語言一致。
 */
export function StatusOverlay({ icon, iconColor, title, children }: StatusOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255,255,255,0.96)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <StatusIcon kind={icon} color={iconColor} />
      <h2 style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.01em' }}>{title}</h2>
      {children}
    </div>
  );
}
