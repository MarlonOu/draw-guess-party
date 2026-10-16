'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const MIN_THUMB = 56;
/** 內容只比視窗多一點點時不顯示，免得每個幾乎一屏的頁面都多一條軸 */
const MIN_OVERFLOW = 60;

/**
 * 手機版右側的「可拖曳捲軸」。
 *
 * 為什麼需要：手機瀏覽器的原生捲軸只在滑動的瞬間才出現，頁面上的卡片又常常在螢幕底部被
 * 切到一半，玩家分不出「這是頁面結尾」還是「下面還有內容」，結果停在原地不敢往下滑。
 * 這條軸常駐在畫面右側（平常半透明、捲動或拖曳時變明顯），一眼就能看出頁面長度與目前位置，
 * 並且可以直接按住拖曳快速移動；點軸的空白處則是翻一頁。
 *
 * 只在手機寬度（≤820px）或觸控裝置顯示。房間頁因為有畫布，右緣的手指動作要留給畫圖，
 * 所以那裡只有「滑塊本身」可以操作，軌道的空白處不攔截觸控。
 */
export function MobileScrollbar() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hint, setHint] = useState(false);
  const hintedRef = useRef(false);
  const metrics = useRef({ maxScroll: 0, trackH: 0, thumbH: 0 });
  const activeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);

  const inRoom = pathname.startsWith('/online/room/');

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!root || !track || !thumb) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const viewH = window.innerHeight;
      const maxScroll = doc.scrollHeight - viewH;
      const trackH = track.clientHeight;
      const show = maxScroll > MIN_OVERFLOW && trackH > MIN_THUMB + 20;
      setVisible((v) => (v === show ? v : show));
      if (!show) return;

      const thumbH = Math.min(trackH, Math.max(MIN_THUMB, (trackH * viewH) / doc.scrollHeight));
      const ratio = Math.min(1, Math.max(0, window.scrollY / maxScroll));
      metrics.current = { maxScroll, trackH, thumbH };
      thumb.style.height = `${thumbH}px`;
      thumb.style.transform = `translateY(${ratio * (trackH - thumbH)}px)`;
      thumb.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));

      if (!hintedRef.current) {
        hintedRef.current = true;
        setHint(true);
        setTimeout(() => setHint(false), 2600);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const markActive = () => {
      root.classList.add('is-active');
      if (activeTimer.current) clearTimeout(activeTimer.current);
      activeTimer.current = setTimeout(() => {
        if (!draggingRef.current) root.classList.remove('is-active');
      }, 900);
    };
    const onScroll = () => {
      schedule();
      markActive();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    ro.observe(document.body);
    schedule();
    // 換頁後內容是非同步載入的，補量幾次
    const t1 = setTimeout(schedule, 300);
    const t2 = setTimeout(schedule, 1200);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      ro.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      if (raf) cancelAnimationFrame(raf);
      if (activeTimer.current) clearTimeout(activeTimer.current);
    };
  }, [pathname]);

  const jumpTo = (top: number, smooth = false) => {
    window.scrollTo({ top, behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior) });
  };

  const onThumbDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    const startY = e.clientY;
    const startScroll = window.scrollY;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    root?.classList.add('is-active', 'is-dragging');

    const onMove = (ev: PointerEvent) => {
      const { maxScroll, trackH, thumbH } = metrics.current;
      const travel = trackH - thumbH;
      if (travel <= 0) return;
      jumpTo(startScroll + ((ev.clientY - startY) * maxScroll) / travel);
    };
    const onEnd = () => {
      draggingRef.current = false;
      root?.classList.remove('is-dragging');
      activeTimer.current = setTimeout(() => root?.classList.remove('is-active'), 900);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
  };

  const onTrackDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const thumbTop = rect.top + (thumbRef.current ? parseFloat(thumbRef.current.style.transform.replace(/[^\d.-]/g, '') || '0') : 0);
    const page = window.innerHeight * 0.85;
    jumpTo(window.scrollY + (e.clientY < thumbTop ? -page : page), true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const page = window.innerHeight * 0.85;
    const map: Record<string, number | 'top' | 'bottom'> = {
      ArrowUp: -60,
      ArrowDown: 60,
      PageUp: -page,
      PageDown: page,
      Home: 'top',
      End: 'bottom',
    };
    const v = map[e.key];
    if (v === undefined) return;
    e.preventDefault();
    const { maxScroll } = metrics.current;
    jumpTo(v === 'top' ? 0 : v === 'bottom' ? maxScroll : window.scrollY + v, true);
  };

  return (
    <div
      ref={rootRef}
      className={`ms${visible ? ' is-visible' : ''}${hint ? ' is-hint' : ''}${inRoom ? ' is-room' : ''}`}
      aria-hidden={visible ? undefined : true}
      data-nolog
    >
      <div ref={trackRef} className="ms-track" onPointerDown={onTrackDown}>
        <div
          ref={thumbRef}
          className="ms-thumb"
          role="scrollbar"
          aria-controls="main"
          aria-orientation="vertical"
          aria-label="頁面捲動軸，拖曳可上下移動"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          tabIndex={visible ? 0 : -1}
          onPointerDown={onThumbDown}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
