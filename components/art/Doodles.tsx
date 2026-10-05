import type { CSSProperties, ReactNode } from 'react';

/**
 * 全站共用的手繪風 SVG 插圖與裝飾。
 *
 * 描線動畫的做法：每條要「被畫出來」的路徑加上 class="d" 與 pathLength="1"，
 * 外層（svg 本身或任一祖先）出現 `.art-on` 或 `.is-in` 時，才套用
 * `stroke-dasharray:1` + 從 dashoffset:1 畫到 0 的動畫（見 pages.css）。
 * 動畫用 `both` 填充模式——延遲期間維持「還沒畫」的起始狀態，結束後是完整線條；
 * 沒有 JS、沒有 .art-on、或使用者開了「減少動態效果」時，路徑就是完整可見，
 * 不會因為動畫沒跑而整張圖消失。
 */

const k = (n: number): CSSProperties => ({ ['--k' as string]: n });

interface ArtProps {
  className?: string;
  /** 一載入就播放描線動畫（不用等捲動進場） */
  live?: boolean;
  title?: string;
}

function Svg({
  viewBox,
  className,
  live,
  title,
  children,
}: ArtProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      className={`art${live ? ' art-on' : ''}${className ? ` ${className}` : ''}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="var(--ink)"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/* ---------------------------------------------------------------- Logo --- */

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="dg-logomark"
    >
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="13"
        transform="rotate(-6 24 24)"
        fill="var(--accent)"
        stroke="var(--ink)"
        strokeWidth="3"
      />
      <path
        d="M13 31c4-14 9-16 11-9 2 6 6 4 11-8"
        stroke="var(--ink)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35" cy="14" r="3.2" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
    </svg>
  );
}

/* ------------------------------------------------------------ 裝飾小物 --- */

export function Star({ size = 28, fill = 'var(--amber)', className }: { size?: number; fill?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M16 3l3.6 8.1 8.9.9-6.7 5.9 1.9 8.7L16 22l-7.7 4.6 1.9-8.7-6.7-5.9 8.9-.9L16 3z"
        fill={fill}
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sparkle({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5.5 5.5l3.5 3.5M15 15l3.5 3.5M18.5 5.5L15 9M9 15l-3.5 3.5" />
    </svg>
  );
}

export function Squiggle({ width = 120, color = 'var(--accent)', className }: { width?: number; color?: string; className?: string }) {
  return (
    <svg width={width} height={width * 0.16} viewBox="0 0 120 20" className={className} aria-hidden="true" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12c9-12 14 10 24 0s14 10 24 0 14 10 24 0 14 10 24 0 10 6 14 2" />
    </svg>
  );
}

export function ArrowDoodle({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      width="72"
      height="44"
      viewBox="0 0 72 44"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="var(--ink)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M4 30C16 6 38 4 62 18" />
      <path d="M50 8l13 11-16 6" />
    </svg>
  );
}

/* --------------------------------------------------- 標題手繪強調線 ------- */

export function ScribbleUnderline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" className={`art art-on ${className ?? ''}`} aria-hidden="true" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round">
      <path className="d" pathLength={1} style={k(2)} d="M6 14C60 4 120 20 180 10S270 12 294 8" />
    </svg>
  );
}

export function ScribbleCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 150" preserveAspectRatio="none" className={`art art-on ${className ?? ''}`} aria-hidden="true" fill="none" stroke="var(--blue)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
      <path className="d" pathLength={1} style={k(4)} d="M150 10C70 6 10 34 12 78c2 44 74 66 150 62 78-4 128-34 124-78C282 24 214 4 138 12" />
    </svg>
  );
}

/* ----------------------------------------------------- 三種玩法插圖 ------- */

/** 你畫我猜：一人畫、大家搶答 */
export function ArtDrawGuess(props: ArtProps) {
  return (
    <Svg viewBox="0 0 240 180" {...props}>
      <g transform="rotate(-4 80 70)">
        <rect x="18" y="26" width="128" height="104" rx="8" fill="#fff" />
        <path className="d" pathLength={1} style={k(1)} stroke="var(--accent)" strokeWidth="5" d="M82 44l9 20 22 2-17 14 5 22-19-11-19 11 5-22-17-14 22-2z" fill="var(--amber)" />
        <path className="d" pathLength={1} style={k(3)} strokeWidth="3" stroke="var(--blue)" d="M36 112c18-10 34 4 52-2s30-4 44 0" />
      </g>
      <g transform="rotate(38 150 118)">
        <path className="d" pathLength={1} style={k(4)} fill="var(--amber)" d="M126 108h46l12 10-12 10h-46z" />
        <path className="d" pathLength={1} style={k(5)} d="M172 108l12 10-12 10" fill="var(--ink)" />
        <path className="d" pathLength={1} style={k(5)} d="M138 108v20" />
      </g>
      <g>
        <path className="d" pathLength={1} style={k(6)} fill="var(--blue-soft)" d="M156 18h62a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8h-34l-12 12v-12h-16a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z" />
        <path className="d" pathLength={1} style={k(7)} strokeWidth="5" d="M178 30c0-8 20-8 20 0 0 7-10 6-10 14M188 54v.5" />
        <path className="d" pathLength={1} style={k(8)} fill="var(--green-soft)" d="M176 120h46a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8h-8v10l-12-10h-26a8 8 0 0 1-8-8v-22a8 8 0 0 1 8-8z" />
        <path className="d" pathLength={1} style={k(9)} strokeWidth="5" d="M200 128v14M200 150v.5" />
      </g>
    </Svg>
  );
}

/** 畫圖接龍：題目 → 畫 → 猜，一棒傳一棒 */
export function ArtTelephone(props: ArtProps) {
  return (
    <Svg viewBox="0 0 240 180" {...props}>
      <g transform="rotate(-3 36 70)">
        <rect className="d" pathLength={1} style={k(0)} x="10" y="44" width="58" height="68" rx="8" fill="var(--amber-soft)" />
        <path className="d" pathLength={1} style={k(1)} strokeWidth="5" d="M26 70h26M26 84h18M26 98h22" />
      </g>
      <path className="d" pathLength={1} style={k(2)} strokeWidth="3" strokeDasharray="1" d="M72 78c8-12 16-12 24 0" />
      <path className="d" pathLength={1} style={k(2)} strokeWidth="3" d="M90 70l7 9-11 3" />
      <g transform="rotate(2 120 78)">
        <rect className="d" pathLength={1} style={k(3)} x="92" y="40" width="58" height="76" rx="8" fill="#fff" />
        <path className="d" pathLength={1} style={k(4)} stroke="var(--accent)" strokeWidth="5" d="M106 86c2-16 10-22 18-22s14 8 12 22-8 14-14 14-17-2-16-14z" />
        <path className="d" pathLength={1} style={k(5)} strokeWidth="3.5" d="M112 66l-2-8 8 4M132 66l4-8 2 9" />
      </g>
      <path className="d" pathLength={1} style={k(6)} strokeWidth="3" d="M154 78c8-12 16-12 24 0" />
      <path className="d" pathLength={1} style={k(6)} strokeWidth="3" d="M172 70l7 9-11 3" />
      <g transform="rotate(-2 206 78)">
        <rect className="d" pathLength={1} style={k(7)} x="176" y="44" width="58" height="68" rx="8" fill="var(--pink-soft)" />
        <path className="d" pathLength={1} style={k(8)} strokeWidth="5" d="M192 66c0-10 22-10 22 0 0 8-11 7-11 17M203 98v.5" />
      </g>
      <g strokeWidth="3">
        <circle cx="39" cy="140" r="11" fill="var(--accent)" />
        <circle cx="121" cy="140" r="11" fill="var(--blue)" />
        <circle cx="205" cy="140" r="11" fill="var(--green)" />
        <path className="d" pathLength={1} style={k(9)} d="M53 140h54M135 140h56" strokeDasharray="1" />
      </g>
    </Svg>
  );
}

/** 拼圖接畫：一半給隊友，補完另一半 */
export function ArtFragment(props: ArtProps) {
  return (
    <Svg viewBox="0 0 240 180" {...props}>
      <rect className="d" pathLength={1} style={k(0)} x="30" y="20" width="180" height="110" rx="8" fill="#fff" />
      <path d="M120 20v110" stroke="var(--ink)" strokeWidth="3" strokeDasharray="7 7" />
      <rect x="33" y="23" width="84" height="104" rx="5" fill="var(--ink)" opacity="0.07" stroke="none" />
      <path className="d" pathLength={1} style={k(1)} stroke="var(--accent)" strokeWidth="5" d="M44 100c8-34 24-52 40-46 14 6 8 30-4 36s-22-6-14-20" />
      <path className="d" pathLength={1} style={k(2)} stroke="var(--blue)" strokeWidth="4" d="M64 44c10-8 24-8 40 0" />
      <path className="d" pathLength={1} style={k(3)} stroke="var(--accent)" strokeWidth="5" d="M96 76c10 4 16 14 18 26" />
      <path d="M132 40h66M132 60h50M132 80h58" stroke="var(--ink-faint)" strokeWidth="3" strokeDasharray="2 9" opacity="0.8" />
      <g transform="rotate(32 168 100)">
        <path className="d" pathLength={1} style={k(5)} fill="var(--amber)" d="M146 94h38l10 8-10 8h-38z" />
        <path className="d" pathLength={1} style={k(5)} fill="var(--ink)" d="M184 94l10 8-10 8" />
      </g>
      <text x="62" y="152" fontFamily="var(--font-hand)" fontSize="18" fill="var(--ink)" stroke="none" textAnchor="middle">
        A
      </text>
      <text x="178" y="152" fontFamily="var(--font-hand)" fontSize="18" fill="var(--ink)" stroke="none" textAnchor="middle">
        B
      </text>
      <circle cx="62" cy="165" r="0" />
      <path className="d" pathLength={1} style={k(6)} strokeWidth="3" d="M78 148c14 8 28 8 42 0M120 148c14 8 28 8 42 0" strokeDasharray="1" />
    </Svg>
  );
}

/* ------------------------------------------------- 「三步開玩」小插圖 ------ */

/** 入場券：開房間 */
export function IcoTicket({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 16h44v8a4 4 0 0 0 0 8v8H6v-8a4 4 0 0 0 0-8z" fill="var(--amber)" />
      <path d="M36 16v24" strokeDasharray="3 4" />
      <path d="M16 26h12M16 32h8" />
    </svg>
  );
}

/** 兩個人＋連線：叫朋友 */
export function IcoPeople({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="19" cy="20" r="8" fill="var(--green)" />
      <circle cx="38" cy="24" r="7" fill="var(--blue)" />
      <path d="M5 46c1-10 8-14 14-14s13 4 14 14" />
      <path d="M36 33c8 0 13 4 15 12" />
    </svg>
  );
}

/** 笑臉：爆笑 */
export function IcoLaugh({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} aria-hidden="true" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="28" cy="28" r="20" fill="var(--pink)" />
      <path d="M18 23l6 2-6 2M38 23l-6 2 6 2" />
      <path d="M17 33c3 10 19 10 22 0z" fill="var(--paper)" />
    </svg>
  );
}
