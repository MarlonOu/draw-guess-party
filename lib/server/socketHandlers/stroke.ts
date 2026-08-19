import type { Server, Socket } from 'socket.io';
import { getRoom } from '../roomManager';
import type { Stroke } from '../../types/stroke';
import type { RoomState } from '../roomManager';

/**
 * 「現在到底輪不輪得到這個人畫」的權限判斷：只有房間狀態為 playing、目前正處於
 * drawing 階段、該玩家是 room.drawerPlayerId 本人、且已經選定題目（currentWord
 * 不為 null，代表不是還在選題畫面）時才准畫。其餘一律拒絕，包含房間還在 lobby、
 * 比賽已結束、公布答案停留期間、或畫圖者還沒從候選題目選出一個——不再像先前版本
 * 允許 lobby 自由塗鴉，因為畫布現在同時兼作狀態看板，lobby 階段要顯示「尚未開始」。
 */
function canDraw(room: RoomState, playerId: string): boolean {
  return (
    room.status === 'playing' &&
    room.roundPhase === 'drawing' &&
    playerId === room.drawerPlayerId &&
    room.currentWord !== null
  );
}

/**
 * 畫布事件 handler：伺服器基本上只做轉發（relay），不驗證座標內容，確保延遲最低。
 * 權限判斷只在 stroke:start／canvas:clear／canvas:undo 這幾個「發起」動作做一次檢查；
 * stroke:points／stroke:end 信任同一個 strokeId 配對，不重複驗證權限，確保延遲最低。
 */
export function registerStrokeHandlers(io: Server, socket: Socket) {
  socket.on('stroke:start', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    const stroke: Stroke = {
      id: payload.strokeId,
      playerId,
      color: payload.color,
      width: payload.width,
      tool: payload.tool,
      points: [payload.point],
    };
    room.currentStrokes.push(stroke);

    socket.to(joinCode).emit('stroke:start', { ...payload, playerId });
  });

  socket.on('stroke:points', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    if (!joinCode) return;
    const room = getRoom(joinCode);
    if (!room) return;

    const stroke = room.currentStrokes.find((s) => s.id === payload.strokeId);
    if (stroke) {
      stroke.points.push(...payload.points);
    }

    socket.to(joinCode).emit('stroke:points', payload);
  });

  socket.on('stroke:end', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    if (!joinCode) return;
    socket.to(joinCode).emit('stroke:end', payload);
  });

  socket.on('canvas:clear', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    room.currentStrokes = [];
    io.to(joinCode).emit('canvas:clear', { playerId });
  });

  socket.on('canvas:undo', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    room.currentStrokes.pop();
    io.to(joinCode).emit('canvas:undo', { playerId });
  });
}
