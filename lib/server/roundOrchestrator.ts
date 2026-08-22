import type { Server } from 'socket.io';
import type { RoomState } from './roomManager';
import {
  startNextRound,
  endCurrentRound,
  isGameFinished,
  finishGame,
  toRoomSummary,
  autoPickPendingWordIfNeeded,
  beginGame,
  resetScoresForNewMatch,
  countConnectedPlayers,
  returnToLobby,
} from './roomManager';
import { wordRepository } from '../repository/wordRepository';

/** 公布答案（或公布整場比賽名次）後，停留多久才自動繼續下一步 */
const ROUND_END_PAUSE_SEC = 5;
const ROUND_END_PAUSE_MS = ROUND_END_PAUSE_SEC * 1000;

/** 選題限時：固定 5 秒，跟作畫限時（roundDurationSec，房間設定可調）分開計算，
 *  超過沒選就自動保底選一個，確保不會有人一直卡在選題畫面拖時間 */
const SELECTION_TIMEOUT_MS = 5_000;

/** joinCode -> 目前排程中的計時器（回合限時、公布答案後的停留、或整場結束後的重啟），同一房間同時只會有一個 */
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearRoomTimer(joinCode: string) {
  const handle = roomTimers.get(joinCode);
  if (handle) {
    clearTimeout(handle);
    roomTimers.delete(joinCode);
  }
}

/**
 * 開始下一輪：抽出候選題目、指定畫圖者，並排程「選題限時」（固定 5 秒，見
 * SELECTION_TIMEOUT_MS）。真正的作畫限時（roundDurationSec，房間設定可調）要等
 * 選題完成（畫圖者主動選、或選題逾時自動保底選）之後才開始算，兩段時間互不影響——
 * 之前的版本選題跟作畫共用同一個計時器，選題拖越久留給作畫的時間就越少，這裡拆開。
 * 候選題目只透過私訊（`io.to(socketId)`）送給畫圖者，廣播給全房間的 `round:start` 不含題目內容
 */
export async function beginRound(io: Server, room: RoomState): Promise<void> {
  clearRoomTimer(room.joinCode);

  const words = await wordRepository.getByFilter(
    room.settings.categoryFilter,
    room.settings.difficultyFilter
  );
  const result = startNextRound(room, words);

  if (!result) {
    // 題庫用完了（通常是分類篩選太窄、題數不夠這場比賽用），這場比賽只能提前結束；
    // 但下一場比賽開始時 usedWordIds 會重置，屆時題庫又是滿的，所以還是照常排程自動重啟。
    void finishMatchAndScheduleRestart(io, room);
    return;
  }

  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
  io.to(room.joinCode).emit('round:start', {
    roundIndex: result.roundIndex,
    roundCount: room.roundCount,
    roundDurationSec: room.settings.roundDurationSec,
    drawerPlayerId: result.drawerPlayerId,
  });

  const drawer = room.players.get(result.drawerPlayerId);
  if (drawer?.socketId) {
    io.to(drawer.socketId).emit('round:start', {
      roundIndex: result.roundIndex,
      roundCount: room.roundCount,
      roundDurationSec: room.settings.roundDurationSec,
      drawerPlayerId: result.drawerPlayerId,
      wordOptions: result.wordOptions,
    });
  }

  const selectionTimer = setTimeout(() => {
    // 選題逾時（5 秒）畫圖者還沒選，自動保底選候選清單的第一個，直接進入作畫階段。
    // 一定要私訊通知畫圖者選到了什麼字——不然畫圖者的畫面永遠不知道題目是什麼，
    // 畫布權限判斷（前端的 canDrawNow 要求拿到題目文字才解鎖）就會卡死在「未解鎖」
    // 狀態，即使伺服器這邊其實已經准許他畫了。這是先前版本漏掉的地方。
    const autoWord = autoPickPendingWordIfNeeded(room);
    if (autoWord && drawer?.socketId) {
      io.to(drawer.socketId).emit('round:wordChosen', { word: autoWord });
    }
    startDrawingPhase(io, room);
  }, SELECTION_TIMEOUT_MS);
  roomTimers.set(room.joinCode, selectionTimer);
}

/**
 * 選題完成（不管是畫圖者主動選、還是選題逾時自動保底選），正式進入作畫階段：
 * 廣播一次房間狀態（`wordChosen` 這時候會是 true，前端據此才開始顯示倒數橫條），
 * 並排程真正的作畫限時計時器（房間設定的 roundDurationSec）。
 */
export function startDrawingPhase(io: Server, room: RoomState): void {
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));

  const drawingTimer = setTimeout(() => {
    void endRoundAndAdvance(io, room);
  }, room.settings.roundDurationSec * 1000);
  roomTimers.set(room.joinCode, drawingTimer);
}

/**
 * 結束目前這一輪（時間到，或所有猜題者都已猜中）
 * 公布答案後，若比賽尚未結束，排程 ROUND_END_PAUSE_MS 後自動開始下一輪；
 * 若這是最後一輪，排程同樣的停留時間後結束整場比賽（見 finishMatchAndScheduleRestart）
 */
export async function endRoundAndAdvance(io: Server, room: RoomState): Promise<void> {
  clearRoomTimer(room.joinCode);
  const result = endCurrentRound(room);
  if (!result) return;

  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
  io.to(room.joinCode).emit('round:end', {
    roundIndex: room.currentRoundIndex,
    word: result.word,
    drawerPlayerId: result.drawerPlayerId,
    correctGuesses: result.correctGuesses,
    drawerPoints: result.drawerPoints,
    nextRoundInSec: ROUND_END_PAUSE_SEC,
  });

  if (isGameFinished(room)) {
    const timer = setTimeout(() => void finishMatchAndScheduleRestart(io, room), ROUND_END_PAUSE_MS);
    roomTimers.set(room.joinCode, timer);
    return;
  }

  const timer = setTimeout(() => {
    void beginRound(io, room);
  }, ROUND_END_PAUSE_MS);
  roomTimers.set(room.joinCode, timer);
}

/**
 * 整場比賽結束：公布最終名次，停留 ROUND_END_PAUSE_MS 讓大家看一下排名，接著視情況
 * 自動繼續下一步，不需要任何人手動觸發：
 *
 * `game:finished` 的 `nextMatchInSec` 欄位讓前端知道要不要顯示「幾秒後開始新的一場」
 * 的倒數：
 *  - `allowRestart` 為 true（預設）：停留結束後直接開新一場比賽（分數歸零、重新洗牌
 *    決定畫圖順序），先送出預期的倒數秒數，真正重啟時才檢查連線人數是否還夠——中途
 *    人數不夠導致沒有真的重啟，是比較少見的邊界情況，這裡不特別再送第二個事件更正
 *    倒數已經顯示過的畫面。
 *  - `allowRestart` 為 false：呼叫端已經確定不可能立刻重啟（例如呼叫當下連線人數已經
 *    不足 2 人），送 `nextMatchInSec: null`，前端不顯示倒數、改顯示「等待更多玩家」；
 *    停留結束後不是繼續卡在 finished（那樣房間就變成永久死局：沒人能加入、也不會
 *    重啟），而是呼叫 `returnToLobby` 把房間整個重設回「剛建立房間」的等待畫面，
 *    剩下的人可以繼續等其他人加入，房間依然可以被使用。
 */
export async function finishMatchAndScheduleRestart(
  io: Server,
  room: RoomState,
  options: { allowRestart: boolean } = { allowRestart: true }
): Promise<void> {
  finishGame(room);
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));

  if (!options.allowRestart) {
    io.to(room.joinCode).emit('game:finished', { nextMatchInSec: null });

    const backToLobbyTimer = setTimeout(() => {
      returnToLobby(room);
      io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    }, ROUND_END_PAUSE_MS);
    roomTimers.set(room.joinCode, backToLobbyTimer);
    return;
  }

  io.to(room.joinCode).emit('game:finished', { nextMatchInSec: ROUND_END_PAUSE_SEC });

  const restartTimer = setTimeout(() => {
    if (countConnectedPlayers(room) < 2) return;

    resetScoresForNewMatch(room);
    beginGame(room);
    io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    void beginRound(io, room);
  }, ROUND_END_PAUSE_MS);
  roomTimers.set(room.joinCode, restartTimer);
}

export function clearRoundTimerForRoom(joinCode: string): void {
  clearRoomTimer(joinCode);
}
