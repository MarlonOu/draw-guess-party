export type StatusIconKind = 'clock' | 'pencil' | 'eye' | 'megaphone' | 'trophy' | 'alert';

/**
 * 手繪線條風格的圖示集，跟畫布筆刷、卡片外框走同一套「馬克筆」語彙：
 * 粗線條（strokeWidth 2）、圓角端點，不用填色複雜的圖形，維持辨識度。
 * 沒有安裝任何圖示套件，全部用內聯 SVG，避免依賴外部字型/圖示 CDN
 * （這個開發環境連不到那類外部資源）。
 */
const PATHS: Record<StatusIconKind, React.ReactNode> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
      <path d="M13 8l3 3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l4.5 4.5V4.5L6 9H4a1 1 0 0 0-1 1Z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M19 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5.5h2.5a2 2 0 0 1 0 4H17" />
      <path d="M7 5.5H4.5a2 2 0 0 0 0 4H7" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2L12 3Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </>
  ),
};

interface StatusIconProps {
  kind: StatusIconKind;
  color: string;
  size?: number;
}

export function StatusIcon({ kind, color, size = 64 }: StatusIconProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        border: '2px solid var(--ink)',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.46}
        height={size * 0.46}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[kind]}
      </svg>
    </div>
  );
}
