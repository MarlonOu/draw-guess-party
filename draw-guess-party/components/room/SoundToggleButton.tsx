'use client';

import { useEffect, useState } from 'react';
import { isMuted, setMuted } from '../../lib/audio/soundEffects';

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M19 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function SpeakerMutedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M17 9l5 6" />
      <path d="M22 9l-5 6" />
    </svg>
  );
}

/**
 * 音效靜音切換按鈕。靜音狀態存在 localStorage（見 soundEffects.ts 的 isMuted/setMuted），
 * 這裡只是提供一個可以切換它的 UI，本身不直接控制任何音效播放邏輯——那些邏輯在
 * playTones() 內部統一檢查 isMuted()，這個按鈕只負責改變那個開關的值。
 *
 * 用 useState + useEffect 讀取初始值而不是直接在 render 時呼叫 isMuted()：
 * isMuted() 內部會讀 localStorage，SSR 階段沒有 localStorage，為了避免 SSR
 * 與 client 第一次渲染結果不一致（hydration mismatch），統一讓初始值先是
 * 「不確定」，掛載後才在 client 端讀出真正的值。
 */
export function SoundToggleButton() {
  const [muted, setMutedState] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 讀取 localStorage，只能在掛載後的 client 端執行，非衍生渲染狀態，且是為了避免 SSR/CSR 首次渲染結果不一致
    setMutedState(isMuted());
  }, []);

  const toggle = () => {
    const next = !(muted ?? false);
    setMuted(next);
    setMutedState(next);
  };

  const isOn = muted ?? false;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isOn ? '取消靜音' : '靜音音效'}
      aria-pressed={isOn}
      className="dg-btn"
      style={{
        width: 36,
        height: 36,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {isOn ? <SpeakerMutedIcon /> : <SpeakerIcon />}
    </button>
  );
}
