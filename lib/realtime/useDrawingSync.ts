'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getSocket } from './socketClient';
import type { Stroke, StrokePoint } from '../types/stroke';

interface RemoteStrokeHandlers {
  onStrokeStart: (payload: {
    strokeId: string;
    playerId: string;
    color: string;
    width: number;
    tool: 'pen' | 'eraser';
    point: StrokePoint;
  }) => void;
  onStrokePoints: (payload: { strokeId: string; points: StrokePoint[] }) => void;
  onStrokeEnd: (payload: { strokeId: string }) => void;
  onCanvasClear: () => void;
  onCanvasUndo: () => void;
}

/**
 * useDrawingSync：封裝畫布筆畫事件的收送與節流，UI 層（DrawingCanvas）
 * 透過本 Hook 收送事件，不直接操作 socket。
 *
 * 節流策略：本機繪製（onLocalPoint）每個 pointermove 都即時執行，維持手感流暢；
 * 送到網路上的座標點改用 requestAnimationFrame 批次收集後一次送出，
 * 避免每個 pointermove 都各自觸發一次 WebSocket 訊息造成塞車。
 */
export function useDrawingSync(handlers: RemoteStrokeHandlers) {
  const pendingPointsRef = useRef<StrokePoint[]>([]);
  const activeStrokeIdRef = useRef<string | null>(null);
  const rafHandleRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.on('stroke:start', handlers.onStrokeStart);
    socket.on('stroke:points', handlers.onStrokePoints);
    socket.on('stroke:end', handlers.onStrokeEnd);
    socket.on('canvas:clear', handlers.onCanvasClear);
    socket.on('canvas:undo', handlers.onCanvasUndo);

    return () => {
      socket.off('stroke:start', handlers.onStrokeStart);
      socket.off('stroke:points', handlers.onStrokePoints);
      socket.off('stroke:end', handlers.onStrokeEnd);
      socket.off('canvas:clear', handlers.onCanvasClear);
      socket.off('canvas:undo', handlers.onCanvasUndo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flushPending = useCallback(() => {
    rafHandleRef.current = null;
    const strokeId = activeStrokeIdRef.current;
    if (!strokeId || pendingPointsRef.current.length === 0) return;
    const points = pendingPointsRef.current;
    pendingPointsRef.current = [];
    getSocket().emit('stroke:points', { strokeId, points });
  }, []);

  const startStroke = useCallback(
    (params: { strokeId: string; color: string; width: number; tool: 'pen' | 'eraser'; point: StrokePoint }) => {
      activeStrokeIdRef.current = params.strokeId;
      pendingPointsRef.current = [];
      getSocket().emit('stroke:start', params);
    },
    []
  );

  const addPoint = useCallback(
    (point: StrokePoint) => {
      pendingPointsRef.current.push(point);
      if (rafHandleRef.current === null) {
        rafHandleRef.current = requestAnimationFrame(flushPending);
      }
    },
    [flushPending]
  );

  const endStroke = useCallback(() => {
    flushPending();
    const strokeId = activeStrokeIdRef.current;
    activeStrokeIdRef.current = null;
    if (strokeId) {
      getSocket().emit('stroke:end', { strokeId });
    }
  }, [flushPending]);

  const clearCanvas = useCallback(() => {
    getSocket().emit('canvas:clear');
  }, []);

  const undoLast = useCallback(() => {
    getSocket().emit('canvas:undo');
  }, []);

  return { startStroke, addPoint, endStroke, clearCanvas, undoLast };
}

export type { Stroke };
