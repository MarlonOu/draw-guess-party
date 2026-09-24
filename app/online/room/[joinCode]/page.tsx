'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRoomSocket } from '../../../../lib/realtime/useRoomSocket';
import { DrawingCanvas, type DrawingCanvasHandle } from '../../../../components/canvas/DrawingCanvas';
import { Toolbar } from '../../../../components/canvas/Toolbar';
import { PlayerList } from '../../../../components/room/PlayerList';
import { GuessChatBox } from '../../../../components/room/GuessChatBox';
import { RoundTimer } from '../../../../components/room/RoundTimer';
import { BackButton } from '../../../../components/nav/BackButton';
import { CopyButton } from '../../../../components/room/CopyButton';
import { QrCodeButton } from '../../../../components/room/QrCodeButton';
import { StatusOverlay } from '../../../../components/room/StatusOverlay';
import { StatusIcon } from '../../../../components/room/StatusIcon';
import { RoomSettingsPanel } from '../../../../components/room/RoomSettingsPanel';
import { SoundToggleButton } from '../../../../components/room/SoundToggleButton';
import { TelephoneRoomView } from '../../../../components/room/TelephoneRoomView';
import { FragmentRoomView } from '../../../../components/room/FragmentRoomView';

interface StoredIdentity {
  displayName: string;
  playerId?: string;
}

const PODIUM_COLORS = ['var(--amber)', 'var(--blue)', 'var(--accent)'];
const PODIUM_HEIGHTS = [110, 82, 60];
const PODIUM_DISPLAY_ORDER = [1, 0, 2]; // 版面順序：2名在左、1名在中、3名在右

export default function RoomPage({ params }: { params: Promise<{ joinCode: string }> }) {
  const { joinCode } = use(params);
  const {
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
    updateSettings,
    cancelAutoRestart,
    telephoneYourTurn,
    telephoneReveal,
    submitTelephoneGuess,
    submitTelephoneDrawing,
    voteReadyForNextRound,
    fragmentYourTurn,
    fragmentTeammateDrawing,
    fragmentGuessPhase,
    fragmentReveal,
    setFragmentOrientation,
    submitFragmentDrawing1,
    submitFragmentDrawing2,
    submitFragmentGuess,
    voteReadyForNextFragmentRound,
    joinFragmentTeam,
  } = useRoomSocket();

  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/word-categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  const [color, setColor] = useState('#1A1A2E');
  const [width, setWidth] = useState(6);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const canvasHandleRef = useRef<DrawingCanvasHandle>(null);

  const [timeLeftSec, setTimeLeftSec] = useState<number | null>(null);
  const [selectionCountdown, setSelectionCountdown] = useState<number | null>(null);
  const [revealCountdown, setRevealCountdown] = useState<number | null>(null);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const [pageUrl, setPageUrl] = useState('');

  // 這個房間在 sessionStorage 裡是否已經有身分（暱稱／曾經拿到的 playerId）。
  // 三種狀態：undefined（還沒檢查，SSR 階段本來就讀不到 sessionStorage）、
  // null（檢查過，確定沒有——例如直接貼網址開啟、沒經過 /online 頁面輸入暱稱）、
  // 或實際的身分物件。
  const [identity, setIdentity] = useState<StoredIdentity | null | undefined>(undefined);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem(`draw-guess-party:${joinCode}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 讀取 sessionStorage，只能在掛載後的 client 端執行
    setIdentity(raw ? JSON.parse(raw) : null);
  }, [joinCode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 讀取 window.location，只能在掛載後的 client 端執行，非衍生渲染狀態
    setPageUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!connected || !identity) return;
    joinRoom(joinCode, identity.displayName, identity.playerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, identity, joinCode]);

  useEffect(() => {
    if (!myPlayerId || !identity || identity.playerId === myPlayerId) return;
    const updated: StoredIdentity = { ...identity, playerId: myPlayerId };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 依伺服器回傳的 myPlayerId 同步本地身分狀態，非衍生渲染狀態
    setIdentity(updated);
    sessionStorage.setItem(`draw-guess-party:${joinCode}`, JSON.stringify(updated));
  }, [myPlayerId, identity, joinCode]);

  // 每次新的一輪開始（roundStartInfo 換成新物件），畫布本地畫面要清空——
  // 伺服器那邊的筆畫資料本來就已經清空了（startNextRound），這裡只是同步「畫面看起來也是空的」，
  // 用 resetLocal（不發送任何 socket 事件）而不是 clear（會廣播 canvas:clear 給其他人），
  // 避免每次換人畫都莫名其妙多一次「清空畫布」的事件。
  useEffect(() => {
    if (roundStartInfo) {
      canvasHandleRef.current?.resetLocal();
    }
  }, [roundStartInfo]);

  // 倒數橫條：不是 round:start 一送出就開始，而是等 room.wordChosen 從 false 變 true
  // （選題完成，不管是畫圖者主動選、還是選題逾時自動保底選）才開始從限時秒數倒數。
  // 選題階段跟作畫階段是分開計時的兩段時間，橫條只代表作畫階段那一段。
  // 前端本地倒數、不逐秒跟伺服器對時，跟伺服器實際逾時的時間點會有些微誤差，
  // 一般網路延遲下感覺不出來。
  useEffect(() => {
    if (!room?.wordChosen || !roundStartInfo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件（新一輪開始/結束）同步本地倒數狀態，非衍生渲染狀態
      setTimeLeftSec(null);
      return;
    }
    setTimeLeftSec(roundStartInfo.roundDurationSec);
    const interval = setInterval(() => {
      setTimeLeftSec((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.wordChosen, roundStartInfo]);

  // 選題倒數：畫圖者看到候選題目那一刻開始算，固定 5 秒（跟伺服器的 SELECTION_TIMEOUT_MS
  // 一致），純粹是給畫圖者一個視覺提示，實際逾時判定以伺服器為準
  useEffect(() => {
    if (wordOptions.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件同步本地倒數狀態，非衍生渲染狀態
      setSelectionCountdown(null);
      return;
    }
    setSelectionCountdown(5);
    const interval = setInterval(() => {
      setSelectionCountdown((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [wordOptions]);

  // 公布答案倒數：跟伺服器排程的「停留幾秒後自動下一輪」保持同步的估計值
  useEffect(() => {
    if (!roundEndInfo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件（新一輪開始/結束）同步本地倒數狀態，非衍生渲染狀態
      setRevealCountdown(null);
      return;
    }
    setRevealCountdown(roundEndInfo.nextRoundInSec);
    const interval = setInterval(() => {
      setRevealCountdown((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [roundEndInfo]);

  // 整場比賽結束後，自動重啟新一場的倒數；nextMatchInSec 為 null 代表伺服器不會自動
  // 重啟（例如連線人數不足），這時不顯示倒數，改由下面的疊層顯示對應文字。
  useEffect(() => {
    if (nextMatchInSec === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件同步本地倒數狀態，非衍生渲染狀態
      setRestartCountdown(null);
      return;
    }
    setRestartCountdown(nextMatchInSec);
    const interval = setInterval(() => {
      setRestartCountdown((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextMatchInSec]);

  if (error) {
    return (
      <main className="dg-page" style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
        <div style={{ marginBottom: 16, textAlign: 'left' }}>
          <BackButton href="/online" label="線上模式" />
        </div>
        <div
          className="dg-card"
          style={{
            padding: 24,
            background: 'var(--red-soft)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <StatusIcon kind="alert" color="var(--red)" size={56} />
          <p style={{ fontWeight: 800 }}>{error}</p>
        </div>
      </main>
    );
  }

  // 這個房間在本機沒有已知身分：通常是有人直接貼網址開啟這個連結，沒有先經過
  // /online 頁面輸入暱稱。不能就這樣停在「連線中」——那個畫面只在等一個永遠不會
  // 送出的 room:join 請求，跳出這個表單讓使用者當場輸入暱稱後才加入房間。
  if (identity === null) {
    return (
      <main className="dg-page" style={{ maxWidth: 420, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <BackButton href="/online" label="線上模式" />
        </div>
        <p className="dg-eyebrow" style={{ marginBottom: 8 }}>
          加入房間
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 20 }}>
          房間代碼 {joinCode}
        </h1>
        <div className="dg-card" style={{ padding: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            你的暱稱
          </label>
          <input
            className="dg-input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              const name = nameInput.trim();
              if (!name) return;
              const newIdentity: StoredIdentity = { displayName: name };
              sessionStorage.setItem(`draw-guess-party:${joinCode}`, JSON.stringify(newIdentity));
              setIdentity(newIdentity);
            }}
            placeholder="例如：阿翔"
            style={{ marginBottom: 16 }}
          />
          <button
            type="button"
            onClick={() => {
              const name = nameInput.trim();
              if (!name) return;
              const newIdentity: StoredIdentity = { displayName: name };
              sessionStorage.setItem(`draw-guess-party:${joinCode}`, JSON.stringify(newIdentity));
              setIdentity(newIdentity);
            }}
            className="dg-btn dg-btn-primary dg-btn-block"
            style={{ padding: '12px 16px' }}
          >
            加入房間
          </button>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="dg-page" style={{ maxWidth: 480, margin: '0 auto', padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-soft)' }}>連線中…</p>
      </main>
    );
  }

  if (room.settings.mode === 'DRAW_TELEPHONE') {
    return (
      <TelephoneRoomView
        room={room}
        myPlayerId={myPlayerId}
        yourTurn={telephoneYourTurn}
        reveal={telephoneReveal}
        leaveRoom={leaveRoom}
        startGame={startGame}
        updateSettings={updateSettings}
        voteReadyForNextRound={voteReadyForNextRound}
        submitGuess={submitTelephoneGuess}
        submitDrawing={submitTelephoneDrawing}
      />
    );
  }

  if (room.settings.mode === 'FRAGMENT_DRAW') {
    return (
      <FragmentRoomView
        room={room}
        myPlayerId={myPlayerId}
        yourTurn={fragmentYourTurn}
        teammateDrawing={fragmentTeammateDrawing}
        guessPhase={fragmentGuessPhase}
        reveal={fragmentReveal}
        leaveRoom={leaveRoom}
        startGame={startGame}
        updateSettings={updateSettings}
        voteReadyForNextRound={voteReadyForNextFragmentRound}
        setOrientation={setFragmentOrientation}
        submitDrawing1={submitFragmentDrawing1}
        submitDrawing2={submitFragmentDrawing2}
        submitGuess={submitFragmentGuess}
        joinTeam={joinFragmentTeam}
      />
    );
  }

  const isDrawer = myPlayerId !== null && myPlayerId === room.drawerPlayerId;
  const isHost = myPlayerId !== null && myPlayerId === room.hostPlayerId;
  const connectedPlayerCount = room.players.filter((p) => p.connected).length;
  const drawerName = room.players.find((p) => p.id === room.drawerPlayerId)?.displayName;

  const isChoosingWord = isDrawer && wordOptions.length > 0;
  const isWaitingForOthersToChoose =
    !isDrawer && room.status === 'playing' && room.roundPhase === 'drawing' && !room.wordChosen;
  const canDrawNow =
    room.status === 'playing' &&
    room.roundPhase === 'drawing' &&
    isDrawer &&
    wordForDrawer !== null;

  // 前三名頒獎台（依分數排序，同分時維持原本順序）
  const podium = [...room.players].sort((a, b) => b.score - a.score).slice(0, 3);

  type OverlayKind = 'lobby' | 'choosing' | 'waitingForChoice' | 'revealing' | 'finished' | null;
  let overlayKind: OverlayKind = null;
  if (gameFinished) overlayKind = 'finished';
  else if (room.status === 'lobby') overlayKind = 'lobby';
  else if (roundEndInfo) overlayKind = 'revealing';
  else if (isChoosingWord) overlayKind = 'choosing';
  else if (isWaitingForOthersToChoose) overlayKind = 'waitingForChoice';

  const showTimerBar =
    room.status === 'playing' && room.roundPhase === 'drawing' && room.wordChosen && !roundEndInfo;

  return (
    <main className="dg-page" style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <BackButton href="/online" label="線上模式" onBeforeLeave={leaveRoom} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <p className="dg-eyebrow" style={{ margin: 0 }}>房間代碼</p>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.06em', margin: 0 }}>
            {room.joinCode}
          </h1>
        </div>
        {room.status === 'playing' && (
          <>
            <span className="dg-tag">
              第 {room.currentRoundIndex + 1} / {room.roundCount} 輪
            </span>
            {!overlayKind && (
              <span
                className="dg-tag"
                style={{
                  background: isDrawer ? 'var(--accent)' : 'var(--blue-soft)',
                  color: isDrawer ? '#fff' : 'var(--ink)',
                  fontWeight: 700,
                }}
              >
                {isDrawer ? `你正在畫：${wordForDrawer ?? ''}` : `${drawerName ?? '有人'} 正在畫圖`}
              </span>
            )}
            {overlayKind === 'waitingForChoice' && (
              <span className="dg-tag" style={{ background: 'var(--blue-soft)', fontWeight: 700 }}>
                {drawerName ?? '有人'} 正在選題
              </span>
            )}
          </>
        )}
        <div style={{ flex: 1, minWidth: 8 }} />
        <SoundToggleButton />
      </div>

      {/* 計時橫條永遠掛載在畫面上，只用 visibility 切換可見度（不是條件渲染整個元件）。
          這樣它佔用的空間永遠是它「實際」的渲染高度本身，不需要另外用 minHeight 猜一個
          數字去預留空間——猜的數字只要跟實際渲染高度差一點點，出現/消失時就會跳動，
          這個做法從根本上排除了「猜錯」的可能性。 */}
      <div style={{ marginTop: 10, visibility: showTimerBar && timeLeftSec !== null ? 'visible' : 'hidden' }}>
        <RoundTimer
          remainingSec={timeLeftSec ?? 0}
          timeLimitSec={roundStartInfo?.roundDurationSec ?? 1}
        />
      </div>

      <div>
        <div className="dg-canvas-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <Toolbar
            color={color}
            width={width}
            tool={tool}
            onColorChange={setColor}
            onWidthChange={setWidth}
            onToolChange={setTool}
            onUndo={() => canvasHandleRef.current?.undo()}
            onClear={() => canvasHandleRef.current?.clear()}
            disabled={!canDrawNow}
          />

          {overlayKind === 'lobby' ? (
            // lobby 疊層內容量遠比其他狀態多（房間代碼、邀請連結、分類/難度篩選、
            // 開始按鈕），硬塞進畫布 aspect-ratio 容器裡在很多寬度下都會被壓得太扁、
            // 需要捲動才看得完（就算加了 minHeight 下限也還是不夠，設定面板本身
            // 就可能撐到好幾百 px 高）。改成獨立一塊「內容需要多高就多高」的區塊，
            // 不再受畫布尺寸限制——這裡沿用 StatusOverlay 的 standalone 模式，
            // 視覺上維持同樣的圖示+標題+外框樣式，只是不會被硬性裁切。
            <div className="dg-canvas-frame">
              <StatusOverlay standalone icon="clock" iconColor="var(--blue)" title="遊戲尚未開始">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                      房間代碼 <strong style={{ color: 'var(--ink)' }}>{room.joinCode}</strong>
                    </span>
                    <CopyButton value={room.joinCode} label="複製房間代碼" />
                  </div>
                  {pageUrl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: 'var(--ink-soft)',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {pageUrl}
                      </span>
                      <CopyButton value={pageUrl} label="複製邀請連結" />
                      <QrCodeButton value={pageUrl} label="顯示邀請連結的 QR code" />
                    </div>
                  )}
                </div>

                <RoomSettingsPanel
                  settings={room.settings}
                  categories={categories}
                  isHost={isHost}
                  onUpdate={updateSettings}
                />

                {connectedPlayerCount >= 2 ? (
                  <button
                    type="button"
                    onClick={startGame}
                    className="dg-btn dg-btn-primary"
                    style={{ padding: '12px 24px', fontSize: 16 }}
                  >
                    開始遊戲
                  </button>
                ) : (
                  <p style={{ color: 'var(--ink-soft)' }}>至少需要 2 人才能開始，等其他人加入</p>
                )}
              </StatusOverlay>
            </div>
          ) : (
          <div
            className="dg-canvas-frame dg-canvas-box"
            style={{
              position: 'relative',
              // 高度不再用 aspect-ratio 或固定數字決定，改由 .dg-canvas-box 這個
              // CSS class 搭配外層 row 的 alignItems:stretch 動態貼齊工具列的
              // 實際高度（見 globals.css .dg-canvas-row／.dg-canvas-box 的說明）。
              // 手機上改回用 aspect-ratio:1/1 決定高度，也是在 CSS class 裡處理，
              // 不放在這裡的 inline style——inline style 的優先權比 CSS class 高，
              // 之前 aspect-ratio 殘留在這裡曾經跟 CSS 給的固定高度疊加出不可
              // 預期的計算結果，實際導致畫布在某些寬度下直接橫向溢出視窗。
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--ink)',
              boxShadow: 'var(--shadow-md)',
              overflow: 'hidden',
            }}
          >
            <DrawingCanvas
              ref={canvasHandleRef}
              color={color}
              width={width}
              tool={tool}
              disabled={!canDrawNow}
            />


            {overlayKind === 'choosing' && (
              <StatusOverlay icon="pencil" iconColor="var(--accent)" title="選一個題目來畫">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {wordOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => chooseWord(option.id)}
                      className="dg-btn dg-btn-primary"
                      style={{ padding: '14px 22px', fontSize: 17 }}
                    >
                      {option.text}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {selectionCountdown ?? 5} 秒內快選一個，超過會自動幫你選
                </p>
              </StatusOverlay>
            )}

            {overlayKind === 'waitingForChoice' && (
              <StatusOverlay icon="eye" iconColor="var(--blue)" title={`${drawerName ?? '對方'} 正在挑題目`}>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>馬上就要開始畫了，準備搶答吧</p>
              </StatusOverlay>
            )}

            {overlayKind === 'revealing' && roundEndInfo && (
              <StatusOverlay
                icon="megaphone"
                iconColor={roundEndInfo.correctGuesses.length > 0 ? 'var(--green)' : 'var(--ink-soft)'}
                title={`正確答案：${roundEndInfo.word}`}
              >
                {roundEndInfo.correctGuesses.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {roundEndInfo.correctGuesses.map((g) => {
                      const name = room.players.find((p) => p.id === g.playerId)?.displayName;
                      return (
                        <p key={g.playerId} style={{ color: 'var(--green)', fontWeight: 700, fontSize: 14 }}>
                          {name ?? '有人'} 猜中了！+{g.points} 分
                        </p>
                      );
                    })}
                    <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                      {drawerName ?? '畫圖者'} 也跟著 +{roundEndInfo.drawerPoints} 分
                    </p>
                  </div>
                ) : (
                  <p style={{ color: 'var(--ink-soft)' }}>時間到，沒人猜中</p>
                )}
                <p
                  className="dg-tag"
                  style={{ background: 'var(--amber-soft)', fontWeight: 800 }}
                >
                  {revealCountdown ?? roundEndInfo.nextRoundInSec} 秒後繼續
                </p>
              </StatusOverlay>
            )}

            {overlayKind === 'finished' && (
              <StatusOverlay icon="trophy" iconColor="var(--amber)" title="比賽結束！">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                  {PODIUM_DISPLAY_ORDER.map((rankIndex) => {
                    const player = podium[rankIndex];
                    if (!player) return <div key={rankIndex} style={{ width: 76 }} />;
                    return (
                      <div
                        key={player.id}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            maxWidth: 90,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {player.displayName}
                        </span>
                        <div
                          style={{
                            width: 76,
                            height: PODIUM_HEIGHTS[rankIndex],
                            background: PODIUM_COLORS[rankIndex],
                            border: '2px solid var(--ink)',
                            borderRadius: '10px 10px 0 0',
                            boxShadow: 'var(--shadow-sm)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            paddingTop: 10,
                            fontWeight: 900,
                            fontSize: 22,
                            color: '#fff',
                          }}
                        >
                          {rankIndex + 1}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700 }}>
                          {player.score} 分
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>完整排名請見右側玩家清單</p>
                {restartCountdown !== null ? (
                  <>
                    <p className="dg-tag" style={{ background: 'var(--blue-soft)', fontWeight: 800 }}>
                      {restartCountdown} 秒後開始新的一場比賽
                    </p>
                    {isHost && (
                      <button
                        type="button"
                        onClick={cancelAutoRestart}
                        className="dg-btn"
                        style={{ padding: '8px 16px', fontSize: 13 }}
                      >
                        先不要開始，調整設定
                      </button>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>等待更多玩家加入才能開始新的一場</p>
                )}
              </StatusOverlay>
            )}
          </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 220px', minWidth: 200, maxWidth: 300 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
              玩家（{room.players.length}）
            </h2>
            <PlayerList
              players={room.players}
              drawerPlayerId={room.drawerPlayerId}
              nextDrawerPlayerId={room.status === 'playing' ? room.nextDrawerPlayerId : null}
              correctGuesserIds={room.correctGuesserIds}
              hostPlayerId={room.hostPlayerId}
              maxHeight={240}
            />
          </div>

          <div style={{ flex: '3 1 320px', minWidth: 260 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>猜題聊天室</h2>
            <GuessChatBox
              messages={messages}
              onSend={sendMessage}
              disabled={isDrawer && room.status === 'playing' && room.roundPhase === 'drawing'}
              maxHeight={240}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
