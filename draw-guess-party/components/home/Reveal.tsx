'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * 捲動進場：元素進入視窗時才淡入上移，並觸發內部 SVG 描線動畫（.is-in .art .d）。
 *
 * 關鍵設計——「先可見、後隱藏」：SSR 與無 JS 時內容一律完整可見；掛載後只對「尚在視窗下方」
 * 的元素才加上 .rv-armed（隱藏起始狀態），已經在視窗內的直接標成 .is-in。
 * 這樣不會有「內容先閃一下再消失」，JS 失效也不會讓整段內容永遠看不見。
 * 「減少動態效果」時 pages.css 會強制取消隱藏。
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  children,
}: {
  as?: ElementType;
  /** 同一組元素的階梯延遲（單位 90ms） */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
      el.classList.add('is-in');
      return;
    }
    el.classList.add('rv-armed');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-in');
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={className} style={{ ['--d' as string]: delay }}>
      {children}
    </Tag>
  );
}
