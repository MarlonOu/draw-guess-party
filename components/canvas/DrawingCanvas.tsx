'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  canvas: HTMLCanvasElement,
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
  ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
  ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
  ctx.stroke();
}

/**
 * DrawingCanvas：只負責畫布本身（Pointer Events、本機繪製、遠端筆畫同步渲染）。
 * 復原／清空透過 ref 曝露給外部（RoomPage 把這兩個動作接到左側 Toolbar 的按鈕上），
 * 「畫布現在該顯示什麼狀態看板」也交給外部（RoomPage）決定，本元件不含任何疊層 UI，
 * 保持單一職責。
 */
export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ color, width, tool, disabled = false }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const localStrokeIdRef = useRef<string | null>(null);
    const localStartTimeRef = useRef<number>(0);
    const lastLocalPointRef = useRef<StrokePoint | null>(null);

    /** strokeId -> 完整筆畫資料，用於重繪畫布（例如 undo 時整個重畫） */
    const strokesRef = useRef<Map<string, Stroke>>(new Map());
    const remotePendingLastPointRef = useRef<Map<string, StrokePoint>>(new Map());

    const [isDrawing, setIsDrawing] = useState(false);

    const redrawAll = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const stroke of strokesRef.current.values()) {
        for (let i = 1; i < stroke.points.length; i++) {
          drawStrokeSegment(
            ctx,
            canvas,
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
        for (const point of payload.points) {
          drawStrokeSegment(ctx, canvas, last, point, stroke.color, stroke.width, stroke.tool);
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

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
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
      drawStrokeSegment(ctx, canvas, lastLocalPointRef.current, point, color, width, tool);
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
          width: '100%',
          height: '100%',
          touchAction: 'none',
          background: '#ffffff',
          cursor: disabled ? 'default' : buildBrushCursor(color, width, tool),
        }}
      />
    );
  }
);
