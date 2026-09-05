'use client';

import { useEffect, useState } from 'react';

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

/** 跟 globals.css 的手機斷點（640px）保持一致 */
const MOBILE_BREAKPOINT_QUERY = '(max-width: 640px)';

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
  /**
   * 強制指定版面，不用內部的螢幕寬度偵測決定。FRAGMENT_DRAW 模式的工具列是
   * 放在寬版畫布正上方（不是像其他模式那樣窄版直向、並排在畫布旁邊），不管
   * 螢幕實際寬度多少，橫向排列（跟手機版共用同一套版面）才是這個位置該有的
   * 樣子——桌機版原本的窄直向設計是為了「站在畫布側邊、佔用寬度要小」，這裡
   * 完全不適用。不傳的話維持原本「依螢幕寬度自動判斷」的行為，其他模式不受影響。
   */
  forceLayout?: 'mobile' | 'desktop';
}

function ColorSwatch({
  c,
  i,
  size,
  active,
  onClick,
}: {
  c: string;
  i: number;
  size: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`選擇顏色 ${c}`}
      aria-pressed={active}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        background: c,
        border: '2px solid var(--ink)',
        boxShadow: active ? '0 0 0 2px var(--blue)' : 'none',
        transform: active ? 'scale(1.12)' : `rotate(${(i % 3) - 1}deg)`,
        cursor: 'pointer',
        transition: 'transform 0.1s ease',
      }}
    />
  );
}

function ToolIconButton({
  onClick,
  label,
  active,
  children,
  flex,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  children: React.ReactNode;
  flex?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="dg-btn"
      style={{
        width: flex ? undefined : 36,
        height: 36,
        flex: flex,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--amber-soft)' : 'var(--paper)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * 畫筆工具列。桌機是直向窄版（寬度約 100px），手機版改成橫向排列（顏色改成
 * 換行的橫向多列、筆刷粗細滑桿改回正常橫向、整條工具列變成一個橫跨畫布上方
 * 的橫條），不是用 CSS 硬蓋掉桌機版的 inline style——那種做法在這個專案先前
 * 已經造成過好幾次跑版問題（CSS 動畫、CSS Grid 都出過事），這次改用 JS 判斷
 * 螢幕寬度（跟 globals.css 的手機斷點 640px 保持一致），直接渲染兩種完全獨立、
 * 各自簡單的版面結構，不會互相干擾。
 *
 * `isMobile` 預設 `false`（SSR 階段跟第一次 client 端渲染都拿不到真實視窗寬度，
 * 為了避免 hydration mismatch，統一先假設是桌機版面，掛載後的 useEffect 才讀取
 * 真正的視窗寬度並在需要時切換成手機版面）——實機在手機上開啟時會有一瞬間先
 * 顯示桌機版面再切換過去，這是刻意接受的小小過渡效果，換取不會有 hydration 錯誤。
 *
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
  forceLayout,
}: ToolbarProps) {
  const [detectedMobile, setDetectedMobile] = useState(false);

  useEffect(() => {
    if (forceLayout) return; // 有強制指定版面時，不需要監聽螢幕寬度變化
    const mq = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const update = () => setDetectedMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [forceLayout]);

  const isMobile = forceLayout ? forceLayout === 'mobile' : detectedMobile;

  if (isMobile) {
    return (
      <div
        className="dg-card"
        style={{
          padding: 10,
          width: '100%',
          // maxWidth:480 是配合真實手機螢幕寬度設計的，forceLayout 情境（例如
          // FRAGMENT_DRAW 模式，畫布本身就有 1100px 寬）不該被這個手機專用的
          // 上限卡住，不然顏色會被硬擠成好幾排、下面浪費一大塊空白，工具列看
          // 起來跟又寬又大的畫布完全不成比例。
          maxWidth: forceLayout ? 'none' : 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          opacity: disabled ? 0.4 : 1,
          pointerEvents: disabled ? 'none' : 'auto',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {COLORS.map((c, i) => (
            <ColorSwatch key={c} c={c} i={i} size={30} active={color === c} onClick={() => onColorChange(c)} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={2}
            max={24}
            value={width}
            onChange={(e) => onWidthChange(Number(e.target.value))}
            aria-label="筆刷粗細"
            style={{ flex: 1, minWidth: 0 }}
          />
          <ToolIconButton
            onClick={() => onToolChange(tool === 'pen' ? 'eraser' : 'pen')}
            label={tool === 'pen' ? '切換成橡皮擦' : '切換成筆刷'}
            active={tool === 'eraser'}
          >
            {tool === 'pen' ? <PencilIcon /> : <EraserIcon />}
          </ToolIconButton>
          <ToolIconButton onClick={onUndo} label="復原">
            <UndoIcon />
          </ToolIconButton>
          <ToolIconButton onClick={onClear} label="清空畫布">
            <TrashIcon />
          </ToolIconButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="dg-card"
      style={{
        padding: 8,
        width: 100,
        flexShrink: 0,
        // 自己顯式宣告 alignSelf + height，不依賴外層容器有沒有記得設定
        // alignItems: 'flex-start'——外層 row 如果漏設（預設值是 stretch），這個
        // 卡片就會被拉伸到跟旁邊的畫布一樣高，變成一長條、下半部一大片空白，
        // 是實際發生過的跑版問題。這裡直接在元件自己身上做防禦，不管被哪個
        // 頁面包住都不會被拉伸。
        alignSelf: 'flex-start',
        height: 'fit-content',
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
