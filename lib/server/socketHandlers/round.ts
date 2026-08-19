import type { Server, Socket } from 'socket.io';
import { getRoom, chooseWord, toRoomSummary } from '../roomManager';

/**
 * 選題事件 handler：畫圖者從 round:start 私訊拿到的候選題目中擇一。
 * 驗證交給 roomManager.chooseWord（是不是本人、id 是否在候選清單中）。
 *
 * 選定結果本身（題目文字）只私訊回畫圖者本人，不廣播給其他人；但「選定了」這件事
 * 本身（RoomSummary.wordChosen 從 false 變 true）需要廣播給全房間，讓其他玩家的
 * 畫面知道現在從「等對方選題」切換成「對方在畫了」——這個廣播漏掉的話，其他玩家
 * 的畫面會卡在等待疊層上，即使畫圖者早就選好題目開始畫了。
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
    io.to(joinCode).emit('room:state', toRoomSummary(room));
  });
}
