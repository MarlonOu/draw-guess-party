import type { Server } from 'socket.io';
import type { RoomState } from './roomManager';
import {
  beginTelephoneGame,
  submitTelephoneGuess,
  submitTelephoneDrawing,
  autoSubmitTelephoneTurn,
  voteReadyForNextRound,
  toRoomSummary,
} from './roomManager';
import { wordRepository } from '../repository/wordRepository';
import { TELEPHONE_GUESS_TIMEOUT_SEC, TELEPHONE_DRAWING_TIMEOUT_SEC } from '../shared/telephoneConstants';

/** 猜測階段限時：只是寫一句話，不需要太久 */
const GUESS_TIMEOUT_MS = TELEPHONE_GUESS_TIMEOUT_SEC * 1000;
/** 作畫階段限時：比猜測久，但一樣不能無限等，避免卡住整條接龍 */
const DRAWING_TIMEOUT_MS = TELEPHONE_DRAWING_TIMEOUT_SEC * 1000;

/** joinCode -> 目前排程中的逾時計時器（猜測限時或作畫限時），同一房間同時只會有一個 */
const telephoneTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTelephoneTimer(joinCode: string): void {
  const handle = telephoneTimers.get(joinCode);
  if (handle) {
    clearTimeout(handle);
    telephoneTimers.delete(joinCode);
  }
}

export function clearTelephoneTimerForRoom(joinCode: string): void {
  clearTelephoneTimer(joinCode);
}

/**
 * 私訊通知「現在輪到的人」該做什麼，並排程對應子階段的逾時計時器。
 * guessing：附上前一棒的完整筆畫資料，讓他看圖猜測；
 * 匯出這個函式的原因：重新整理頁面重連時，如果剛好還輪到這個人（畫布內容跟
 * 猜測提示只透過這個私訊傳送，不會放進公開的 room:state，避免其他人偷看），
 * 需要重新呼叫這個函式補送一次，不然重連後的畫面會拿不到任何內容、卡在空白，
 * 見 socketHandlers/room.ts 的 room:join handler。重連時會連帶重新排程逾時計時器，
 * 等於重新整理可以拿到一次全新的限時額度，這款派對遊戲的情境下是可接受的小恩惠，
 * 不是需要防範的漏洞。
 * drawing：附上要畫的提示文字——如果是接龍第一棒，提示是系統隨機抽的原始題目；
 *          否則是他自己剛才送出的猜測文字。刻意不讓 drawing 子階段看得到前一棒的
 *          圖（只給文字），避免變成照著臨摹、失去「傳話」該有的失真效果。
 */
export function sendYourTurn(io: Server, room: RoomState): void {
  const t = room.telephone;
  if (!t || t.revealed) return;

  const activePlayerId = t.chainOrder[t.currentIndex];
  const player = room.players.get(activePlayerId);
  if (!player?.socketId) return;

  if (t.subPhase === 'guessing') {
    const previousEntry = t.entries[t.entries.length - 1];
    io.to(player.socketId).emit('telephone:yourTurn', {
      subPhase: 'guessing',
      previousStrokes: previousEntry ? previousEntry.strokes : [],
    });
    scheduleTimeout(io, room, GUESS_TIMEOUT_MS);
  } else if (t.subPhase === 'drawing') {
    // 提示文字的來源依流程分開判斷：
    //  - 接龍第一棒（不管哪種流程）：系統隨機抽的原始題目
    //  - 'combined' 流程：自己剛才在同一次輪到自己時送出的猜測文字（暫存在
    //    pendingGuessText，兩者是同一個人、同一次回合內先後發生）
    //  - 'alternating' 流程：猜跟畫是不同人分開做的獨立回合，不會有
    //    pendingGuessText 這回事（見 submitTelephoneGuess），提示文字要讀
    //    entries 陣列最後一筆——那一筆正是剛才「猜」的那個人交出的猜測 entry
    const promptText =
      t.currentIndex === 0
        ? (t.originalWord ?? '')
        : room.settings.telephoneFlow === 'alternating'
          ? (t.entries[t.entries.length - 1]?.guessText ?? '')
          : (t.pendingGuessText ?? '');
    io.to(player.socketId).emit('telephone:yourTurn', {
      subPhase: 'drawing',
      promptText,
    });
    scheduleTimeout(io, room, DRAWING_TIMEOUT_MS);
  }
}

function scheduleTimeout(io: Server, room: RoomState, ms: number): void {
  clearTelephoneTimer(room.joinCode);
  const timer = setTimeout(() => {
    advanceTelephone(io, room, autoSubmitTelephoneTurn(room));
  }, ms);
  telephoneTimers.set(room.joinCode, timer);
}

/**
 * 統一的「推進接龍」收尾動作：不管是玩家主動送出、還是逾時/斷線自動代打，
 * 送出結果之後都走這裡——廣播最新房間狀態，如果已經公布就送出完整的
 * telephone:reveal 內容並把房間標記為 finished，否則私訊通知下一位該做什麼。
 */
function advanceTelephone(io: Server, room: RoomState, result: unknown): void {
  if (!result) return;
  clearTelephoneTimer(room.joinCode);

  const t = room.telephone;
  if (!t) return;

  io.to(room.joinCode).emit('room:state', toRoomSummary(room));

  if (t.revealed) {
    io.to(room.joinCode).emit('telephone:reveal', {
      originalWord: t.originalWord ?? '',
      entries: t.entries,
    });
    room.status = 'finished';
    io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    // 接龍模式目前不做「自動開新一場」（DRAW_GUESS 才有那套機制），公布完就停在
    // finished 畫面，要不要再玩一輪由房間裡的人自己決定、手動重新開始。
    io.to(room.joinCode).emit('game:finished', { nextMatchInSec: null });
    return;
  }

  sendYourTurn(io, room);
}

/**
 * 開始一場接龍：抽題、排順序、狀態轉為 playing，並私訊通知第一棒開始畫。
 * 呼叫端（room:start handler）應該已經先確認連線人數 >= 3，這裡的 beginTelephoneGame
 * 失敗只處理「題庫剛好是空的」這種邊界情況。
 */
export async function beginTelephoneRound(io: Server, room: RoomState): Promise<void> {
  clearTelephoneTimer(room.joinCode);

  const words = await wordRepository.getByFilter(
    room.settings.categoryFilter,
    room.settings.difficultyFilter
  );
  const result = beginTelephoneGame(room, words);

  if (!result) {
    room.status = 'lobby';
    io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    io.to(room.joinCode).emit('room:error', { message: '目前題庫是空的，暫時無法開始接龍' });
    return;
  }

  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
  sendYourTurn(io, room);
}

export function handleTelephoneGuessSubmit(
  io: Server,
  room: RoomState,
  playerId: string,
  text: string
): void {
  advanceTelephone(io, room, submitTelephoneGuess(room, playerId, text));
}

export function handleTelephoneDrawingSubmit(io: Server, room: RoomState, playerId: string): void {
  advanceTelephone(io, room, submitTelephoneDrawing(room, playerId));
}

/**
 * 公布階段的「準備好下一場」投票。不能直接沿用 advanceTelephone（那個函式在
 * result 為 truthy 時，如果 t.revealed 是 true 就會發送 telephone:reveal／
 * game:finished 這些「剛公布」才該送一次的事件——投票階段房間早就已經公布過、
 * 已經是 finished 狀態了，重複送這些事件沒有意義，只需要單純廣播一次最新的
 * room:state 讓所有人看到投票進度／或者已經返回大廳）。
 */
export function handleTelephoneVoteReady(io: Server, room: RoomState, playerId: string): void {
  const result = voteReadyForNextRound(room, playerId);
  if (!result) return;
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
}

/** 目前輪到的人被硬移除（斷線緩衝期到期仍未回來）時呼叫：自動代他送出空白內容並往下推進 */
export function forceAdvanceTelephoneOnRemoval(io: Server, room: RoomState): void {
  advanceTelephone(io, room, autoSubmitTelephoneTurn(room));
}
