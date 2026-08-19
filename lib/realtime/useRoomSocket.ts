'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSocket } from './socketClient';
import type { RoomSummary } from '../types/room';
import type { GuessMessage } from '../types/round';
import type { WordOption } from '../types/events';

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

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoomState = (payload: RoomSummary) => {
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
    const onChatMessage = (payload: GuessMessage) =>
      setMessages((prev) => [...prev, payload]);
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
    };
    const onGameFinished = (payload: { nextMatchInSec: number | null }) => {
      setGameFinished(true);
      setNextMatchInSec(payload.nextMatchInSec);
    };
    const onRoomJoined = (payload: { playerId: string }) => setMyPlayerId(payload.playerId);

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
    };
  }, []);

  const joinRoom = useCallback((joinCode: string, displayName: string, playerId?: string) => {
    getSocket().emit('room:join', { joinCode, displayName, playerId });
  }, []);

  const leaveRoom = useCallback(() => {
    getSocket().emit('room:leave');
    setRoom(null);
    setMessages([]);
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
    joinRoom,
    leaveRoom,
    startGame,
    sendMessage,
    chooseWord,
  };
}
