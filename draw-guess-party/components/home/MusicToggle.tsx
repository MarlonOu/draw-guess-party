'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SRC = '/audio/party-loop.mp3';
const LOOP_SECONDS = 36.923; // 曲長（16 小節 @104 BPM），loopEnd 用它避開編碼器補償靜音
const VOLUME = 0.32;
const STORE_KEY = 'dg-music';

function readPref(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === 'on';
  } catch {
    return false;
  }
}
function writePref(on: boolean) {
  try {
    localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
  } catch {
    /* 隱私模式等情況下讀寫會丟例外，偏好記不住不影響播放 */
  }
}

/**
 * 首頁背景音樂開關。
 * - 預設靜音：瀏覽器本來就禁止自動播放，而且突然出聲對使用者不友善。
 * - 偏好為「開」時，等使用者在頁面上的第一個手勢才開始播（手勢是瀏覽器允許出聲的條件）。
 * - Web Audio 無縫循環；分頁切到背景時暫停；離開首頁（元件卸載）時一併關掉。
 */
export function MusicToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const onRef = useRef(false);

  const start = useCallback(async () => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return false;
    const ctx = ctxRef.current ?? new Ctx();
    ctxRef.current = ctx;
    await ctx.resume();
    if (!bufRef.current) {
      const res = await fetch(SRC);
      bufRef.current = await ctx.decodeAudioData(await res.arrayBuffer());
    }
    if (onRef.current) return true; // 等資料時已被別處啟動
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 0.9);
    gain.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = bufRef.current;
    src.loop = true;
    src.loopEnd = Math.min(LOOP_SECONDS, bufRef.current.duration);
    src.connect(gain);
    src.start();
    gainRef.current = gain;
    srcRef.current = src;
    onRef.current = true;
    return true;
  }, []);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    const src = srcRef.current;
    onRef.current = false;
    if (!ctx || !gain || !src) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    src.stop(ctx.currentTime + 0.4);
    srcRef.current = null;
    gainRef.current = null;
  }, []);

  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      if (await start()) {
        setOn(true);
        writePref(true);
      }
    } catch {
      setOn(false);
    } finally {
      setBusy(false);
    }
  }, [start]);

  const turnOff = useCallback(() => {
    stop();
    setOn(false);
    writePref(false);
  }, [stop]);

  // 上次選了「開」：等第一個手勢再播（不在按鈕本身上觸發，避免和點擊事件互相抵銷）
  useEffect(() => {
    if (!readPref()) return;
    const arm = (e: Event) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      cleanup();
      void turnOn();
    };
    const cleanup = () => {
      window.removeEventListener('pointerup', arm);
      window.removeEventListener('keydown', arm);
    };
    window.addEventListener('pointerup', arm);
    window.addEventListener('keydown', arm);
    return cleanup;
  }, [turnOn]);

  // 分頁切走就暫停，回來再接上
  useEffect(() => {
    const onVis = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend();
      else if (onRef.current) void ctx.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 離開首頁：關掉音訊
  useEffect(
    () => () => {
      onRef.current = false;
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    []
  );

  return (
    <button
      ref={btnRef}
      type="button"
      className="hm-music"
      aria-pressed={on}
      aria-label={on ? '關閉背景音樂' : '開啟背景音樂'}
      disabled={busy}
      onClick={() => (on ? turnOff() : void turnOn())}
    >
      <span className={`hm-music-eq${on ? ' is-on' : ''}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="hm-music-label" aria-hidden="true">
        {busy ? '載入中' : on ? '音樂 開' : '音樂 關'}
      </span>
    </button>
  );
}
