import type { Server, Socket } from 'socket.io';
import { getRoom, setFragmentOrientation, joinFragmentTeam, toRoomSummary } from '../roomManager';
import {
  handleFragmentSubmitDrawing1,
  handleFragmentSubmitDrawing2,
  handleFragmentSubmitGuess,
  handleFragmentVoteReady,
} from '../fragmentOrchestrator';

/**
 * FRAGMENT_DRAW 模式的事件 handler。驗證（是不是這個人的回合、房間是不是這個
 * 模式、現在是不是對的子階段）都交給 roomManager 的對應函式（setFragmentOrientation／
 * submitFragmentDrawing1／submitFragmentDrawing2／submitFragmentGuess），這裡只
 * 負責從 socket.data 撈出 joinCode/playerId、轉呼叫、不符合條件就安靜忽略——
 * 跟 socketHandlers/telephone.ts 是同一套設計原則。
 */
export function registerFragmentHandlers(io: Server, socket: Socket) {
  socket.on('fragment:setOrientation', ({ orientation }) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    const ok = setFragmentOrientation(room, playerId, orientation);
    if (!ok) return;
    const team = room.fragment?.teams.find((t) => t.playerIds[0] === playerId);
    if (!team) return;

    // 這裡曾經是一個真實的 bug：切換方向只送了 canvas:clear（讓畫布清空），
    // 卻沒有回傳更新後的 fragment:yourTurn——前端的 splitOrientation 只在收到
    // fragment:yourTurn 時才會更新，沒有這個事件，前端畫面上的引導線、切割方向
    // 顯示文字全部停留在切換前的舊值，即使伺服器內部狀態（跟畫布清空）都已經
    // 正確更新，畫面卻完全沒反應，看起來像是「切換沒有及時顯示」。
    // 補回這個事件，前端才會真的重新渲染成新的切割方向。
    socket.emit('fragment:yourTurn', {
      teamId: team.id,
      subPhase: 'drawing1',
      word: team.word,
      splitOrientation: team.splitOrientation,
    });
    // 切換方向會清空畫布內容，只需要通知這個人自己（其他人本來就看不到起手
    // 作畫中的內容，不需要廣播），讓他的畫布跟著清空重畫。
    socket.emit('canvas:clear', { playerId });
  });

  socket.on('fragment:submitDrawing1', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleFragmentSubmitDrawing1(io, room, playerId);
  });

  socket.on('fragment:submitDrawing2', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleFragmentSubmitDrawing2(io, room, playerId);
  });

  socket.on('fragment:submitGuess', ({ text }) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleFragmentSubmitGuess(io, room, playerId, text);
  });

  socket.on('fragment:voteReady', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleFragmentVoteReady(io, room, playerId);
  });

  socket.on('fragment:joinTeam', ({ teamNumber }) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    const ok = joinFragmentTeam(room, playerId, teamNumber);
    if (!ok) return;
    io.to(joinCode).emit('room:state', toRoomSummary(room));
  });
}
