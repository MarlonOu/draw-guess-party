import type { Server, Socket } from 'socket.io';
import {
  getRoom,
  joinRoom,
  removePlayer,
  markPlayerDisconnected,
  toRoomSummary,
  findRoomBySocketId,
  beginGame,
  autoPickPendingWordIfNeeded,
  countConnectedPlayers,
  updateRoomSettings,
  returnToLobby,
  checkTelephoneVotesAndMaybeReturn,
  TELEPHONE_MIN_PLAYERS,
} from '../roomManager';
import { beginRound, endRoundAndAdvance, clearRoundTimerForRoom, finishMatchAndScheduleRestart } from '../roundOrchestrator';
import {
  beginTelephoneRound,
  forceAdvanceTelephoneOnRemoval,
  clearTelephoneTimerForRoom,
  sendYourTurn,
} from '../telephoneOrchestrator';

/**
 * 斷線緩衝時間：手機切到別的 App（例如分享房間連結）、或短暫網路不穩時，瀏覽器分頁
 * 常被系統暫停、WebSocket 連線斷掉，但使用者只是暫時離開，幾秒內就會回來。
 * 給這段緩衝時間，讓 room:join 帶著原本的 playerId 重新連回來時能直接復原，
 * 不會被誤判成「真的離開了」而整個踢出房間、丟失分數與座位。
 */
const GRACE_PERIOD_MS = 20_000;

/** `${joinCode}:${playerId}` -> 緩衝期到期後真正執行移除的計時器 */
const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();

function graceKey(joinCode: string, playerId: string): string {
  return `${joinCode}:${playerId}`;
}

function cancelPendingRemoval(joinCode: string, playerId: string): void {
  const key = graceKey(joinCode, playerId);
  const timer = pendingRemovals.get(key);
  if (timer) {
    clearTimeout(timer);
    pendingRemovals.delete(key);
  }
}

export function registerRoomHandlers(io: Server, socket: Socket) {
  socket.on('room:join', ({ joinCode, displayName, playerId: existingPlayerId }) => {
    const room = getRoom(joinCode);
    if (!room) {
      socket.emit('room:error', { message: '找不到這個房間代碼' });
      return;
    }

    const player = joinRoom(joinCode, displayName, socket.id, existingPlayerId);
    if (!player) {
      socket.emit('room:error', { message: '找不到這個房間，或房間目前無法加入' });
      return;
    }

    // 這個人原本在斷線緩衝期等待被移除，現在他回來了，取消排定的移除
    if (existingPlayerId) {
      cancelPendingRemoval(joinCode, existingPlayerId);
    }

    socket.data.joinCode = joinCode;
    socket.data.playerId = player.id;
    socket.join(joinCode);

    socket.emit('room:joined', { playerId: player.id });
    io.to(joinCode).emit('room:state', toRoomSummary(room));

    // DRAW_TELEPHONE 模式：如果這個人重新整理頁面重連時剛好還輪到他（不管是猜測
    // 還是作畫子階段），要補送一次私訊——畫布筆畫跟猜測提示這些內容只透過私訊傳送，
    // 不會放進上面剛廣播的 room:state（避免其他人偷看），單純重連收不到任何內容，
    // 畫面會卡在一片空白、連「返回大廳」的按鈕都看不到，房間流程就此卡死。
    if (
      existingPlayerId &&
      room.settings.mode === 'DRAW_TELEPHONE' &&
      room.telephone &&
      !room.telephone.revealed &&
      room.telephone.chainOrder[room.telephone.currentIndex] === player.id
    ) {
      sendYourTurn(io, room);
    }
  });

  socket.on('room:leave', () => {
    // 主動離開：使用者明確表達要離開，沒有緩衝期，立刻執行
    const found = findRoomBySocketId(socket.id);
    if (!found) return;
    cancelPendingRemoval(found.room.joinCode, found.playerId);
    socket.leave(found.room.joinCode);
    performRemoval(io, found.room.joinCode, found.playerId);
  });

  socket.on('disconnect', () => {
    handleDisconnect(io, socket);
  });

  socket.on('room:start', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    if (!joinCode) return;
    const room = getRoom(joinCode);
    if (!room) return;
    if (room.status !== 'lobby') return;

    if (room.settings.mode === 'DRAW_TELEPHONE') {
      // 接龍模式需要至少 3 人才玩得起來（第一棒畫、中間至少一棒猜+畫、最後一棒猜）
      if (countConnectedPlayers(room) < TELEPHONE_MIN_PLAYERS) {
        socket.emit('room:error', { message: `至少需要 ${TELEPHONE_MIN_PLAYERS} 人才能開始接龍` });
        return;
      }
      void beginTelephoneRound(io, room);
      return;
    }

    // 沒有房主限制：房間裡任何一個人都可以觸發開始，只要求連線中人數 >= 2
    if (countConnectedPlayers(room) < 2) {
      socket.emit('room:error', { message: '至少需要 2 人才能開始遊戲' });
      return;
    }

    beginGame(room);
    io.to(joinCode).emit('room:state', toRoomSummary(room));
    void beginRound(io, room);
  });

  socket.on('room:updateSettings', (patch) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    const ok = updateRoomSettings(room, playerId, patch);
    if (!ok) return; // 不是房主、或房間不在 lobby，安靜忽略，不特別回錯誤

    io.to(joinCode).emit('room:state', toRoomSummary(room));
  });

  socket.on('room:cancelAutoRestart', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;
    if (room.status !== 'finished') return;
    if (playerId !== room.hostPlayerId) return;

    clearRoundTimerForRoom(joinCode);
    returnToLobby(room);
    io.to(joinCode).emit('room:state', toRoomSummary(room));
  });
}

/**
 * Socket 斷線（非主動離開）：不立刻移除，先標記離線並排定 GRACE_PERIOD_MS 後才真正
 * 執行移除。這段期間如果同一個人帶著原本的 playerId 重新 room:join，會在上面的
 * room:join handler 裡取消這個計時器，什麼事都不會發生（座位、分數都還在）。
 */
function handleDisconnect(io: Server, socket: Socket): void {
  const found = findRoomBySocketId(socket.id);
  if (!found) return;

  const { room, playerId } = found;
  socket.leave(room.joinCode);

  markPlayerDisconnected(room.joinCode, playerId);
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));

  const key = graceKey(room.joinCode, playerId);
  const timer = setTimeout(() => {
    pendingRemovals.delete(key);
    performRemoval(io, room.joinCode, playerId);
  }, GRACE_PERIOD_MS);
  pendingRemovals.set(key, timer);
}

/**
 * 真正執行移除一名玩家，並處理後續的「遊戲體驗」反應：
 *
 * 硬刪除本身（含 turnOrder／drawerIndex／roundCount／correctGuesses 的修正）交給
 * roomManager.removePlayer 處理，這裡只負責刪除之後要做的事：
 *
 * - 房間刪空了（沒人了）：清掉計時器，不用再廣播任何東西。
 * - 比賽正在進行中，刪除後連線人數不足 2 人：比賽玩不下去了，公布目前分數並結束，
 *   停留數秒後自動回到 lobby 等待畫面（見 finishMatchAndScheduleRestart）。
 * - 比賽正在進行中，人數還夠，但離開的剛好是目前正在畫圖的人：這一題直接中斷、
 *   公布目前為止已經猜中的人拿到的分數、自動進下一輪——不必等逾時。
 * - 其餘情況：只要廣播一次最新的房間狀態即可，「還需要幾人猜對」等統計會自動反映
 *   新的人數，不需要額外處理。
 */
function performRemoval(io: Server, joinCode: string, playerId: string): void {
  const room = getRoom(joinCode);
  if (!room) return;

  const { wasCurrentDrawer, wasActiveTelephonePlayer, roomDeleted } = removePlayer(joinCode, playerId);

  if (roomDeleted) {
    clearRoundTimerForRoom(joinCode);
    clearTelephoneTimerForRoom(joinCode);
    return;
  }

  io.to(joinCode).emit('room:state', toRoomSummary(room));

  // 接龍模式的公布階段（作品列表，投票「準備好下一場」的那個畫面）如果有人在
  // 這時候斷線被移除，剩餘連線中玩家的投票門檻要重新算一次——不然可能發生
  // 「原本 3 人差 1 票，那個沒投票的人自己先斷線被移除，剩下 2 人早就都投過
  // 票了，卻永遠等不到會自動觸發返回大廳的下一次投票」這種房間卡死的情況。
  // 這裡刻意用單獨一次 room:state 廣播（不是跟上面那次合併），讓所有人先看到
  // 「少一個人」的狀態，如果緊接著真的觸發返回大廳，再收到第二次「已經是
  // lobby」的狀態，兩個狀態轉換分開看比較清楚，不會混在一起看不出發生了什麼。
  if (room.status === 'finished' && room.settings.mode === 'DRAW_TELEPHONE') {
    if (checkTelephoneVotesAndMaybeReturn(room)) {
      io.to(joinCode).emit('room:state', toRoomSummary(room));
    }
  }

  if (room.status !== 'playing') return;

  if (room.settings.mode === 'DRAW_TELEPHONE') {
    if (wasActiveTelephonePlayer) {
      // 保留至先前推進到下一位的邏輯（或提早進入公布階段，如果後面已經沒有人了）
      forceAdvanceTelephoneOnRemoval(io, room);
    }
    return;
  }

  if (room.players.size < 2) {
    clearRoundTimerForRoom(joinCode);
    void finishMatchAndScheduleRestart(io, room, { allowRestart: false });
    return;
  }

  if (wasCurrentDrawer) {
    // 保底選一個候選題目（如果畫圖者連題目都還沒選就跑了，總要有個答案可以公布），
    // 再走正常的「結束這一輪」流程
    autoPickPendingWordIfNeeded(room);
    void endRoundAndAdvance(io, room);
  }
}
