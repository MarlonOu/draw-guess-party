import type { Server, Socket } from 'socket.io';
import { getRoom } from '../roomManager';
import {
  handleTelephoneGuessSubmit,
  handleTelephoneDrawingSubmit,
  handleTelephoneVoteReady,
} from '../telephoneOrchestrator';

/**
 * DRAW_TELEPHONE 模式的猜測／畫作提交事件。驗證（是不是他的回合、房間是不是接龍模式、
 * 現在是不是對的子階段）都交給 roomManager 的 submitTelephoneGuess／submitTelephoneDrawing，
 * 這裡只負責從 socket.data 撈出 joinCode/playerId、轉呼叫、不符合條件就安靜忽略。
 */
export function registerTelephoneHandlers(io: Server, socket: Socket) {
  socket.on('telephone:submitGuess', ({ text }) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleTelephoneGuessSubmit(io, room, playerId, text);
  });

  socket.on('telephone:submitDrawing', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleTelephoneDrawingSubmit(io, room, playerId);
  });

  socket.on('telephone:voteReady', () => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;
    const room = getRoom(joinCode);
    if (!room) return;

    handleTelephoneVoteReady(io, room, playerId);
  });
}
