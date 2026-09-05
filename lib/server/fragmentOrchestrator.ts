import type { Server } from 'socket.io';
import type { RoomState } from './roomManager';
import {
  beginFragmentGame,
  submitFragmentDrawing1,
  submitFragmentDrawing2,
  maybeStartFragmentGuessPhase,
  submitFragmentGuess,
  advanceFragmentGuessTeam,
  autoSubmitFragmentDrawing,
  voteReadyForNextFragmentRound,
  toRoomSummary,
} from './roomManager';
import { wordRepository } from '../repository/wordRepository';
import {
  FRAGMENT_DRAWING1_TIMEOUT_SEC,
  FRAGMENT_DRAWING2_TIMEOUT_SEC,
  FRAGMENT_GUESS_TIMEOUT_SEC,
} from '../shared/fragmentConstants';

const DRAWING1_TIMEOUT_MS = FRAGMENT_DRAWING1_TIMEOUT_SEC * 1000;
const DRAWING2_TIMEOUT_MS = FRAGMENT_DRAWING2_TIMEOUT_SEC * 1000;
const GUESS_TIMEOUT_MS = FRAGMENT_GUESS_TIMEOUT_SEC * 1000;

/**
 * `${joinCode}:${teamId}` -> 這一組目前排程中的作畫逾時計時器。跟 DRAW_TELEPHONE
 * 「整個房間共用一個計時器」不同——這個模式每一組各自獨立平行推進，同一時間可能
 * 有好幾組分別在畫，各組進度不一樣，必須各自各自的計時器，不能共用一個。
 */
const teamDrawingTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** joinCode -> 猜題階段目前排程中的逾時計時器。猜題階段是「一組一組公布來猜」，
 *  同一時間只有一組正在被猜，這部分可以跟接龍模式一樣一個房間一個計時器就夠。 */
const guessTimers = new Map<string, ReturnType<typeof setTimeout>>();

function teamTimerKey(joinCode: string, teamId: string): string {
  return `${joinCode}:${teamId}`;
}

function clearTeamDrawingTimer(joinCode: string, teamId: string): void {
  const key = teamTimerKey(joinCode, teamId);
  const handle = teamDrawingTimers.get(key);
  if (handle) {
    clearTimeout(handle);
    teamDrawingTimers.delete(key);
  }
}

function clearAllTeamDrawingTimersForRoom(joinCode: string): void {
  const prefix = `${joinCode}:`;
  for (const key of Array.from(teamDrawingTimers.keys())) {
    if (key.startsWith(prefix)) {
      clearTimeout(teamDrawingTimers.get(key)!);
      teamDrawingTimers.delete(key);
    }
  }
}

function clearGuessTimer(joinCode: string): void {
  const handle = guessTimers.get(joinCode);
  if (handle) {
    clearTimeout(handle);
    guessTimers.delete(joinCode);
  }
}

/** 房間整個結束、或要重新開始一場新的（returnToLobby 之後）時呼叫，清掉這個
 *  房間所有還在排程中的計時器（各組的作畫逾時＋猜題逾時），避免計時器繼續
 *  留著、之後意外觸發已經不存在的房間/組別狀態。 */
export function clearFragmentTimersForRoom(joinCode: string): void {
  clearAllTeamDrawingTimersForRoom(joinCode);
  clearGuessTimer(joinCode);
}

/**
 * 私訊通知某一組的起手該開始畫了，並排程這一組的作畫逾時計時器。
 * 匯出這個函式的原因跟 DRAW_TELEPHONE 的 sendYourTurn 一致：重新整理頁面
 * 重連時，如果剛好還輪到這個人，需要重新呼叫補送一次（畫布內容跟題目只透過
 * 私訊傳送，不會放進公開的 room:state，見 socketHandlers/room.ts 的 room:join）。
 */
export function sendFragmentDrawing1Turn(io: Server, room: RoomState, teamId: string): void {
  const f = room.fragment;
  const team = f?.teams.find((t) => t.id === teamId);
  if (!f || !team || team.subPhase !== 'drawing1') return;

  const player = room.players.get(team.playerIds[0]);
  if (!player?.socketId) return;

  io.to(player.socketId).emit('fragment:yourTurn', {
    teamId: team.id,
    subPhase: 'drawing1',
    word: team.word,
    splitOrientation: team.splitOrientation,
  });

  clearTeamDrawingTimer(room.joinCode, teamId);
  const timer = setTimeout(() => {
    handleFragmentDrawing1Timeout(io, room, teamId);
  }, DRAWING1_TIMEOUT_MS);
  teamDrawingTimers.set(teamTimerKey(room.joinCode, teamId), timer);
}

/** 理由同 sendFragmentDrawing1Turn，這是補全那一位的版本；同時額外私訊通知
 *  起手（隊友）補全階段開始了，讓他的畫面能顯示一樣的切割線跟保留下來的內容，
 *  即時旁觀補全過程（見模組開頭「此時第一位看的到繪畫過程」的需求）——實際
 *  筆畫內容透過正常的 stroke:start／points／end 廣播過來（見
 *  socketHandlers/stroke.ts 的 getBroadcastTarget），這裡只負責讓起手的畫面
 *  知道現在該顯示切割線跟哪一半是保留下來的內容。 */
export function sendFragmentDrawing2Turn(io: Server, room: RoomState, teamId: string): void {
  const f = room.fragment;
  const team = f?.teams.find((t) => t.id === teamId);
  if (!f || !team || team.subPhase !== 'drawing2' || team.keptHalf === null) return;

  const player = room.players.get(team.playerIds[1]);
  if (!player?.socketId) return;

  io.to(player.socketId).emit('fragment:yourTurn', {
    teamId: team.id,
    subPhase: 'drawing2',
    word: team.word,
    splitOrientation: team.splitOrientation,
    keptHalf: team.keptHalf,
    keptStrokes: team.keptStrokes,
  });

  const teammate = room.players.get(team.playerIds[0]);
  if (teammate?.socketId) {
    io.to(teammate.socketId).emit('fragment:teammateDrawing', {
      teamId: team.id,
      splitOrientation: team.splitOrientation,
      keptHalf: team.keptHalf,
      keptStrokes: team.keptStrokes,
    });
  }

  clearTeamDrawingTimer(room.joinCode, teamId);
  const timer = setTimeout(() => {
    handleFragmentDrawing2Timeout(io, room, teamId);
  }, DRAWING2_TIMEOUT_MS);
  teamDrawingTimers.set(teamTimerKey(room.joinCode, teamId), timer);
}

/**
 * 一組交出畫作（不管是主動送出還是逾時代打、或有人斷線被移除觸發的連鎖代打）
 * 之後的共同收尾：廣播最新房間狀態，如果這一組進到補全階段就私訊通知補全者，
 * 如果全部組別都到齊 'done' 了就正式開始猜題階段。
 *
 * 匯出這個函式的原因：斷線移除（見 socketHandlers/room.ts 的 performRemoval）
 * 呼叫 roomManager.handleFragmentPlayerRemoval 完成狀態變更之後，需要接著做
 * 一樣的廣播/通知收尾，不需要重新寫一次一樣的邏輯。
 */
export function afterFragmentDrawingSubmit(
  io: Server,
  room: RoomState,
  teamId: string,
  allTeamsDone: boolean
): void {
  clearTeamDrawingTimer(room.joinCode, teamId);
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));

  const f = room.fragment;
  const team = f?.teams.find((t) => t.id === teamId);
  if (team?.subPhase === 'drawing2') {
    sendFragmentDrawing2Turn(io, room, teamId);
  }

  if (allTeamsDone) {
    maybeStartFragmentGuessPhase(room);
    io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    sendFragmentGuessPhase(io, room);
  }
}

function handleFragmentDrawing1Timeout(io: Server, room: RoomState, teamId: string): void {
  const result = autoSubmitFragmentDrawing(room, teamId);
  if (!result) return;
  const f = room.fragment;
  const allTeamsDone = f !== null && f.teams.every((t) => t.subPhase === 'done');
  afterFragmentDrawingSubmit(io, room, teamId, allTeamsDone);
}

function handleFragmentDrawing2Timeout(io: Server, room: RoomState, teamId: string): void {
  const result = autoSubmitFragmentDrawing(room, teamId);
  if (!result) return;
  const f = room.fragment;
  const allTeamsDone = f !== null && f.teams.every((t) => t.subPhase === 'done');
  afterFragmentDrawingSubmit(io, room, teamId, allTeamsDone);
}

/**
 * 猜題階段：把目前輪到公布的那一組作品廣播給「所有不是這組成員」的人，附上
 * 完整的作品內容（保留下來的那一半＋補全的那一半，組成完整圖），讓大家看圖
 * 猜題目；自己組的兩位成員收到的是另一個事件（fragment:ownTeamRevealed），
 * 純粹通知「輪到你們這組被猜了」，不需要猜測輸入框（見型別設計，這裡不重複
 * 說明廣播內容本身的差異，兩邊看到的畫面內容是一樣的，只是互動元件不同，
 * 交給前端依自己是不是這組成員決定要不要顯示猜測輸入框）。
 */
export function sendFragmentGuessPhase(io: Server, room: RoomState): void {
  const f = room.fragment;
  if (!f || f.activeGuessTeamIndex < 0 || f.activeGuessTeamIndex >= f.teams.length) return;
  const team = f.teams[f.activeGuessTeamIndex];

  const payload = {
    teamId: team.id,
    word: team.word,
    splitOrientation: team.splitOrientation,
    keptHalf: team.keptHalf ?? ('a' as const),
    keptStrokes: team.keptStrokes,
    completedStrokes: team.secondDrawerStrokes,
    isOwnTeam: false,
  };

  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit('fragment:guessPhase', {
      ...payload,
      isOwnTeam: team.playerIds.includes(player.id),
    });
  }

  clearGuessTimer(room.joinCode);
  const timer = setTimeout(() => {
    handleFragmentGuessTimeout(io, room);
  }, GUESS_TIMEOUT_MS);
  guessTimers.set(room.joinCode, timer);
}

/** 猜題逾時：不需要代猜（猜了算、沒猜就沒有），直接推進到下一組 */
function handleFragmentGuessTimeout(io: Server, room: RoomState): void {
  afterFragmentGuessAdvance(io, room);
}

function afterFragmentGuessAdvance(io: Server, room: RoomState): void {
  clearGuessTimer(room.joinCode);
  const result = advanceFragmentGuessTeam(room);
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));

  if (result.done) {
    const f = room.fragment;
    if (!f) return;
    io.to(room.joinCode).emit('fragment:reveal', {
      teams: f.teams.map((t) => ({
        teamId: t.id,
        word: t.word,
        memberIds: t.playerIds,
        memberNames: t.playerIds.map((id) => room.players.get(id)?.displayName ?? '離線玩家') as [
          string,
          string,
        ],
        splitOrientation: t.splitOrientation,
        keptHalf: t.keptHalf ?? 'a',
        keptStrokes: t.keptStrokes,
        completedStrokes: t.secondDrawerStrokes,
        guesses: Array.from(t.guesses.entries()).map(([guesserId, g]) => ({
          guesserId,
          guesserDisplayName: g.displayName,
          text: g.text,
        })),
      })),
    });
    room.status = 'finished';
    io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    // 這個模式跟接龍模式一樣不做「自動開新一場」，公布完就停在 finished 畫面，
    // 要不要再玩一輪由投票決定（見 handleFragmentVoteReady）。
    io.to(room.joinCode).emit('game:finished', { nextMatchInSec: null });
    return;
  }

  sendFragmentGuessPhase(io, room);
}

/**
 * 開始一場 FRAGMENT_DRAW：驗證人數、隨機配對、抽題，狀態轉為 playing，並私訊
 * 通知每一組的起手開始畫（每組各自獨立，不用等其他組，所以是一次通知所有組
 * 的起手，不是像接龍模式那樣只通知一個人）。
 */
export async function beginFragmentRound(io: Server, room: RoomState): Promise<void> {
  clearFragmentTimersForRoom(room.joinCode);

  const words = await wordRepository.getByFilter(
    room.settings.categoryFilter,
    room.settings.difficultyFilter
  );
  const result = beginFragmentGame(room, words);

  if (!result) {
    room.status = 'lobby';
    io.to(room.joinCode).emit('room:state', toRoomSummary(room));
    io.to(room.joinCode).emit('room:error', {
      message: '目前題庫是空的，或連線人數不符合條件（需要至少 4 人、且為偶數），暫時無法開始',
    });
    return;
  }

  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
  for (const { teamId } of result.teams) {
    sendFragmentDrawing1Turn(io, room, teamId);
  }
}

export function handleFragmentSubmitDrawing1(io: Server, room: RoomState, playerId: string): void {
  const result = submitFragmentDrawing1(room, playerId);
  if (!result) return;
  const f = room.fragment;
  const allTeamsDone = f !== null && f.teams.every((t) => t.subPhase === 'done');
  afterFragmentDrawingSubmit(io, room, result.teamId, allTeamsDone);
}

export function handleFragmentSubmitDrawing2(io: Server, room: RoomState, playerId: string): void {
  const result = submitFragmentDrawing2(room, playerId);
  if (!result) return;
  afterFragmentDrawingSubmit(io, room, result.teamId, result.allTeamsDone);
}

export function handleFragmentSubmitGuess(io: Server, room: RoomState, playerId: string, text: string): void {
  const result = submitFragmentGuess(room, playerId, text);
  if (!result) return;
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
  if (result.allGuessed) {
    afterFragmentGuessAdvance(io, room);
  }
}

/** 理由跟 DRAW_TELEPHONE 的 handleTelephoneVoteReady 完全一致，見那邊的說明 */
export function handleFragmentVoteReady(io: Server, room: RoomState, playerId: string): void {
  const result = voteReadyForNextFragmentRound(room, playerId);
  if (!result) return;
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
}

/**
 * 有玩家斷線被硬移除、且他所屬的 FRAGMENT_DRAW 組別受到影響時呼叫。狀態變更
 * （代打交卷、連鎖完成）已經在 roomManager.handleFragmentPlayerRemoval 裡做完
 * 了，這裡只需要做「跟正常交卷一樣的廣播/通知收尾」——理由跟 DRAW_TELEPHONE
 * 的 forceAdvanceTelephoneOnRemoval 一致，只是這個模式的狀態變更邏輯比較
 * 複雜（見 handleFragmentPlayerRemoval 的說明），拆到 roomManager.ts 那邊做，
 * 這裡單純重用 afterFragmentDrawingSubmit 做收尾，不用重複寫一次。
 */
export function forceAdvanceFragmentOnRemoval(io: Server, room: RoomState, teamId: string): void {
  const f = room.fragment;
  const team = f?.teams.find((t) => t.id === teamId);
  if (!f || !team) return;

  const allTeamsDone = f.teams.every((t) => t.subPhase === 'done');
  afterFragmentDrawingSubmit(io, room, teamId, allTeamsDone);
}
