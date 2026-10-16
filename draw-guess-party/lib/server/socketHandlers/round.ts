import type { Server, Socket } from 'socket.io';
import { getRoom, chooseWord } from '../roomManager';
import { startDrawingPhase, clearRoundTimerForRoom } from '../roundOrchestrator';

/**
 * 選題事件 handler：畫圖者從 round:start 私訊拿到的候選題目中擇一。
 * 驗證交給 roomManager.chooseWord（是不是本人、id 是否在候選清單中）。
 *
 * 選定結果本身（題目文字）只私訊回畫圖者本人，不廣播給其他人。選定之後：
 *  - 取消原本排定的「選題限時」計時器（畫圖者提早選好，不用等滿 5 秒）
 *  - 呼叫 startDrawingPhase 正式進入作畫階段：廣播房間狀態（wordChosen 變 true，
 *    其他玩家的畫面才會從「等對方選題」切換成「對方在畫了」）、開始真正的作畫限時
 */
export function registerRoundHandlers(io: Server, socket: Socket) {
  socket.on('round:chooseWord', ({ wordId }) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;

    const room = getRoom(joinCode);
    if (!room) return;

    const chosenWord = chooseWord(room, playerId, wordId);
    if (!chosenWord) return;

    socket.emit('round:wordChosen', { word: chosenWord });
    clearRoundTimerForRoom(joinCode);
    startDrawingPhase(io, room);
  });
}
