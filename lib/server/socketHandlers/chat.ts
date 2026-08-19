import type { Server, Socket } from 'socket.io';
import { getRoom, recordCorrectGuess, toRoomSummary } from '../roomManager';
import { endRoundAndAdvance } from '../roundOrchestrator';
import { isAnswerMatch } from '../../guessing-engine/answerUtils';
import type { GuessMessage } from '../../types/round';

/**
 * 聊天／猜題事件 handler。搶答制：這一輪任何人猜中都會立刻計分並繼續進行，
 * 不會像先前版本那樣猜中一個人就整輪結束——要等「除了畫圖者之外的所有人都猜中」
 * 或時間到，這一輪才會真正結束。
 *
 * 猜題正確判定重用 guessing-engine 的 isAnswerMatch（正規化去空白/大小寫後比對），
 * 這段邏輯與音樂猜歌專案的答案比對規則一致。
 *
 * 判定條件：房間目前處於 drawing 階段、已選定 currentWord（畫圖者已從候選題目選好，
 * 不是還在選題階段）、傳訊息的人不是本輪畫圖者。
 *
 * 畫圖者本人在自己的回合裡完全不能發言（見下方 isDrawerTurn 分支）：前端已經把輸入框
 * disabled，這裡再擋一次是防禦改造過的 client 繞過前端限制，用聊天文字直接告訴大家答案。
 *
 * 已經猜中過的人，這一輪剩餘時間內的訊息一律不轉發（見下方 alreadyGuessed 分支）：
 * 搶答制下如果讓已經知道答案的人繼續發言，就有洩題給還在猜的人的風險，直接擋掉最安全。
 */
export function registerChatHandlers(io: Server, socket: Socket) {
  socket.on('chat:message', ({ text }) => {
    const joinCode = socket.data.joinCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!joinCode || !playerId) return;

    const room = getRoom(joinCode);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    const isDrawerTurn =
      room.status === 'playing' &&
      room.roundPhase === 'drawing' &&
      playerId === room.drawerPlayerId;
    if (isDrawerTurn) return;

    const alreadyGuessed = room.correctGuesses.some((g) => g.playerId === playerId);
    // 已經猜中過的人，訊息一律不轉發：搶答制下如果讓他們繼續發言，等於可能把答案文字
    // 洩漏給還在猜的人（例如又打了一次答案、或聊到「對啦就是 XX」），直接擋掉最安全，
    // 不做「內容是否包含答案」的模糊判斷，避免漏判。
    if (alreadyGuessed) return;

    const isCorrectGuess =
      room.roundPhase === 'drawing' &&
      room.currentWord !== null &&
      playerId !== room.drawerPlayerId &&
      isAnswerMatch(text, room.currentWord);

    const message: GuessMessage = {
      id: crypto.randomUUID(),
      playerId,
      displayName: player.displayName,
      // 猜對時不把答案文字廣播出去（其他還在猜的人不該看到），前端依 isCorrectGuess 顯示「猜對了」
      text: isCorrectGuess ? '' : text,
      isCorrectGuess,
      createdAt: new Date().toISOString(),
    };
    io.to(joinCode).emit('chat:message', message);

    if (!isCorrectGuess) return;

    const result = recordCorrectGuess(room, playerId);
    if (!result) return;

    if (result.allGuessed) {
      // 全員猜中，這一輪立刻結束，room:state 交給 endRoundAndAdvance 統一廣播
      void endRoundAndAdvance(io, room);
    } else {
      // 這一輪還沒結束，但分數已經變了，先廣播一次讓玩家清單即時反映新分數
      io.to(joinCode).emit('room:state', toRoomSummary(room));
    }
  });
}
