'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useDrawingSync } from '../../lib/realtime/useDrawingSync';
import type { Stroke, StrokePoint } from '../../lib/types/stroke';

interface DrawingCanvasProps {
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  disabled?: boolean;
}

export interface DrawingCanvasHandle {
  undo: () => void;
  clear: () => void;
  /** 只清掉本機畫面、不發送任何 socket 事件。用於「新的一輪開始，畫布本來就該是空的」，
   *  跟 clear（使用者主動按清空、會同步廣播給其他人）是不同的用途。 */
  resetLocal: () => void;
}

/**
 * 座標正規化：pointer event 的像素座標 -> 0~1 相對畫布尺寸的比例。
 * 不同裝置螢幕尺寸不同，儲存/傳輸一律用比例，渲染時才依當下畫布實際像素尺寸換算回來。
 */
function toNormalizedPoint(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  strokeStartTime: number
): StrokePoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
    t: Date.now() - strokeStartTime,
  };
}

/**
 * 畫筆游標：滑鼠指標本身在桌機環境不會顯示筆刷實際大小/顏色，改用 CSS cursor 換成
 * 一個跟目前顏色、粗細一致的圓形 SVG，取代瀏覽器預設的白色十字準星。
 * hotspot（游標熱點，也就是滑鼠實際點擊座標對應圖片上的哪個像素）設在圓心，
 * 確保看到的圓圈中心就是實際畫下去的位置，不會有肉眼判斷跟實際落筆對不上的落差。
 * 橡皮擦不套用畫筆顏色（擦除跟顏色無關，套用顏色反而誤導），固定用白底黑框表示。
 */
function buildBrushCursor(color: string, width: number, tool: 'pen' | 'eraser'): string {
  const size = Math.max(width, 3);
  const half = size / 2;
  const radius = Math.max(width / 2 - 0.5, 1);
  const fill = tool === 'eraser' ? '#ffffff' : color;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>` +
    `<circle cx='${half}' cy='${half}' r='${radius}' fill='${fill}' stroke='#1A1A2E' stroke-width='1'/>` +
    `</svg>`;
  // '#' 在 data URI 裡不跳脫會被當成 URL 片段起點，直接截斷整個 SVG（fill/stroke 的
  // 色碼剛好都是 #RRGGBB），一律用 encodeURIComponent 整包編碼，不手動處理個別字元。
  const encoded = encodeURIComponent(svg);
  return `url("data:image/svg+xml,${encoded}") ${half} ${half}, crosshair`;
}

function drawStrokeSegment(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  from: StrokePoint,
  to: StrokePoint,
  color: string,
  width: number,
  tool: 'pen' | 'eraser'
) {
  ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x * cssWidth, from.y * cssHeight);
  ctx.lineTo(to.x * cssWidth, to.y * cssHeight);
  ctx.stroke();
}

/**
 * DrawingCanvas：只負責畫布本身（Pointer Events、本機繪製、遠端筆畫同步渲染）。
 * 復原／清空透過 ref 曝露給外部（RoomPage 把這兩個動作接到左側 Toolbar 的按鈕上），
 * 「畫布現在該顯示什麼狀態看板」也交給外部（RoomPage）決定，本元件不含任何疊層 UI，
 * 保持單一職責。
 *
 * 解析度：canvas 內部像素解析度要乘上 `devicePixelRatio`，不能直接照 CSS 顯示尺寸
 * 設定——在高解析度螢幕（Retina 等）上，內部解析度只照 CSS px 給會比螢幕實際像素少
 * 很多，畫面偏軟、不夠銳利，畫布尺寸放得越大這個問題越明顯。`canvasCssSizeRef` 記錄
 * 目前畫布「CSS 顯示尺寸」（不是內部像素解析度），繪圖座標運算都以這個為準，搭配
 * `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 讓實際畫出來的線條自動對齊到 DPR 縮放後的
 * 內部解析度，不需要每次畫線都手動乘 dpr。
 */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ color, width, tool, disabled = false }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const localStrokeIdRef = useRef<string | null>(null);
    const localStartTimeRef = useRef<number>(0);
    const lastLocalPointRef = useRef<StrokePoint | null>(null);
    /** 畫布目前的 CSS 顯示尺寸（不是內部像素解析度），resize 時更新，繪圖座標運算都以此為準 */
    const canvasCssSizeRef = useRef({ width: 0, height: 0 });

    /** strokeId -> 完整筆畫資料，用於重繪畫布（例如 undo 時整個重畫） */
    const strokesRef = useRef<Map<string, Stroke>>(new Map());
    const remotePendingLastPointRef = useRef<Map<string, StrokePoint>>(new Map());

    const [isDrawing, setIsDrawing] = useState(false);

    const redrawAll = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const { width: cssWidth, height: cssHeight } = canvasCssSizeRef.current;
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      for (const stroke of strokesRef.current.values()) {
        for (let i = 1; i < stroke.points.length; i++) {
          drawStrokeSegment(
            ctx,
            cssWidth,
            cssHeight,
            stroke.points[i - 1],
            stroke.points[i],
            stroke.color,
            stroke.width,
            stroke.tool
          );
        }
      }
    }, []);

    const { startStroke, addPoint, endStroke, clearCanvas, undoLast } = useDrawingSync({
      onStrokeStart: (payload) => {
        strokesRef.current.set(payload.strokeId, {
          id: payload.strokeId,
          playerId: payload.playerId,
          color: payload.color,
          width: payload.width,
          tool: payload.tool,
          points: [payload.point],
        });
        remotePendingLastPointRef.current.set(payload.strokeId, payload.point);
      },
      onStrokePoints: (payload) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        const stroke = strokesRef.current.get(payload.strokeId);
        if (!canvas || !ctx || !stroke) return;

        let last =
          remotePendingLastPointRef.current.get(payload.strokeId) ??
          stroke.points[stroke.points.length - 1];
        const { width: cssWidth, height: cssHeight } = canvasCssSizeRef.current;
        for (const point of payload.points) {
          drawStrokeSegment(ctx, cssWidth, cssHeight, last, point, stroke.color, stroke.width, stroke.tool);
          stroke.points.push(point);
          last = point;
        }
        remotePendingLastPointRef.current.set(payload.strokeId, last);
      },
      onStrokeEnd: (payload) => {
        remotePendingLastPointRef.current.delete(payload.strokeId);
      },
      onCanvasClear: () => {
        strokesRef.current.clear();
        redrawAll();
      },
      onCanvasUndo: () => {
        const ids = Array.from(strokesRef.current.keys());
        const lastId = ids[ids.length - 1];
        if (lastId) strokesRef.current.delete(lastId);
        redrawAll();
      },
    });

    const resetLocal = useCallback(() => {
      strokesRef.current.clear();
      remotePendingLastPointRef.current.clear();
      redrawAll();
    }, [redrawAll]);

    useImperativeHandle(
      ref,
      () => ({ undo: undoLast, clear: clearCanvas, resetLocal }),
      [undoLast, clearCanvas, resetLocal]
    );

    /**
     * 這裡刻意用 useLayoutEffect 不是 useEffect：接下來要做的事情（量測容器實際
     * 尺寸、直接寫入 canvas.style.width/height）是排版關鍵操作，useLayoutEffect
     * 會在瀏覽器真正畫面之前同步執行，避免使用者看到「畫布先用預設尺寸閃一下、
     * 才變成正確尺寸」這種畫面閃爍。
     *
     * canvas.style.width／canvas.style.height 直接寫入量到的 CSS 像素值，不再靠
     * CSS 的 position:absolute+inset:0、也不是 width:'100%'／height:'100%'——canvas
     * 是「替換元素」，這兩種寫法都各自在特定情境下踩過雷：
     *  - width/height:'100%'：父層高度如果是透過 flexbox stretch 動態算出來、
     *    不是一開始就給定明確數值，這個百分比在某些計算時機點會解析失敗，瀏覽器
     *    退回去用 canvas 的 width/height「屬性」當原生尺寸，導致畫布爆大。
     *  - position:absolute + inset:0（沒有另外給明確 width/height）：對「替換元素」
     *    來說，CSS 規格對這個情境的處理跟一般 div 不一樣——並不會真的撐滿容器，
     *    一樣會退回去用 width/height 屬性當原生尺寸。
     * 直接用 JS 把量到的容器尺寸寫進 canvas.style.width/height，兩種情境的成因
     * 都不會發生——不靠任何 CSS 百分比或定位規則去推導尺寸，量到多少就是多少。
     *
     * 量測對象是 canvas.parentElement（也就是 .dg-canvas-box，已經是
     * position:relative、尺寸由外層 flex stretch 正確決定），不是 canvas 自己的
     * getBoundingClientRect()——這是這一輪才抓到的真正根因：canvas 本身沒有設定
     * 任何 CSS 寬高（只有 position:absolute,top:0,left:0），在還沒被這段程式寫入
     * 正確尺寸之前，canvas「自己當下的框」就是瀏覽器預設值 300×150；如果拿
     * canvas.getBoundingClientRect() 來量，量到的其實是畫布自己的預設框，不是
     * 容器的實際尺寸——等於拿畫布量自己，一個自我參照的邏輯錯誤，量出來的值
     * 永遠是 300×150，跟容器實際多大完全無關。改成量父容器的框，就是量「畫布
     * 應該要多大」的正確依據來源。
     */
    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;
      const resize = () => {
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        canvasCssSizeRef.current = { width: rect.width, height: rect.height };
        const ctx = canvas.getContext('2d');
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
        redrawAll();
      };
      resize();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }, [redrawAll]);

    // 每次畫布被停用（切換為不可畫）時，清掉還在進行中的本機筆畫狀態，
    // 避免「正在畫到一半突然輪到別人」時殘留一個永遠畫不完的筆畫。
    useEffect(() => {
      if (disabled) {
        setIsDrawing(false);
        lastLocalPointRef.current = null;
        localStrokeIdRef.current = null;
      }
    }, [disabled]);

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(event.pointerId);

      const strokeId = crypto.randomUUID();
      localStrokeIdRef.current = strokeId;
      localStartTimeRef.current = Date.now();
      const point = toNormalizedPoint(event, canvas, localStartTimeRef.current);
      lastLocalPointRef.current = point;

      strokesRef.current.set(strokeId, {
        id: strokeId,
        playerId: 'local',
        color,
        width,
        tool,
        points: [point],
      });

      startStroke({ strokeId, color, width, tool, point });
      setIsDrawing(true);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || !isDrawing) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const strokeId = localStrokeIdRef.current;
      if (!canvas || !ctx || !strokeId || !lastLocalPointRef.current) return;

      const point = toNormalizedPoint(event, canvas, localStartTimeRef.current);
      const { width: cssWidth, height: cssHeight } = canvasCssSizeRef.current;
      drawStrokeSegment(ctx, cssWidth, cssHeight, lastLocalPointRef.current, point, color, width, tool);
      lastLocalPointRef.current = point;

      const stroke = strokesRef.current.get(strokeId);
      stroke?.points.push(point);

      addPoint(point);
    };

    const handlePointerUp = () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      lastLocalPointRef.current = null;
      localStrokeIdRef.current = null;
      endStroke();
    };

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          display: 'block',
          // 只負責定位（貼齊容器左上角），不負責尺寸——尺寸完全交給上面
          // useLayoutEffect 的 resize() 直接寫入 canvas.style.width/height 決定，
          // 這裡不寫 width/height，也不用 inset:0（那個對 canvas 這種「替換元素」
          // 沒有撐滿容器的效果，實測會退回去用內部像素解析度當顯示尺寸，畫布因此
          // 爆大——用 top/left:0 純粹定位、尺寸交給 JS，兩者職責分開就不會再有
          // 這類 CSS 對替換元素的特殊規則造成的意外）。
          position: 'absolute',
          top: 0,
          left: 0,
          touchAction: 'none',
          background: '#ffffff',
          cursor: disabled ? 'default' : buildBrushCursor(color, width, tool),
        }}
      />
    );
  }
);
