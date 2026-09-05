import type { Server, Socket } from 'socket.io';
import { getRoom, getFragmentActiveDrawContext, isFragmentPointAllowed } from '../roomManager';
import type { Stroke, StrokePoint } from '../../types/stroke';
import type { RoomState } from '../roomManager';

/**
 * 「現在到底輪不輪得到這個人畫」的權限判斷，依模式分開判斷：
 *  - DRAW_GUESS：房間狀態為 playing、正處於 drawing 階段、是本輪畫圖者、且已選定題目
 *  - DRAW_TELEPHONE：接龍還沒公布、目前子階段是 drawing、且是接龍目前輪到的那個人
 *  - FRAGMENT_DRAW：這個人現在是不是某一組正在畫的那一位（起手或補全），
 *    見 roomManager.ts 的 getFragmentActiveDrawContext——不像前兩種模式只有
 *    「一個人在畫」，這個模式可能同時有好幾組分別在畫，要先找出這個人屬於哪組、
 *    現在是不是輪到他
 */
function canDraw(room: RoomState, playerId: string): boolean {
  if (room.settings.mode === 'DRAW_TELEPHONE') {
    const t = room.telephone;
    if (!t || t.revealed || t.subPhase !== 'drawing') return false;
    return t.chainOrder[t.currentIndex] === playerId;
  }
  if (room.settings.mode === 'FRAGMENT_DRAW') {
    return getFragmentActiveDrawContext(room, playerId) !== null;
  }

  return (
    room.status === 'playing' &&
    room.roundPhase === 'drawing' &&
    playerId === room.drawerPlayerId &&
    room.currentWord !== null
  );
}

/** 目前正在累積筆畫的緩衝區，依模式指向不同欄位；FRAGMENT_DRAW 要先知道是哪個
 *  玩家才能判斷是哪一組、該寫進 firstDrawerStrokes 還是 secondDrawerStrokes */
function getStrokeBuffer(room: RoomState, playerId: string): Stroke[] | null {
  if (room.settings.mode === 'DRAW_TELEPHONE') {
    return room.telephone?.currentStrokes ?? null;
  }
  if (room.settings.mode === 'FRAGMENT_DRAW') {
    return getFragmentActiveDrawContext(room, playerId)?.buffer ?? null;
  }
  return room.currentStrokes;
}

function clearStrokeBuffer(room: RoomState, playerId: string): void {
  if (room.settings.mode === 'DRAW_TELEPHONE') {
    if (room.telephone) room.telephone.currentStrokes = [];
    return;
  }
  if (room.settings.mode === 'FRAGMENT_DRAW') {
    // buffer 是直接指向 team.firstDrawerStrokes／secondDrawerStrokes 的參照
    // （同一個陣列物件），改 .length = 0 是原地清空、不是換一個新陣列，這樣
    // team 內部欄位也會跟著清空，不需要另外再找一次 team 把欄位重新賦值。
    const buffer = getFragmentActiveDrawContext(room, playerId)?.buffer;
    if (buffer) buffer.length = 0;
    return;
  }
  room.currentStrokes = [];
}

/**
 * FRAGMENT_DRAW 補全階段，驗證這個點是不是真的落在允許他畫的範圍內（另一半，
 * 不是起手保留下來已經有內容的那一半）——伺服器端要做這層驗證，不能只靠前端
 * 畫布限制指標事件，見 fragmentEngine.ts 的 isPointInAllowedHalf 說明。
 * 其他情境（不是 FRAGMENT_DRAW 模式、或這個人是起手不是補全）一律放行，
 * 起手本來就可以自由畫滿整個畫布。
 */
function isFragmentPointValid(room: RoomState, playerId: string, point: StrokePoint): boolean {
  if (room.settings.mode !== 'FRAGMENT_DRAW') return true;
  const ctx = getFragmentActiveDrawContext(room, playerId);
  if (!ctx || ctx.team.keptHalf === null) return true; // 起手階段，還沒有 keptHalf，不受限制
  return isFragmentPointAllowed(ctx.team, point);
}

/**
 * 這一筆畫（或這次清空/復原動作）除了畫的人自己以外，還應該讓誰即時看到：
 *  - 'all'：除了自己，房間裡其他所有人都要看到（DRAW_GUESS 原本的行為）
 *  - 'none'：誰都不該看到（DRAW_TELEPHONE 的核心機密性設計、以及 FRAGMENT_DRAW
 *    起手作畫中——見模組層級對應檔案裡「後一位看不到前一位的繪畫過程」的需求）
 *  - 一個特定 socketId：只有這個人該看到（FRAGMENT_DRAW 補全作畫中，隊友
 *    〔起手〕可以即時看，見 roomManager.ts getFragmentActiveDrawContext 的說明）
 */
function getBroadcastTarget(room: RoomState, playerId: string): 'all' | 'none' | string {
  if (room.settings.mode === 'DRAW_TELEPHONE') return 'none';
  if (room.settings.mode === 'FRAGMENT_DRAW') {
    return getFragmentActiveDrawContext(room, playerId)?.watcherSocketId ?? 'none';
  }
  return 'all';
}

/**
 * 畫布事件 handler：伺服器基本上只做轉發（relay），不驗證座標內容（FRAGMENT_DRAW
 * 補全階段的範圍驗證是唯一例外，見 isFragmentPointValid），確保延遲最低。
 * 權限判斷只在 stroke:start／canvas:clear／canvas:undo 這幾個「發起」動作做一次檢查；
 * stroke:points／stroke:end 信任同一個 strokeId 配對，不重複驗證權限，確保延遲最低。
 *
 * 廣播對象依模式跟目前情境動態決定（見 getBroadcastTarget）：DRAW_GUESS 維持
 * 「畫的人以外的人都要即時看到」；DRAW_TELEPHONE 誰都不該即時看到（機密性是
 * 這個玩法的核心）；FRAGMENT_DRAW 依「起手」或「補全」階段不同，分別是「沒人看」
 * 或「只有隊友看」。
 */
export function registerStrokeHandlers(io: Server, socket: Socket) {
  socket.on('stroke:start', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;
    if (!isFragmentPointValid(room, playerId, payload.point)) return;

    const buffer = getStrokeBuffer(room, playerId);
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

    const target = getBroadcastTarget(room, playerId);
    if (target === 'all') {
      socket.to(joinCode).emit('stroke:start', { ...payload, playerId });
    } else if (target !== 'none') {
      io.to(target).emit('stroke:start', { ...payload, playerId });
    }
  });

  socket.on('stroke:points', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;
    // 同一筆畫的後續點，只要有任何一個點超出允許範圍就整批拒收——正常的客戶端
    // （畫布本身就限制指標事件在允許範圍內）不會送出這種資料，這裡純粹是
    // 防禦不受信任或有 bug 的客戶端，不需要做到逐點篩選這麼複雜。
    if (!payload.points.every((p: StrokePoint) => isFragmentPointValid(room, playerId, p))) return;

    const buffer = getStrokeBuffer(room, playerId);
    const stroke = buffer?.find((s) => s.id === payload.strokeId);
    if (stroke) {
      stroke.points.push(...payload.points);
    }

    const target = getBroadcastTarget(room, playerId);
    if (target === 'all') {
      socket.to(joinCode).emit('stroke:points', payload);
    } else if (target !== 'none') {
      io.to(target).emit('stroke:points', payload);
    }
  });

  socket.on('stroke:end', (payload) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    const target = getBroadcastTarget(room, playerId);
    if (target === 'all') {
      socket.to(joinCode).emit('stroke:end', payload);
    } else if (target !== 'none') {
      io.to(target).emit('stroke:end', payload);
    }
  });

  socket.on('canvas:clear', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    clearStrokeBuffer(room, playerId);
    // 這裡曾經是一個真實的 bug：接龍模式「不轉發給其他人」的判斷式，把畫圖者
    // 自己也一併排除掉了——DRAW_TELEPHONE／FRAGMENT_DRAW 刻意限制別人即時看到
    // 內容沒錯，但清空／復原這個動作，畫圖者自己一定要收到才能讓自己的畫布真的
    // 清空／復原，不然按鈕點了伺服器內部狀態雖然有更新，畫面卻完全沒反應。
    // `socket.emit(...)` 只送給發起這個事件的人自己（不管哪個模式都要送）；
    // 廣播給其他人（依 getBroadcastTarget 決定對象）才是視模式而定的行為。
    socket.emit('canvas:clear', { playerId });
    const target = getBroadcastTarget(room, playerId);
    if (target === 'all') {
      socket.to(joinCode).emit('canvas:clear', { playerId });
    } else if (target !== 'none') {
      io.to(target).emit('canvas:clear', { playerId });
    }
  });

  socket.on('canvas:undo', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room || !canDraw(room, playerId)) return;

    const buffer = getStrokeBuffer(room, playerId);
    buffer?.pop();
    // 理由同上面 canvas:clear：畫圖者自己一定要收到才能讓自己的畫布真的復原。
    socket.emit('canvas:undo', { playerId });
    const target = getBroadcastTarget(room, playerId);
    if (target === 'all') {
      socket.to(joinCode).emit('canvas:undo', { playerId });
    } else if (target !== 'none') {
      io.to(target).emit('canvas:undo', { playerId });
    }
  });
}
