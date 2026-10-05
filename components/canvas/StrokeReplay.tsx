'use client';

import { useLayoutEffect, useRef } from 'react';
import type { Stroke } from '../../lib/types/stroke';
import { scaleStrokeWidth } from '../../lib/shared/strokeWidthScale';

interface StrokeReplayProps {
  strokes: Stroke[];
  /** 沒有任何筆畫時顯示的提示文字（例如某一棒完全沒畫東西） */
  emptyLabel?: string;
}

/**
 * 唯讀畫布：把一組已經畫完的筆畫資料畫出來，沒有任何互動（不能畫、不能擦、
 * 不接收 pointer 事件）。用在 DRAW_TELEPHONE 模式的兩個地方：
 *  - 猜測階段：看「前一棒的畫」
 *  - 公布階段：畫廊裡逐一顯示整條接龍的每一棒
 *
 * 跟 DrawingCanvas 的差異：DrawingCanvas 是給「正在畫」的人用的，包含 pointer
 * 事件、即時同步、復原/清空；這裡單純是「畫一次靜態圖」，不需要那些機制，
 * 拆成獨立元件比在 DrawingCanvas 裡加一個 readOnly 分支更單純。
 *
 * 解析度：canvas 內部像素解析度要乘上 `devicePixelRatio`，不能直接照 CSS 顯示
 * 尺寸設定——在高解析度螢幕（Retina 等，devicePixelRatio 通常是 2 或 3）上，
 * 如果內部解析度只照 CSS px 給，畫面會比螢幕實際像素少很多，被放大顯示（例如
 * 公布畫廊的卡片被放大呈現）時就會模糊，畫布尺寸放得越大這個問題越明顯。
 * `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 讓後續的繪圖座標維持在原本的 CSS px
 * 空間運算，不需要更動既有的筆畫繪製邏輯。
 *
 * 尺寸：canvas.style.width／canvas.style.height 直接用 JS 寫入量到的 CSS 像素值，
 * 不透過任何 CSS 百分比或定位規則去推導——canvas 是「替換元素」，`width/height:
 * '100%'` 或 `position:absolute+inset:0`（沒有另外給明確 width/height）這兩種
 * 寫法都各自在特定情境下踩過雷（父層高度來自 flexbox stretch 時解析失敗、或
 * CSS 規格對替換元素的定位規則本來就不會撐滿容器），退回去用 canvas 的
 * width/height「屬性」（現在已經乘過 devicePixelRatio）當顯示尺寸，畫面因此
 * 爆大。直接用 JS 寫入量到的尺寸，不靠 CSS 推導，兩種情境的成因都不會發生。
 * `useLayoutEffect` 讓這個量測＋寫入動作在瀏覽器真正畫面之前同步完成，避免
 * 使用者看到「先用預設尺寸閃一下、才變成正確尺寸」的畫面閃爍。
 */
export function StrokeReplay({ strokes, emptyLabel }: StrokeReplayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !parent || !ctx) return;

    const render = () => {
      // 量測對象是 canvas.parentElement，不是 canvas 自己的 getBoundingClientRect()
      // ——理由跟 DrawingCanvas 一致：canvas 本身沒有設定任何 CSS 寬高，在還沒被
      // 這段程式寫入正確尺寸之前，canvas「自己當下的框」就是瀏覽器預設值
      // 300×150，拿 canvas 自己的框來量，量到的是這個預設值，不是容器實際尺寸，
      // 等於拿畫布量自己，一個自我參照的邏輯錯誤。父層 div（width/height:'100%'）
      // 是一般元素，不是替換元素，不會有這個問題，可以正確反映外層容器的實際尺寸。
      // 用 offsetWidth/Height（未經 transform 的版面尺寸）而不是 getBoundingClientRect：
      // 公布畫廊的卡片帶有 rotate()，後者會回傳旋轉後放大的外接矩形，
      // 畫布尺寸跟著放大，筆畫座標比例就會輕微失真。
      const rect = { width: parent.offsetWidth, height: parent.offsetHeight };
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const stroke of strokes) {
        ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = stroke.color;
        // 見 lib/shared/strokeWidthScale.ts 的說明：stroke.width 是「參考畫布
        // 寬度下校準出來的粗細值」，這裡回放用的畫布（作品列表／公布畫廊的
        // 預覽框，通常比實際作畫時的畫布小很多）要依照自己實際的寬度換算
        // lineWidth，不然同一條筆畫在小預覽框裡看起來會過粗、吃掉細節，
        // 這正是使用者回報「解析度／精細度跟實際作畫有落差」的根因。
        ctx.lineWidth = scaleStrokeWidth(stroke.width, rect.width);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < stroke.points.length; i++) {
          const from = stroke.points[i - 1];
          const to = stroke.points[i];
          ctx.beginPath();
          ctx.moveTo(from.x * rect.width, from.y * rect.height);
          ctx.lineTo(to.x * rect.width, to.y * rect.height);
          ctx.stroke();
        }
      }
    };

    render();
    window.addEventListener('resize', render);
    // 容器尺寸因任何原因改變（版面切換、卡片進場、響應式）都要重畫，不只視窗縮放
    let lastW = parent.offsetWidth;
    let lastH = parent.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (parent.offsetWidth === lastW && parent.offsetHeight === lastH) return;
      lastW = parent.offsetWidth;
      lastH = parent.offsetHeight;
      render();
    });
    ro.observe(parent);
    return () => {
      window.removeEventListener('resize', render);
      ro.disconnect();
    };
  }, [strokes]);

  const isEmpty = strokes.every((s) => s.points.length < 2);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        // 只負責定位，不負責尺寸——尺寸完全交給上面 useLayoutEffect 的 render()
        // 直接寫入 canvas.style.width/height 決定（理由見上方元件說明）。
        style={{ display: 'block', position: 'absolute', top: 0, left: 0, background: '#ffffff' }}
      />
      {isEmpty && emptyLabel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ink-soft)',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
