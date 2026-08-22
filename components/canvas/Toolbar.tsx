'use client';

/**
 * 16 色蠟筆調色盤，依色相排列（暖色 -> 冷色 -> 中性色），
 * 刻意保留些微不均勻的視覺節奏，呼應「蠟筆盒」的手繪語彙。
 */
const COLORS = [
  '#1A1A2E', // 墨黑
  '#4B4B63', // 石墨灰
  '#E63946', // 番茄紅
  '#FF6B4A', // 珊瑚橘
  '#FFB627', // 琥珀
  '#FFDD57', // 檸檬黃
  '#A8E10C', // 萊姆綠
  '#2ECC71', // 草綠
  '#14B8A6', // 松石綠
  '#22D3EE', // 天藍
  '#4C6FFF', // 電光藍
  '#6366F1', // 靛紫
  '#8B5CF6', // 紫羅蘭
  '#EC4899', // 桃紅
  '#FF8FA3', // 粉紅
  '#8B5E3C', // 可可棕
];

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1Z" />
      <path d="M13 8l3 3" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="7" rx="2" transform="rotate(-15 12 14.5)" />
      <path d="M8 21h10" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 3-7.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

interface ToolbarProps {
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onToolChange: (tool: 'pen' | 'eraser') => void;
  onUndo: () => void;
  onClear: () => void;
  disabled?: boolean;
}

/**
 * 直向窄版工具列，設計給畫布左側使用，寬度控制在約 100px 以內，把版面主要空間讓給畫布。
 * 顏色排成 2 欄 x 8 列（原本 4 欄 x 4 列改窄），筆刷粗細滑桿改直向（CSS rotate
 * 搭配絕對定位置中，避免旋轉造成版面位移），筆刷/橡皮擦、復原/清空都改成純圖示
 * 按鈕，不放文字標籤，進一步壓縮寬度。
 * disabled（不是自己畫圖的時候）時整體變淡且不可互動，但仍佔位，
 * 避免版面在「輪到我畫」與「別人在畫」之間跳動。
 */
export function Toolbar({
  color,
  width,
  tool,
  onColorChange,
  onWidthChange,
  onToolChange,
  onUndo,
  onClear,
  disabled = false,
}: ToolbarProps) {
  return (
    <div
      className="dg-card"
      style={{
        padding: 8,
        width: 100,
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 4,
          marginBottom: 8,
        }}
      >
        {COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            aria-label={`選擇顏色 ${c}`}
            aria-pressed={color === c}
            onClick={() => onColorChange(c)}
            style={{
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: '50%',
              background: c,
              border: '2px solid var(--ink)',
              boxShadow: color === c ? '0 0 0 2px var(--blue)' : 'none',
              transform: color === c ? 'scale(1.12)' : `rotate(${(i % 3) - 1}deg)`,
              cursor: 'pointer',
              transition: 'transform 0.1s ease',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        {/* 筆刷粗細：直向滑桿。用絕對定位置中再旋轉，避免旋轉後的視覺位移擠壓到旁邊的按鈕 */}
        <div style={{ position: 'relative', width: 22, height: 86 }}>
          <input
            type="range"
            min={2}
            max={24}
            value={width}
            onChange={(e) => onWidthChange(Number(e.target.value))}
            aria-label="筆刷粗細"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 80,
              height: 18,
              margin: 0,
              transform: 'translate(-50%, -50%) rotate(-90deg)',
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => onToolChange(tool === 'pen' ? 'eraser' : 'pen')}
          aria-label={tool === 'pen' ? '切換成橡皮擦' : '切換成筆刷'}
          className="dg-btn"
          style={{
            width: 36,
            height: 36,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: tool === 'eraser' ? 'var(--amber-soft)' : 'var(--paper)',
          }}
        >
          {tool === 'pen' ? <PencilIcon /> : <EraserIcon />}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onUndo}
          aria-label="復原"
          className="dg-btn"
          style={{ flex: 1, padding: '7px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="清空畫布"
          className="dg-btn"
          style={{ flex: 1, padding: '7px 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
