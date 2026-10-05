import type { Server } from 'socket.io';
import type { RoomState } from './roomManager';
import {
  beginFragmentGame,
  submitFragmentDrawing1,
  submitFragmentDrawing2,
  maybeStartFragmentGuessPhase,
  submitFragmentGuess,
  finishFragmentGuessingIfAllDone,
  autoSubmitFragmentDrawing,
  autoSubmitFragmentGuessForPlayer,
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
/**
 * `${joinCode}:${playerId}` -> 這位玩家目前排程中的猜題逾時計時器。猜題階段
 * 改成每個人各自依自己的節奏往下猜（使用者明確要求「不用再等待該題所有人都
 * 猜完才再猜下一題」），同一時間可能有好幾位玩家分別在猜不同組別，各自進度
 * 不一樣，必須各自各自的計時器，不能像舊版那樣整個房間共用一個。
 */
const playerGuessTimers = new Map<string, ReturnType<typeof setTimeout>>();

function teamTimerKey(joinCode: string, teamId: string): string {
  return `${joinCode}:${teamId}`;
}

function playerTimerKey(joinCode: string, playerId: string): string {
  return `${joinCode}:${playerId}`;
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

function clearPlayerGuessTimer(joinCode: string, playerId: string): void {
  const key = playerTimerKey(joinCode, playerId);
  const handle = playerGuessTimers.get(key);
  if (handle) {
    clearTimeout(handle);
    playerGuessTimers.delete(key);
  }
}

function clearAllPlayerGuessTimersForRoom(joinCode: string): void {
  const prefix = `${joinCode}:`;
  for (const key of Array.from(playerGuessTimers.keys())) {
    if (key.startsWith(prefix)) {
      clearTimeout(playerGuessTimers.get(key)!);
      playerGuessTimers.delete(key);
    }
  }
}

/** 房間整個結束、或要重新開始一場新的（returnToLobby 之後）時呼叫，清掉這個
 *  房間所有還在排程中的計時器（各組的作畫逾時＋每位玩家各自的猜題逾時），
 *  避免計時器繼續留著、之後意外觸發已經不存在的房間/組別/玩家狀態。 */
export function clearFragmentTimersForRoom(joinCode: string): void {
  clearAllTeamDrawingTimersForRoom(joinCode);
  clearAllPlayerGuessTimersForRoom(joinCode);
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
    sendFragmentGuessPhaseToAllEligiblePlayers(io, room);
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
 * 猜題階段開始（所有組別都畫完的那一刻）：依序檢查房間裡每一位連線中的
 * 玩家，各自私訊通知他「現在該猜哪一組」——不是廣播同一組給全房間，每個人
 * 該猜的第一組可能不一樣（取決於他自己屬於哪一組，見 roomManager.ts 的
 * findNextTeamToGuessForPlayer）。自己組的兩位成員因為沒有「不是自己組」的
 * 對象可猜（只有兩組、四人的情況下，另一組剛好就是彼此要猜的對象；超過兩組
 * 時，自己組的兩位成員一樣要依序猜過其他所有組），這裡統一交給
 * sendFragmentGuessTurnToPlayer 判斷每個人各自有沒有東西可猜，不用另外
 * 特例處理「自己組」這件事。
 */
function sendFragmentGuessPhaseToAllEligiblePlayers(io: Server, room: RoomState): void {
  for (const player of room.players.values()) {
    if (!player.connected) continue;
    sendFragmentGuessTurnToPlayer(io, room, player.id);
  }
}

/**
 * 私訊通知某一位玩家「他現在該猜哪一組」，並排程只屬於他自己的猜題逾時
 * 計時器。如果這個人已經沒有下一組要猜了（find 不到），就不送任何事件、
 * 也不排計時器——前端會依「有沒有收到新的 fragment:guessPhase」＋
 * room:state 裡的 guessingStarted／playersStillGuessingCount 自行判斷要
 * 顯示「等待其他人猜完」的畫面。
 */
function sendFragmentGuessTurnToPlayer(io: Server, room: RoomState, playerId: string): void {
  const f = room.fragment;
  if (!f || !f.guessingStarted || f.revealed) return;

  const team = f.teams.find(
    (t) => !t.playerIds.includes(playerId) && !t.guesses.has(playerId)
  );
  const player = room.players.get(playerId);
  if (!team || !player?.socketId) {
    clearPlayerGuessTimer(room.joinCode, playerId);
    return;
  }

  io.to(player.socketId).emit('fragment:guessPhase', {
    teamId: team.id,
    word: team.word,
    splitOrientation: team.splitOrientation,
    keptHalf: team.keptHalf ?? 'a',
    keptStrokes: team.keptStrokes,
    completedStrokes: team.secondDrawerStrokes,
  });

  clearPlayerGuessTimer(room.joinCode, playerId);
  const timer = setTimeout(() => {
    handleFragmentGuessTimeoutForPlayer(io, room, playerId);
  }, GUESS_TIMEOUT_MS);
  playerGuessTimers.set(playerTimerKey(room.joinCode, playerId), timer);
}

/** 某位玩家「目前正在猜的那一組」逾時：不需要代猜出正確答案，直接自動送出
 *  空白猜測（「（沒有人猜）」），推進到他自己的下一組——不這樣做的話，只要
 *  有一個人不猜，整個房間就會永遠卡在猜題階段進不了公布。 */
function handleFragmentGuessTimeoutForPlayer(io: Server, room: RoomState, playerId: string): void {
  const result = autoSubmitFragmentGuessForPlayer(room, playerId);
  if (!result) return;
  afterFragmentGuessSubmit(io, room, playerId, result);
}

/**
 * 某位玩家送出一次猜測（不管是主動送出還是逾時代打）之後的共同收尾：如果他
 * 還有下一組要猜，私訊通知他下一組是什麼；如果這一票剛好讓所有連線中的
 * 玩家都猜完了，正式進入公布階段，廣播完整的公布內容給全房間。
 *
 * 匯出這個函式的原因跟 afterFragmentDrawingSubmit 一致：斷線移除（見
 * socketHandlers/room.ts 的 performRemoval）如果因為某人猜題階段離開、
 * 讓剩下的人剛好全部都猜完了，也需要走這套收尾邏輯正式觸發公布，不需要
 * 另外重寫一次。
 */
export function afterFragmentGuessSubmit(
  io: Server,
  room: RoomState,
  playerId: string,
  result: { teamId: string; hasNextTeam: boolean; allPlayersDone: boolean }
): void {
  clearPlayerGuessTimer(room.joinCode, playerId);

  if (result.allPlayersDone) {
    const triggered = finishFragmentGuessingIfAllDone(room);
    if (triggered) {
      clearAllPlayerGuessTimersForRoom(room.joinCode);
      const f = room.fragment;
      if (f) {
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
      }
      io.to(room.joinCode).emit('room:state', toRoomSummary(room));
      // 這個模式跟接龍模式一樣不做「自動開新一場」，公布完就停在 finished
      // 畫面，要不要再玩一輪由投票決定（見 handleFragmentVoteReady）。
      io.to(room.joinCode).emit('game:finished', { nextMatchInSec: null });
      return;
    }
  }

  if (result.hasNextTeam) {
    sendFragmentGuessTurnToPlayer(io, room, playerId);
  }
  io.to(room.joinCode).emit('room:state', toRoomSummary(room));
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
  afterFragmentGuessSubmit(io, room, playerId, result);
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

/**
 * 猜題階段有玩家斷線被硬移除時呼叫：清掉他的猜題逾時計時器（人都不在了，
 * 沒有東西可以逾時），並重新檢查是不是剩下的人全部都已經猜完——這個檢查
 * 理由跟 DRAW_TELEPHONE 的 checkTelephoneVotesAndMaybeReturn 一致，見
 * roomManager.finishFragmentGuessingIfAllDone 的說明：不重新檢查的話，可能
 * 發生「還差最後一人的猜測，那個人自己先斷線被移除，其他人早就都猜完了，
 * 卻永遠不會觸發公布」這種房間卡住的邊界情況。
 */
export function checkFragmentGuessingAfterRemoval(io: Server, room: RoomState, removedPlayerId: string): void {
  clearPlayerGuessTimer(room.joinCode, removedPlayerId);
  const f = room.fragment;
  if (!f || !f.guessingStarted || f.revealed) return;

  const triggered = finishFragmentGuessingIfAllDone(room);
  if (!triggered) return;

  clearAllPlayerGuessTimersForRoom(room.joinCode);
  io.to(room.joinCode).emit('fragment:reveal', {
    teams: f.teams.map((t) => ({
      teamId: t.id,
      word: t.word,
      memberIds: t.playerIds,
      memberNames: t.playerIds.map((id) => room.players.get(id)?.displayName ?? '離線玩家') as [string, string],
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
  io.to(room.joinCode).emit('game:finished', { nextMatchInSec: null });
}
