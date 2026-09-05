'use client';

import { forwardRef } from 'react';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import { StrokeReplay } from './StrokeReplay';
import type { Stroke } from '../../lib/types/stroke';

type SplitOrientation = 'vertical' | 'horizontal';
type Half = 'a' | 'b';

interface FragmentCanvasProps {
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  disabled?: boolean;
  splitOrientation: SplitOrientation;
  /**
   * 補全階段才需要傳這兩個 prop：keptHalf 是起手保留下來的是哪一半（補全只能
   * 畫在「另一半」），keptStrokes 是那一半的筆畫內容（唯讀顯示，補全者要看
   * 得到才知道該接續什麼）。起手階段（畫滿整個畫布，不受任何一半限制）
   * 兩者都不傳。
   */
  keptHalf?: Half;
  keptStrokes?: Stroke[];
}

/**
 * FRAGMENT_DRAW 模式專用的分割畫布：比其他模式的畫布大（使用者需求明確要求），
 * 疊上一條切割引導線（起手階段跟補全階段都會顯示，起手用來構圖規劃、補全用來
 * 清楚看到「另一半是我能畫的範圍」），補全階段額外疊上保留下來那一半的唯讀
 * 內容，並把實際下筆範圍限制在空白那一半（見 DrawingCanvas 的 allowedRegion）。
 */
export const FragmentCanvas = forwardRef<DrawingCanvasHandle, FragmentCanvasProps>(function FragmentCanvas(
  { color, width, tool, disabled, splitOrientation, keptHalf, keptStrokes },
  ref
) {
  const isVertical = splitOrientation === 'vertical';
  const allowedRegion = keptHalf ? { orientation: splitOrientation, half: keptHalf === 'a' ? ('b' as const) : ('a' as const) } : undefined;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#ffffff' }}>
      {keptStrokes && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <StrokeReplay strokes={keptStrokes} />
        </div>
      )}

      <DrawingCanvas
        ref={ref}
        color={color}
        width={width}
        tool={tool}
        disabled={disabled}
        allowedRegion={allowedRegion}
        // 補全階段（keptStrokes 有值）畫布本身要透明，不然這裡的不透明白色
        // 背景會直接蓋住上面那層「起手保留下來的內容」，變成參考內容整個
        // 消失看不到——白色背景改由這個元件最外層的 wrapper div 提供
        // （見上面 style 裡的 background:'#ffffff'），視覺上沒畫的地方一樣
        // 是白色，只是背景的來源換了層次，不會擋住底下的參考內容。
        background={keptStrokes ? 'transparent' : '#ffffff'}
      />

      {/* 切割引導線：純視覺提示，不接收指標事件，不影響底下畫布的下筆判斷 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: isVertical ? 'row' : 'column',
        }}
      >
        <div style={{ flex: 1 }} />
        <div
          style={
            isVertical
              ? { width: 2, alignSelf: 'stretch', background: 'repeating-linear-gradient(to bottom, var(--ink) 0 8px, transparent 8px 16px)' }
              : { height: 2, alignSelf: 'stretch', background: 'repeating-linear-gradient(to right, var(--ink) 0 8px, transparent 8px 16px)' }
          }
        />
        <div style={{ flex: 1 }} />
      </div>

      {/* 補全階段：禁止那一半疊一層半透明遮罩，強化「這裡不能畫」的視覺提示，
          純裝飾用不接收指標事件（實際下筆限制在 DrawingCanvas 的 allowedRegion） */}
      {keptHalf && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            background: 'rgba(26, 26, 46, 0.06)',
            ...(isVertical
              ? keptHalf === 'a'
                ? { top: 0, bottom: 0, left: 0, width: '50%' }
                : { top: 0, bottom: 0, right: 0, width: '50%' }
              : keptHalf === 'a'
                ? { left: 0, right: 0, top: 0, height: '50%' }
                : { left: 0, right: 0, bottom: 0, height: '50%' }),
          }}
        />
      )}
    </div>
  );
});
