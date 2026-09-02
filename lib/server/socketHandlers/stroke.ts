import type { Server, Socket } from 'socket.io';
import { getRoom } from '../roomManager';
import type { Stroke } from '../../types/stroke';
import type { RoomState } from '../roomManager';

/**
 * 「現在到底輪不輪得到這個人畫」的權限判斷，依模式分開判斷：
 *  - DRAW_GUESS：房間狀態為 playing、正處於 drawing 階段、是本輪畫圖者、且已選定題目
 *  - DRAW_TELEPHONE：接龍還沒公布、目前子階段是 drawing、且是接龍目前輪到的那個人
 */
function canDraw(room: RoomState, playerId: string): boolean {
  if (room.settings.mode === 'DRAW_TELEPHONE') {
    const t = room.telephone;
    if (!t || t.revealed || t.subPhase !== 'drawing') return false;
    return t.chainOrder[t.currentIndex] === playerId;
  }

  return (
    room.status === 'playing' &&
    room.roundPhase === 'drawing' &&
    playerId === room.drawerPlayerId &&
    room.currentWord !== null
  );
}

/** 目前正在累積筆畫的緩衝區，依模式指向不同欄位；DRAW_TELEPHONE 還沒開始接龍時回傳 null */
function getStrokeBuffer(room: RoomState): Stroke[] | null {
  if (room.settings.mode === 'DRAW_TELEPHONE') {
    return room.telephone?.currentStrokes ?? null;
  }
  return room.currentStrokes;
}

function clearStrokeBuffer(room: RoomState): void {
  if (room.settings.mode === 'DRAW_TELEPHONE') {
    if (room.telephone) room.telephone.currentStrokes = [];
    return;
  }
  room.currentStrokes = [];
}

/**
 * 畫布事件 handler：伺服器基本上只做轉發（relay），不驗證座標內容，確保延遲最低。
 * 權限判斷只在 stroke:start／canvas:clear／canvas:undo 這幾個「發起」動作做一次檢查；
 * stroke:points／stroke:end 信任同一個 strokeId 配對，不重複驗證權限，確保延遲最低。
 *
 * DRAW_TELEPHONE 模式刻意不把筆畫轉發（broadcast）給房間裡其他人——這個玩法的核心
 * 就是除了正在畫的那個人之外，誰都不該即時看到畫面內容，只有伺服器端默默把筆畫
 * 收進 telephone.currentStrokes，等這一棒交出去時才整包存成一筆 TelephoneEntry，
 * 一路到最後公布才會攤開給所有人看。DRAW_GUESS 模式則維持原本「畫的人以外的人都要
 * 即時看到」的轉發行為不變。
 */
export function registerStrokeHandlers(io: Server, socket: Socket) {
  socket.on('stroke:start', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    const buffer = getStrokeBuffer(room);
    if (!buffer) return;

    const stroke: Stroke = {
      id: payload.strokeId,
      playerId,
      color: payload.color,
      width: payload.width,
      tool: payload.tool,
      points: [payload.point],
    };
    buffer.push(stroke);

    if (room.settings.mode !== 'DRAW_TELEPHONE') {
      socket.to(joinCode).emit('stroke:start', { ...payload, playerId });
    }
  });

  socket.on('stroke:points', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    if (!joinCode) return;
    const room = getRoom(joinCode);
    if (!room) return;

    const buffer = getStrokeBuffer(room);
    const stroke = buffer?.find((s) => s.id === payload.strokeId);
    if (stroke) {
      stroke.points.push(...payload.points);
    }

    if (room.settings.mode !== 'DRAW_TELEPHONE') {
      socket.to(joinCode).emit('stroke:points', payload);
    }
  });

  socket.on('stroke:end', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    if (!joinCode) return;
    const room = getRoom(joinCode);
    if (!room) return;

    if (room.settings.mode !== 'DRAW_TELEPHONE') {
      socket.to(joinCode).emit('stroke:end', payload);
    }
  });

  socket.on('canvas:clear', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    clearStrokeBuffer(room);
    // 這裡曾經是一個真實的 bug：接龍模式「不轉發給其他人」的判斷式，把畫圖者
    // 自己也一併排除掉了——DRAW_TELEPHONE 刻意不讓其他人即時看到畫面內容沒錯，
    // 但清空／復原這個動作，畫圖者自己一定要收到才能讓自己的畫布真的清空／
    // 復原，不然按鈕點了伺服器內部狀態雖然有更新，畫面卻完全沒反應。
    // `socket.emit(...)` 只送給發起這個事件的人自己（不管哪個模式都要送）；
    // 廣播給「房間裡其他人」（`socket.to(joinCode).emit(...)`，不含自己）才是
    // 只有非 DRAW_TELEPHONE 模式需要做的事。
    socket.emit('canvas:clear', { playerId });
    if (room.settings.mode !== 'DRAW_TELEPHONE') {
      socket.to(joinCode).emit('canvas:clear', { playerId });
    }
  });

  socket.on('canvas:undo', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    const buffer = getStrokeBuffer(room);
    buffer?.pop();
    // 理由同上面 canvas:clear：畫圖者自己一定要收到才能讓自己的畫布真的復原。
    socket.emit('canvas:undo', { playerId });
    if (room.settings.mode !== 'DRAW_TELEPHONE') {
      socket.to(joinCode).emit('canvas:undo', { playerId });
    }
  });
}
