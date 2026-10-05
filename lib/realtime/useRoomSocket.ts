'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from './socketClient';
import type { RoomSummary, TelephoneReveal, FragmentReveal, FragmentSplitOrientation, FragmentHalf } from '../types/room';
import type { GuessMessage } from '../types/round';
import type { WordOption } from '../types/events';
import type { Stroke } from '../types/stroke';
import {
  playPlayerJoinSound,
  playPlayerLeaveSound,
  playWordChosenSound,
  playCorrectGuessSound,
  playAllCorrectSound,
  playPartialRoundEndSound,
  playForfeitSound,
} from '../audio/soundEffects';

interface RoundEndInfo {
  roundIndex: number;
  word: string;
  drawerPlayerId: string;
  correctGuesses: { playerId: string; points: number }[];
  drawerPoints: number;
  nextRoundInSec: number;
}

interface RoundStartInfo {
  roundIndex: number;
  roundCount: number;
  roundDurationSec: number;
  drawerPlayerId: string;
}

/** DRAW_TELEPHONE 模式：私訊告知「現在輪到自己該做什麼」 */
type TelephoneYourTurn =
  | { subPhase: 'guessing'; previousStrokes: Stroke[] }
  | { subPhase: 'drawing'; promptText: string };

/** FRAGMENT_DRAW 模式：私訊告知「現在輪到自己該做什麼」，型別跟
 *  lib/types/room.ts 的 FragmentYourTurn 一致，額外帶上 teamId 方便前端
 *  對照目前 room.fragment.teams 裡對應的組別資訊 */
type FragmentYourTurn =
  | { teamId: string; subPhase: 'drawing1'; word: string; splitOrientation: FragmentSplitOrientation }
  | {
      teamId: string;
      subPhase: 'drawing2';
      word: string;
      splitOrientation: FragmentSplitOrientation;
      keptHalf: FragmentHalf;
      keptStrokes: Stroke[];
    };

/** FRAGMENT_DRAW 模式：猜題階段私訊收到的內容——只有「這是你現在該猜的」
 *  這一種情境會收到（見 events.ts 的 fragment:guessPhase 說明，不再有
 *  isOwnTeam 這個判斷欄位，自己組的作品本來就不會出現在自己的猜題序列裡）。 */
interface FragmentGuessPhase {
  teamId: string;
  word: string;
  splitOrientation: FragmentSplitOrientation;
  keptHalf: FragmentHalf;
  keptStrokes: Stroke[];
  completedStrokes: Stroke[];
}

/** FRAGMENT_DRAW 模式：起手在補全階段旁觀時收到的內容，見 events.ts 的
 *  fragment:teammateDrawing 說明 */
interface FragmentTeammateDrawing {
  teamId: string;
  splitOrientation: FragmentSplitOrientation;
  keptHalf: FragmentHalf;
  keptStrokes: Stroke[];
}

export function useRoomSocket() {
  // 初始值直接讀取 socket 目前的實際連線狀態，而不是恆為 false：
  // 若這個分頁在本次 session 中先前已經連過線（例如建過一次房間、又建第二次），
  // 底層 socket 早就處於已連線狀態，'connect' 事件不會再觸發一次，
  // 若初始值恆為 false，這裡的 connected 就永遠等不到變成 true，畫面卡在「連線中」。
  const [connected, setConnected] = useState(() => getSocket().connected);
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<GuessMessage[]>([]);
  /** 只有本人是畫圖者、且尚未選題時才會有值 */
  const [wordOptions, setWordOptions] = useState<WordOption[]>([]);
  /** 只有本人是畫圖者、且已選好題目時才會有值 */
  const [wordForDrawer, setWordForDrawer] = useState<string | null>(null);
  const [roundStartInfo, setRoundStartInfo] = useState<RoundStartInfo | null>(null);
  const [roundEndInfo, setRoundEndInfo] = useState<RoundEndInfo | null>(null);
  const [gameFinished, setGameFinished] = useState(false);
  /** 幾秒後會自動開始新的一場比賽；null 代表不會自動重啟（例如連線人數不足） */
  const [nextMatchInSec, setNextMatchInSec] = useState<number | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  /** DRAW_TELEPHONE 模式：輪到自己時該做什麼；換人接龍或回到大廳時清空 */
  const [telephoneYourTurn, setTelephoneYourTurn] = useState<TelephoneYourTurn | null>(null);
  /** DRAW_TELEPHONE 模式：接龍公布內容，只有 reveal 階段才非 null */
  const [telephoneReveal, setTelephoneReveal] = useState<TelephoneReveal | null>(null);

  /** FRAGMENT_DRAW 模式：輪到自己時該做什麼；換階段或回到大廳時清空 */
  const [fragmentYourTurn, setFragmentYourTurn] = useState<FragmentYourTurn | null>(null);
  /** FRAGMENT_DRAW 模式：猜題階段目前正在公布給大家看的那一組作品內容 */
  const [fragmentGuessPhase, setFragmentGuessPhase] = useState<FragmentGuessPhase | null>(null);
  /** FRAGMENT_DRAW 模式：全部組別公布內容，只有 reveal 階段才非 null */
  const [fragmentReveal, setFragmentReveal] = useState<FragmentReveal | null>(null);
  /** FRAGMENT_DRAW 模式：起手在補全階段旁觀時的參考內容（切割線、保留下來
   *  那一半），不是輪到自己畫，純粹顯示用；換階段或回到大廳時清空 */
  const [fragmentTeammateDrawing, setFragmentTeammateDrawing] = useState<FragmentTeammateDrawing | null>(null);

  /**
   * 用來偵測「跟上一次相比發生了什麼變化」的參照值，不是拿來畫面渲染用的狀態
   * （所以用 ref 不用 state），純粹給音效判斷用：
   *  - previousPlayerIdsRef 為 null 代表「這個分頁還沒收過任何一次 room:state」，
   *    這種情況不比對、不觸發加入/離開音效，避免把首次載入時房間裡本來就有的人
   *    誤判成「剛剛才加入」。
   *  - previousWordChosenRef 用來偵測 wordChosen 從 false 變 true 的那個瞬間
   *    （選題完成），這個轉變本身才是音效觸發點，不是每次 room:state 都響。
   */
  const previousPlayerIdsRef = useRef<Set<string> | null>(null);
  const previousWordChosenRef = useRef(false);
  /** DRAW_TELEPHONE 模式：偵測「輪到誰接龍」的變化，變化時播放交棒音效，
   *  不設「第一次不比對」的門檻——從 null 變成第一位的那個瞬間（比賽剛開始、
   *  第一棒要開始畫了）本身就是想播音效的時機 */
  const previousTelephoneActivePlayerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoomState = (payload: RoomSummary) => {
      const newIds = new Set(payload.players.map((p) => p.id));

      if (previousPlayerIdsRef.current !== null) {
        const prevIds = previousPlayerIdsRef.current;
        const someoneJoined = payload.players.some((p) => !prevIds.has(p.id));
        const someoneLeft = Array.from(prevIds).some((id) => !newIds.has(id));
        if (someoneJoined) playPlayerJoinSound();
        if (someoneLeft) playPlayerLeaveSound();

        if (!previousWordChosenRef.current && payload.wordChosen) {
          playWordChosenSound();
        }
      }
      previousPlayerIdsRef.current = newIds;
      previousWordChosenRef.current = payload.wordChosen;

      // DRAW_TELEPHONE 模式：輪到的人變了（含比賽剛開始、第一棒要開始畫的那一刻）
      // 就播放交棒音效，沿用 DRAW_GUESS「選題完成」那顆音效，語意上都對應
      // 「輪到你了，開始動作」這個瞬間，不需要另外設計新的音效。
      const newActiveTelephonePlayerId = payload.telephone?.activePlayerId ?? null;
      if (
        newActiveTelephonePlayerId !== null &&
        newActiveTelephonePlayerId !== previousTelephoneActivePlayerIdRef.current
      ) {
        playWordChosenSound();
      }
      previousTelephoneActivePlayerIdRef.current = newActiveTelephonePlayerId;

      // DRAW_TELEPHONE 模式：公布結果改成完全從 room:state 派生，不再只依賴一次性的
      // telephone:reveal 事件——原本的做法是房主／玩家如果在公布畫面重新整理頁面，
      // 重連後只會收到 room:state（其中 room.telephone.reveal 本來就有完整內容），
      // 但一次性事件不會補送，導致 telephoneReveal 這個 state 永遠是 null、畫面卡在
      // 一片空白，房間流程也跟著卡死（沒有人能點「返回大廳」，因為那個按鈕的畫面
      // 根本沒渲染出來）。這裡讓它每次都跟著 room:state 同步，不管是不是重新整理過，
      // 永遠反映伺服器目前的真實狀態；回到 lobby（reveal 變 null）也會跟著清空。
      setTelephoneReveal(payload.telephone?.reveal ?? null);

      setRoom(payload);
      // 房間狀態一旦離開 finished（例如自動回到 lobby 等待更多人加入），前端也要
      // 跟著清掉「比賽結束」的畫面狀態，不然疊層會照樣顯示 finished 疊層，因為
      // gameFinished 原本只在下一輪 round:start 時才會重置，但回到 lobby 並不會
      // 觸發任何一輪的開始。
      if (payload.status !== 'finished') {
        setGameFinished(false);
      }
    };
    const onRoomError = (payload: { message: string }) => setError(payload.message);
    const onChatMessage = (payload: GuessMessage) => {
      setMessages((prev) => [...prev, payload]);
      if (payload.isCorrectGuess) {
        playCorrectGuessSound();
      }
    };
    const onRoundStart = (payload: RoundStartInfo & { wordOptions?: WordOption[] }) => {
      setRoundStartInfo(payload);
      setWordOptions(payload.wordOptions ?? []);
      setWordForDrawer(null);
      setRoundEndInfo(null);
      setGameFinished(false);
      setNextMatchInSec(null);
    };
    const onWordChosen = (payload: { word: string }) => {
      setWordForDrawer(payload.word);
      setWordOptions([]);
    };
    const onRoundEnd = (payload: RoundEndInfo) => {
      setRoundEndInfo(payload);
      setWordOptions([]);
      setWordForDrawer(null);

      // 音效判斷：畫圖者不算猜題者，所以應該要猜的人數 = 房間目前人數 - 1（畫圖者本人）。
      // previousPlayerIdsRef 這時候已經是最新的房間名單（room:state 一定比 round:end
      // 先送到，見 roundOrchestrator.ts 的 endRoundAndAdvance），用它的數量做近似判斷。
      const totalGuessers = previousPlayerIdsRef.current
        ? Math.max(0, previousPlayerIdsRef.current.size - 1)
        : 0;
      if (payload.correctGuesses.length === 0) {
        playForfeitSound();
      } else if (totalGuessers > 0 && payload.correctGuesses.length >= totalGuessers) {
        playAllCorrectSound();
      } else {
        playPartialRoundEndSound();
      }
    };
    const onGameFinished = (payload: { nextMatchInSec: number | null }) => {
      setGameFinished(true);
      setNextMatchInSec(payload.nextMatchInSec);
    };
    const onRoomJoined = (payload: { playerId: string }) => setMyPlayerId(payload.playerId);
    const onTelephoneYourTurn = (payload: TelephoneYourTurn) => {
      setTelephoneYourTurn(payload);
    };
    const onTelephoneReveal = (payload: TelephoneReveal) => {
      setTelephoneReveal(payload);
      setTelephoneYourTurn(null);
      // 沿用「全數猜對」那顆慶祝音效，接龍公布整條鏈本來就是這個玩法的高潮時刻，
      // 語意上跟「大家都答對了」的歡慶感一致。
      playAllCorrectSound();
    };
    const onFragmentYourTurn = (payload: FragmentYourTurn) => {
      setFragmentYourTurn(payload);
    };
    const onFragmentGuessPhase = (payload: FragmentGuessPhase) => {
      setFragmentGuessPhase(payload);
      // 進入猜題階段代表這一組（含自己這組，如果剛好輪到）的作畫子階段已經結束，
      // 之前私訊收到的「輪到自己畫」「旁觀隊友」內容不再有意義，清空避免殘留
      // 造成畫面誤判。
      setFragmentYourTurn(null);
      setFragmentTeammateDrawing(null);
    };
    const onFragmentReveal = (payload: FragmentReveal) => {
      setFragmentReveal(payload);
      setFragmentGuessPhase(null);
      // 沿用跟接龍模式一樣的理由：全部組別公布完畢是這個玩法的高潮時刻。
      playAllCorrectSound();
    };
    const onFragmentTeammateDrawing = (payload: FragmentTeammateDrawing) => {
      setFragmentTeammateDrawing(payload);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('room:error', onRoomError);
    socket.on('chat:message', onChatMessage);
    socket.on('round:start', onRoundStart);
    socket.on('round:wordChosen', onWordChosen);
    socket.on('round:end', onRoundEnd);
    socket.on('game:finished', onGameFinished);
    socket.on('room:joined', onRoomJoined);
    socket.on('telephone:yourTurn', onTelephoneYourTurn);
    socket.on('telephone:reveal', onTelephoneReveal);
    socket.on('fragment:yourTurn', onFragmentYourTurn);
    socket.on('fragment:guessPhase', onFragmentGuessPhase);
    socket.on('fragment:reveal', onFragmentReveal);
    socket.on('fragment:teammateDrawing', onFragmentTeammateDrawing);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('room:error', onRoomError);
      socket.off('chat:message', onChatMessage);
      socket.off('round:start', onRoundStart);
      socket.off('round:wordChosen', onWordChosen);
      socket.off('round:end', onRoundEnd);
      socket.off('game:finished', onGameFinished);
      socket.off('room:joined', onRoomJoined);
      socket.off('telephone:yourTurn', onTelephoneYourTurn);
      socket.off('telephone:reveal', onTelephoneReveal);
      socket.off('fragment:yourTurn', onFragmentYourTurn);
      socket.off('fragment:guessPhase', onFragmentGuessPhase);
      socket.off('fragment:reveal', onFragmentReveal);
      socket.off('fragment:teammateDrawing', onFragmentTeammateDrawing);
    };
  }, []);

  const joinRoom = useCallback((joinCode: string, displayName: string, playerId?: string) => {
    getSocket().emit('room:join', { joinCode, displayName, playerId });
  }, []);

  const leaveRoom = useCallback(() => {
    getSocket().emit('room:leave');
    setRoom(null);
    setMessages([]);
    setTelephoneYourTurn(null);
    setTelephoneReveal(null);
    setFragmentYourTurn(null);
    setFragmentGuessPhase(null);
    setFragmentReveal(null);
    setFragmentTeammateDrawing(null);
  }, []);

  const startGame = useCallback(() => {
    getSocket().emit('room:start');
  }, []);

  const sendMessage = useCallback((text: string) => {
    getSocket().emit('chat:message', { text });
  }, []);

  const chooseWord = useCallback((wordId: string) => {
    getSocket().emit('round:chooseWord', { wordId });
  }, []);

  const updateSettings = useCallback(
    (patch: {
      roundDurationSec?: number;
      categoryFilter?: string[];
      difficultyFilter?: string[];
      telephoneFlow?: 'combined' | 'alternating';
    }) => {
      getSocket().emit('room:updateSettings', patch);
    },
    []
  );

  const cancelAutoRestart = useCallback(() => {
    getSocket().emit('room:cancelAutoRestart');
  }, []);

  const submitTelephoneGuess = useCallback((text: string) => {
    getSocket().emit('telephone:submitGuess', { text });
    setTelephoneYourTurn(null);
  }, []);

  const submitTelephoneDrawing = useCallback(() => {
    getSocket().emit('telephone:submitDrawing');
    setTelephoneYourTurn(null);
  }, []);

  const voteReadyForNextRound = useCallback(() => {
    getSocket().emit('telephone:voteReady');
  }, []);

  const setFragmentOrientation = useCallback((orientation: FragmentSplitOrientation) => {
    getSocket().emit('fragment:setOrientation', { orientation });
  }, []);

  const submitFragmentDrawing1 = useCallback(() => {
    getSocket().emit('fragment:submitDrawing1');
    setFragmentYourTurn(null);
  }, []);

  const submitFragmentDrawing2 = useCallback(() => {
    getSocket().emit('fragment:submitDrawing2');
    setFragmentYourTurn(null);
  }, []);

  const submitFragmentGuess = useCallback((text: string) => {
    getSocket().emit('fragment:submitGuess', { text });
  }, []);

  const voteReadyForNextFragmentRound = useCallback(() => {
    getSocket().emit('fragment:voteReady');
  }, []);

  const joinFragmentTeam = useCallback((teamNumber: number) => {
    getSocket().emit('fragment:joinTeam', { teamNumber });
  }, []);

  return {
    connected,
    room,
    error,
    messages,
    wordOptions,
    wordForDrawer,
    roundStartInfo,
    roundEndInfo,
    gameFinished,
    nextMatchInSec,
    myPlayerId,
    telephoneYourTurn,
    telephoneReveal,
    fragmentYourTurn,
    fragmentGuessPhase,
    fragmentReveal,
    fragmentTeammateDrawing,
    joinRoom,
    leaveRoom,
    startGame,
    sendMessage,
    chooseWord,
    updateSettings,
    cancelAutoRestart,
    submitTelephoneGuess,
    submitTelephoneDrawing,
    voteReadyForNextRound,
    setFragmentOrientation,
    submitFragmentDrawing1,
    submitFragmentDrawing2,
    submitFragmentGuess,
    voteReadyForNextFragmentRound,
    joinFragmentTeam,
  };
}
