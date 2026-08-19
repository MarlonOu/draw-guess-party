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
 * 直向、窄版的工具列，設計給畫布左側使用。
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
        padding: 10,
        width: 132,
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 5,
          marginBottom: 10,
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

      <input
        type="range"
        min={2}
        max={24}
        value={width}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        style={{ width: '100%', marginBottom: 8 }}
      />

      <button
        type="button"
        onClick={() => onToolChange(tool === 'pen' ? 'eraser' : 'pen')}
        className="dg-btn dg-btn-block"
        style={{
          padding: '6px 8px',
          fontSize: 13,
          marginBottom: 8,
          background: tool === 'eraser' ? 'var(--amber-soft)' : 'var(--paper)',
        }}
      >
        {tool === 'pen' ? '筆刷' : '橡皮擦'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          onClick={onUndo}
          className="dg-btn dg-btn-block"
          style={{ padding: '6px 8px', fontSize: 13 }}
        >
          復原
        </button>
        <button
          type="button"
          onClick={onClear}
          className="dg-btn dg-btn-block"
          style={{ padding: '6px 8px', fontSize: 13 }}
        >
          清空
        </button>
      </div>
    </div>
  );
}
