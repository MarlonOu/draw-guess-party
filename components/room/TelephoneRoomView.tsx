'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomSummary, TelephoneReveal } from '../../lib/types/room';
import type { Stroke } from '../../lib/types/stroke';
import { DrawingCanvas, type DrawingCanvasHandle } from '../canvas/DrawingCanvas';
import { Toolbar } from '../canvas/Toolbar';
import { StrokeReplay } from '../canvas/StrokeReplay';
import { PlayerList } from './PlayerList';
import { BackButton } from '../nav/BackButton';
import { CopyButton } from './CopyButton';
import { StatusOverlay } from './StatusOverlay';
import { RoomSettingsPanel } from './RoomSettingsPanel';
import { SoundToggleButton } from './SoundToggleButton';
import { RoundTimer } from './RoundTimer';
import { TELEPHONE_GUESS_TIMEOUT_SEC, TELEPHONE_DRAWING_TIMEOUT_SEC } from '../../lib/shared/telephoneConstants';

type TelephoneYourTurn =
  | { subPhase: 'guessing'; previousStrokes: Stroke[] }
  | { subPhase: 'drawing'; promptText: string };

interface TelephoneRoomViewProps {
  room: RoomSummary;
  myPlayerId: string | null;
  yourTurn: TelephoneYourTurn | null;
  reveal: TelephoneReveal | null;
  leaveRoom: () => void;
  startGame: () => void;
  updateSettings: (patch: {
    roundDurationSec?: number;
    categoryFilter?: string[];
    difficultyFilter?: string[];
  }) => void;
  cancelAutoRestart: () => void;
  submitGuess: (text: string) => void;
  submitDrawing: () => void;
}

const TELEPHONE_MIN_PLAYERS = 3;

/**
 * DRAW_TELEPHONE（畫圖接龍）模式的房間畫面，跟 DRAW_GUESS 的版面完全分開設計，
 * 因為玩法本質不同：沒有計分、沒有同時進行的猜題聊天室，是「一次只有一個人在動作、
 * 其他人完全看不到內容、直到最後才整個攤開」的機制。
 */
export function TelephoneRoomView({
  room,
  myPlayerId,
  yourTurn,
  reveal,
  leaveRoom,
  startGame,
  updateSettings,
  cancelAutoRestart,
  submitGuess,
  submitDrawing,
}: TelephoneRoomViewProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [pageUrl, setPageUrl] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [color, setColor] = useState('#1A1A2E');
  const [width, setWidth] = useState(6);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const canvasHandleRef = useRef<DrawingCanvasHandle>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch('/api/word-categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 讀取 window.location，只能在掛載後的 client 端執行，非衍生渲染狀態
    setPageUrl(window.location.href);
  }, []);

  // 每次輪到新的動作（guessing/drawing 交替），畫布跟猜測輸入框都要清空重來
  useEffect(() => {
    canvasHandleRef.current?.resetLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件（換人接龍）同步本地輸入狀態，非衍生渲染狀態
    setGuessInput('');
  }, [yourTurn]);

  const isHost = myPlayerId !== null && myPlayerId === room.hostPlayerId;
  const connectedPlayerCount = room.players.filter((p) => p.connected).length;
  const t = room.telephone;
  const activePlayerName = t ? room.players.find((p) => p.id === t.activePlayerId)?.displayName : undefined;
  const isMyTurn = t !== null && t.activePlayerId === myPlayerId;
  /** 下一棒接龍的人：接龍順序裡緊接在目前這位之後的人；還沒開始、已經公布、
   *  或目前這位已經是最後一棒時都沒有下一棒，回傳 null */
  const nextChainPlayerId =
    t && !t.reveal && t.currentIndex >= 0 && t.currentIndex + 1 < t.chainOrder.length
      ? t.chainOrder[t.currentIndex + 1]
      : null;

  const isRevealing = room.status === 'finished' && reveal !== null;

  /**
   * 倒數橫條：改成全房間所有人都看得到，不是只有正在動作的那個人自己心裡默默倒數——
   * 用伺服器廣播的 `subPhaseStartedAt`（子階段開始的時間戳）搭配前端已知的固定限時
   * 常數，每個人各自用 `Date.now() - subPhaseStartedAt` 換算經過的時間，全房間的人
   * 用的是同一個時間戳基準，算出來的剩餘秒數自然一致（頂多因為各自裝置的 1 秒
   * tick 相位不同差個 1 秒內，不會像各自獨立倒數那樣長期漂移或不同步）。
   * `now` 這個 state 純粹是每秒觸發一次重新渲染用的，不是拿來累加/遞減的倒數本體。
   */
  useEffect(() => {
    if (!t || t.subPhaseStartedAt === null || t.subPhase === null || isRevealing) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [t, isRevealing]);

  const timeLimitSec =
    t?.subPhase === 'guessing' ? TELEPHONE_GUESS_TIMEOUT_SEC : TELEPHONE_DRAWING_TIMEOUT_SEC;
  const timeLeftSec =
    t && t.subPhaseStartedAt !== null && t.subPhase !== null && !isRevealing
      ? Math.max(0, timeLimitSec - Math.floor((now - t.subPhaseStartedAt) / 1000))
      : null;

  const handleSubmitGuess = () => {
    const text = guessInput.trim();
    if (!text) return;
    submitGuess(text);
  };

  /** 現在是不是真的輪到自己畫（不是「工具列要不要出現」，那個跟 DRAW_GUESS 一樣
   *  永遠出現，只是用 disabled 讓它變灰不能點） */
  const isDrawingSubphase =
    !isRevealing && room.status === 'playing' && isMyTurn && yourTurn?.subPhase === 'drawing';

  return (
    <main
      className="dg-page"
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 24,
        // 只在公布結果畫廊顯示時才需要這個修正：<body> 是 display:flex，讓
        // <main> 變成 flex item；<main> 同時有 margin:'0 auto' 用於超寬螢幕
        // 置中——CSS flexbox 規格裡，flex item 在橫軸方向上只要有
        // margin:auto，align-items:stretch 對這個 item 就完全不會生效，item
        // 會退回「內容多寬就多寬」決定自己的寬度，公布結果畫廊的格線容器
        // （repeat(auto-fill, minmax(260px, 1fr))）因此量到一個遠小於視窗
        // 寬度的容器、算不出多欄。這裡刻意不改全站共用的 .dg-page class
        // （那樣會影響所有頁面，範圍過大），只在 isRevealing 這個特定狀態
        // 才明確給 width:100%，讓 <main> 的橫軸尺寸不再是 auto，不需要依賴
        // 會被 auto margin 停用的 stretch；其餘狀態、其餘頁面完全不受影響。
        ...(isRevealing ? { width: '100%' } : {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <BackButton href="/online" label="線上模式" onBeforeLeave={leaveRoom} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <p className="dg-eyebrow" style={{ margin: 0 }}>房間代碼</p>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.06em', margin: 0 }}>
            {room.joinCode}
          </h1>
        </div>
        <span className="dg-tag">畫圖接龍</span>
        {room.status === 'playing' && t && (
          <span className="dg-tag" style={{ background: 'var(--blue-soft)' }}>
            已完成 {t.completedCount} / {t.totalPlayers} 棒
          </span>
        )}
        <div style={{ flex: 1, minWidth: 8 }} />
        <SoundToggleButton />
      </div>

      {/* 固定掛載、只切換可見度，避免橫條出現/消失造成版面跳動（跟 DRAW_GUESS 同一套做法）。
          不再只給 isMyTurn 的人看——全房間的人現在都能看到目前這一棒的剩餘時間，
          用同一個伺服器時間戳換算，彼此之間是同步的。 */}
      <div style={{ marginTop: 10, visibility: timeLeftSec !== null ? 'visible' : 'hidden' }}>
        <RoundTimer remainingSec={timeLeftSec ?? 0} timeLimitSec={timeLimitSec} />
      </div>

      {/* 玩家列表移到畫布下方，獨立一列，不再跟畫布共用同一個 row。畫布寬度透過
          .dg-canvas-frame 這個共用 class 統一控制（見 globals.css）：非手機尺寸
          用 flex-grow 撐滿工具列之外的剩餘空間、min-width:500px 起跳；手機尺寸
          改成完全流體，跟著視窗寬度縮放。工具列也比照 DRAW_GUESS 的做法——不管
          輪不輪得到自己畫，工具列都一直顯示（只是用 disabled 讓它變灰），不會
          因為「工具列出不出現」讓畫布寬度跟著變動，這是先前兩種模式大小對不上
          的原因。 */}
      {isRevealing ? (
        // 公布階段整個移出 .dg-canvas-row（那個是給「工具列＋畫布」並排設計的
        // flex 容器，工具列在公布階段本來就整個隱藏，讓畫廊繼續當 flex 容器的
        // 子項目沒有意義，還可能因為 flex item 的寬度計算方式跟一般 block 元素
        // 不完全一樣，在某些情境下沒有確實撐滿）。改成完全獨立、在一般文件流
        // 裡的區塊，寬度單純由 width:'100%' 決定，不受任何 flex 相關規則影響，
        // 徹底排除疑慮。
        <div style={{ marginTop: 6, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="dg-card" style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 900 }}>原始題目：{reveal.originalWord}</p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
              maxHeight: '75vh',
              overflowY: 'auto',
              padding: 4,
            }}
          >
            {reveal.entries.map((entry, i) => {
              // 「作畫流程」不另外用一整排編號圓點＋連接線呈現（人多的時候會
              // 換行擠成一團，版面容易亂），改成直接做進每張作品卡片的外框本身：
              // 外框依作畫順序輪流短暫發光，像跑馬燈一樣一張接一張持續繞圈播放
              // （`infinite`，不會播一次就停），不需要額外佔用版面空間。
              // `pulseSegment` 是每張卡片「輪到它發光」佔掉的時間，`pulseDuration`
              // 是繞完所有卡片一圈的總時長，用 CSS 變數 `--pulse-duration` 動態帶進
              // globals.css 的 `.dg-reveal-card`，不管接龍幾人，繞一圈的節奏感都一致。
              //
              // 卡片本身刻意不做「淡入＋位移」的進場動畫——那個效果連續修過兩輪，
              // 還是會在畫面剛出現的瞬間跟外層格線容器（`overflow-y:auto`）的捲動
              // 區域計算打架，短暫出現空白＋捲軸的排版問題。拿掉這個變因後卡片
              // 直接以最終狀態顯示，只保留外框循環發光這個已經確認沒問題的動畫，
              // 不會再有進場動畫跟捲動容器互相干擾的空間。
              const pulseSegment = 0.4;
              const pulseDuration = Math.max(reveal.entries.length, 1) * pulseSegment + 1.4;
              const cardStyle: React.CSSProperties & { '--pulse-duration': string } = {
                padding: 8,
                boxShadow: 'none',
                border: i === reveal.entries.length - 1 ? '2px solid var(--accent)' : undefined,
                animationDelay: `${i * pulseSegment}s`,
                '--pulse-duration': `${pulseDuration}s`,
              };
              return (
                <div key={`${entry.playerId}-${i}`} className="dg-card dg-reveal-card" style={cardStyle}>
                  <p style={{ fontSize: 12, fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>
                    第 {i + 1} 棒：{entry.displayName}
                  </p>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '8 / 5',
                      border: '2px solid var(--ink)',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                    }}
                  >
                    <StrokeReplay strokes={entry.strokes} emptyLabel="（沒有畫）" />
                  </div>
                  {entry.guessText && (
                    <p
                      style={{
                        fontSize: 11,
                        marginTop: 6,
                        textAlign: 'center',
                        color: i === reveal.entries.length - 1 ? 'var(--accent-ink)' : 'var(--ink-soft)',
                        fontWeight: i === reveal.entries.length - 1 ? 700 : 400,
                      }}
                    >
                      {i === reveal.entries.length - 1 ? '最終猜測：' : '猜測：'}
                      {entry.guessText}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {isHost && (
            <button
              type="button"
              onClick={cancelAutoRestart}
              className="dg-btn"
              style={{ alignSelf: 'center', padding: '8px 16px', fontSize: 13 }}
            >
              返回大廳，開始新的一輪接龍
            </button>
          )}
        </div>
      ) : (
        <div className="dg-canvas-row" style={{ marginTop: 6, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <Toolbar
            color={color}
            width={width}
            tool={tool}
            onColorChange={setColor}
            onWidthChange={setWidth}
            onToolChange={setTool}
            onUndo={() => canvasHandleRef.current?.undo()}
            onClear={() => canvasHandleRef.current?.clear()}
            disabled={!isDrawingSubphase}
          />

          {room.status === 'lobby' ? (
          // lobby 疊層內容量遠比其他狀態多（房間代碼、邀請連結、分類/難度篩選、
          // 開始接龍按鈕），硬塞進畫布 aspect-ratio 容器裡在很多寬度下都會被壓得
          // 太扁、需要捲動才看得完。改成獨立一塊「內容需要多高就多高」的區塊，
          // 不再受畫布尺寸限制——跟 DRAW_GUESS 房間頁面同一套處理方式。
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
                  </div>
                )}
              </div>

              <RoomSettingsPanel
                settings={room.settings}
                categories={categories}
                isHost={isHost}
                onUpdate={updateSettings}
                showRoundDuration={false}
              />

              {connectedPlayerCount >= TELEPHONE_MIN_PLAYERS ? (
                <button
                  type="button"
                  onClick={startGame}
                  className="dg-btn dg-btn-primary"
                  style={{ padding: '12px 24px', fontSize: 16 }}
                >
                  開始接龍
                </button>
              ) : (
                <p style={{ color: 'var(--ink-soft)' }}>
                  至少需要 {TELEPHONE_MIN_PLAYERS} 人才能開始，目前 {connectedPlayerCount} 人
                </p>
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
            {room.status === 'playing' && !isMyTurn && (
              <StatusOverlay icon="eye" iconColor="var(--blue)" title={`等待 ${activePlayerName ?? '對方'} 接龍中`}>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  第 {(t?.completedCount ?? 0) + 1} 棒（共 {t?.totalPlayers ?? 0} 棒），內容要等最後公布才看得到
                </p>
              </StatusOverlay>
            )}

            {room.status === 'playing' && isMyTurn && yourTurn?.subPhase === 'guessing' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <StrokeReplay strokes={yourTurn.previousStrokes} emptyLabel="（上一棒沒有畫任何東西）" />
                </div>
                <div style={{ padding: 12, borderTop: '2px solid var(--ink)', display: 'flex', gap: 8 }}>
                  <input
                    className="dg-input"
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSubmitGuess();
                    }}
                    placeholder="這是在畫什麼？寫下你的猜測"
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button type="button" onClick={handleSubmitGuess} className="dg-btn dg-btn-primary">
                    送出
                  </button>
                </div>
              </div>
            )}

            {room.status === 'playing' && isMyTurn && yourTurn?.subPhase === 'drawing' && (
              <>
                <DrawingCanvas ref={canvasHandleRef} color={color} width={width} tool={tool} disabled={false} />
                {/* 這個 wrapper 用 left/right 撐滿整個上方寬度，靠 space-between 把標籤
                    跟按鈕分居兩端——但視覺上兩者中間是空的，wrapper 本身如果不排除
                    指標事件，那塊「看起來是空的」區域還是會攔截下方畫布的下筆動作，
                    使用者會發現最上面那條完全畫不上去。pointerEvents:'none' 讓這個
                    wrapper 本身完全不擋事件，實際要能點擊的標籤／按鈕各自加回
                    pointerEvents:'auto'，兩者互不影響。 */}
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    right: 10,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    className="dg-tag"
                    style={{ background: 'var(--accent)', color: '#fff', pointerEvents: 'auto' }}
                  >
                    請畫：{yourTurn.promptText}
                  </span>
                  <button
                    type="button"
                    onClick={submitDrawing}
                    className="dg-btn dg-btn-primary"
                    style={{ padding: '6px 14px', pointerEvents: 'auto' }}
                  >
                    交給下一位
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* 玩家列表獨立一列，跟畫布不共用寬度預算 */}
      <div style={{ marginTop: 20, maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
          玩家（{room.players.length}）
        </h2>
        <PlayerList
          players={room.players}
          hostPlayerId={room.hostPlayerId}
          nextDrawerPlayerId={nextChainPlayerId}
          maxHeight={400}
          showScore={false}
        />
      </div>
    </main>
  );
}
