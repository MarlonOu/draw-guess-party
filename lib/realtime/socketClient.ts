'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../types/events';
import { attachSocketLog } from '../client/clientLog';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * 取得共用的 socket 連線（單例）。
 * UI 元件不應直接呼叫本函式操作 socket，一律透過 useRoomSocket 等 Hook 存取。
 */
export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ autoConnect: true });
    // 連線與事件名稱寫進操作紀錄（隨錯誤回報一併送出；不含事件內容）
    attachSocketLog(socket as unknown as Parameters<typeof attachSocketLog>[0]);
  }
  return socket;
}
