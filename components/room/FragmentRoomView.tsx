'use client';

import { useEffect, useRef, useState } from 'react';
import type { RoomSummary, FragmentReveal, FragmentSplitOrientation, FragmentHalf } from '../../lib/types/room';
import type { Stroke } from '../../lib/types/stroke';
import { FragmentCanvas } from '../canvas/FragmentCanvas';
import { StrokeReplay } from '../canvas/StrokeReplay';
import type { DrawingCanvasHandle } from '../canvas/DrawingCanvas';
import { Toolbar } from '../canvas/Toolbar';
import { PlayerList } from './PlayerList';
import { BackButton } from '../nav/BackButton';
import { RoomTicket } from './RoomTicket';
import { StatusOverlay } from './StatusOverlay';
import { RoomSettingsPanel } from './RoomSettingsPanel';
import { SoundToggleButton } from './SoundToggleButton';
import { RoundTimer } from './RoundTimer';
import {
  FRAGMENT_DRAWING1_TIMEOUT_SEC,
  FRAGMENT_DRAWING2_TIMEOUT_SEC,
  FRAGMENT_GUESS_TIMEOUT_SEC,
  FRAGMENT_MIN_PLAYERS,
} from '../../lib/shared/fragmentConstants';

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

interface FragmentGuessPhase {
  teamId: string;
  word: string;
  splitOrientation: FragmentSplitOrientation;
  keptHalf: FragmentHalf;
  keptStrokes: Stroke[];
  completedStrokes: Stroke[];
}

interface FragmentTeammateDrawing {
  teamId: string;
  splitOrientation: FragmentSplitOrientation;
  keptHalf: FragmentHalf;
  keptStrokes: Stroke[];
}

interface FragmentRoomViewProps {
  room: RoomSummary;
  myPlayerId: string | null;
  yourTurn: FragmentYourTurn | null;
  teammateDrawing: FragmentTeammateDrawing | null;
  guessPhase: FragmentGuessPhase | null;
  reveal: FragmentReveal | null;
  leaveRoom: () => void;
  startGame: () => void;
  updateSettings: (patch: { categoryFilter?: string[]; difficultyFilter?: string[] }) => void;
  voteReadyForNextRound: () => void;
  setOrientation: (orientation: FragmentSplitOrientation) => void;
  submitDrawing1: () => void;
  submitDrawing2: () => void;
  submitGuess: (text: string) => void;
  joinTeam: (teamNumber: number) => void;
}

/**
 * FRAGMENT_DRAW（拼圖接畫）模式的房間畫面。跟 DRAW_TELEPHONE 最大的版面差異：
 * 畫布比其他模式大，工具列直接放在畫布正上方（不是像其他模式那樣並排在旁邊），
 * 見使用者需求「此模式的畫布需要不同以往的大一點，畫筆工具列直接改到畫布上方」。
 */
export function FragmentRoomView({
  room,
  myPlayerId,
  yourTurn,
  teammateDrawing,
  guessPhase,
  reveal,
  leaveRoom,
  startGame,
  updateSettings,
  voteReadyForNextRound,
  setOrientation,
  submitDrawing1,
  submitDrawing2,
  submitGuess,
  joinTeam,
}: FragmentRoomViewProps) {
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

  // 每次輪到新的動作（drawing1/drawing2 交替、或換一組猜題）都要清空畫布跟猜測輸入框重來
  useEffect(() => {
    canvasHandleRef.current?.resetLocal();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件同步本地輸入狀態，非衍生渲染狀態
    setGuessInput('');
  }, [yourTurn, guessPhase?.teamId]);

  const isHost = myPlayerId !== null && myPlayerId === room.hostPlayerId;
  const connectedPlayerCount = room.players.filter((p) => p.connected).length;
  /**
   * lobby 階段每一組目前的人數是否都剛好 2 人——這個檢查同時給組隊視覺化
   * 區塊跟開始遊戲按鈕共用，確保畫面上看到的驗證結果（紅框提示）跟按鈕能不能
   * 按是同一套邏輯算出來的，不會有「畫面看起來都湊齊了，按鈕卻按不下去」
   * 這種前端邏輯兜不起來的情況。人數不足 4 人或分組還沒開始（fragmentTeamAssignment
   * 是空的）時，這裡直接視為「未通過」，跟伺服器端 beginFragmentGame 的驗證
   * 條件一致。
   */
  const fragmentAllTeamsExactlyTwo = (() => {
    const assignment = room.fragmentTeamAssignment;
    const entries = Object.entries(assignment);
    if (entries.length === 0 || entries.length !== connectedPlayerCount) return false;
    const counts = new Map<number, number>();
    for (const [, teamNumber] of entries) {
      counts.set(teamNumber, (counts.get(teamNumber) ?? 0) + 1);
    }
    if (counts.size < 2) return false;
    return Array.from(counts.values()).every((c) => c === 2);
  })();
  const f = room.fragment;
  const myTeam = f?.teams.find((t) => myPlayerId !== null && t.playerIds.includes(myPlayerId));
  const teammateId = myTeam && myPlayerId !== null ? myTeam.playerIds.find((id) => id !== myPlayerId) : undefined;
  const teammateName = teammateId ? room.players.find((p) => p.id === teammateId)?.displayName : undefined;

  const isRevealing = room.status === 'finished' && reveal !== null;
  const isDrawingSubphase = yourTurn !== null;

  /**
   * 猜題階段倒數的時間基準：改成客戶端收到 fragment:guessPhase 私訊那一刻
   * 記錄的本地時間戳，不是伺服器廣播的時間戳——這個模式的猜題階段改成每個
   * 人各自依自己的節奏往下猜（不再有「全房間共用同一組在被猜」這回事），
   * 伺服器內部雖然還是有記錄每位玩家各自的猜題起始時間，但那是純粹給伺服器
   * 自己排程逾時計時器用的內部狀態，不需要（也沒有必要）曝露成一個「大家
   * 共用的同步時間戳」放進公開摘要——每個人的倒數本來就只跟自己有關，用
   * 「我自己收到這則私訊的當下」當基準已經足夠合理，不需要追求跟伺服器
   * 時間戳完全一致（頂多差在网路傳輸的些微延遲，這個誤差感受不到）。
   * 換到下一組（guessPhase.teamId 改變）時要重新記錄。
   */
  const [guessPhaseStartedAtLocal, setGuessPhaseStartedAtLocal] = useState<number | null>(null);
  const guessPhaseTeamId = guessPhase?.teamId ?? null;
  useEffect(() => {
    if (guessPhaseTeamId !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 依外部事件（收到新的猜題私訊）記錄本地起始時間，非衍生渲染狀態
      setGuessPhaseStartedAtLocal(Date.now());
    }
  }, [guessPhaseTeamId]);

  /**
   * 倒數橫條：跟接龍模式一樣，用時間戳換算，不需要伺服器每秒推播。這個模式
   * 的「目前該顯示什麼倒數」看自己所屬的那一組（作畫階段）或自己目前猜題
   * 私訊的起始時間（猜題階段，見上面 guessPhaseStartedAtLocal 的說明）。
   */
  useEffect(() => {
    const shouldTick =
      !isRevealing && (myTeam?.subPhase === 'drawing1' || myTeam?.subPhase === 'drawing2' || guessPhase !== null);
    if (!shouldTick) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRevealing, myTeam?.subPhase, guessPhase]);

  let timeLimitSec = 0;
  let subPhaseStartedAt: number | null = null;
  if (guessPhase) {
    timeLimitSec = FRAGMENT_GUESS_TIMEOUT_SEC;
    subPhaseStartedAt = guessPhaseStartedAtLocal;
  } else if (myTeam?.subPhase === 'drawing1') {
    timeLimitSec = FRAGMENT_DRAWING1_TIMEOUT_SEC;
    subPhaseStartedAt = myTeam.subPhaseStartedAt;
  } else if (myTeam?.subPhase === 'drawing2') {
    timeLimitSec = FRAGMENT_DRAWING2_TIMEOUT_SEC;
    subPhaseStartedAt = myTeam.subPhaseStartedAt;
  }
  const timeLeftSec =
    subPhaseStartedAt !== null && !isRevealing
      ? Math.max(0, timeLimitSec - Math.floor((now - subPhaseStartedAt) / 1000))
      : null;

  /** 猜題階段：記錄「已經對哪一組送出過猜測」，同一組只能猜一次——送出後
   *  按鈕跟輸入框都要鎖住，不然使用者可能誤以為還能再猜、對著已經被伺服器
   *  安靜忽略的重複請求納悶「怎麼猜了沒反應」。換到下一組（guessPhase.teamId
   *  改變）時要重置，不然會被上一組的紀錄誤鎖住。 */
  const [guessedTeamId, setGuessedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (guessPhase && guessPhase.teamId !== guessedTeamId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 換到新一組時重置鎖定狀態，依外部事件同步，非衍生渲染狀態
      setGuessedTeamId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只需要在 teamId 變動時重置，guessedTeamId 本身不該是觸發依據
  }, [guessPhase?.teamId]);

  const handleSubmitGuess = () => {
    const text = guessInput.trim();
    if (!text || !guessPhase || guessedTeamId === guessPhase.teamId) return;
    submitGuess(text);
    setGuessInput('');
    setGuessedTeamId(guessPhase.teamId);
  };

  return (
    <main id="main"
      className={isRevealing ? 'dg-page dg-fragment-page rm-reveal' : `dg-page dg-fragment-page rm-page rm-page-wide${room.status === 'lobby' ? ' rm-lobby' : ''}`}
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 24,
        // <body> 是 display:flex，讓 <main> 變成 flex item；<main> 同時有
        // margin:'0 auto' 用於超寬螢幕置中——CSS flexbox 規格裡，flex item
        // 在橫軸方向上只要有 margin:auto，align-items:stretch 對這個 item
        // 就完全不會生效，item 會退回「內容多寬就多寬」的 shrink-to-fit
        // 模式決定自己的寬度，不會真的撐滿可用空間（這個問題先前在接龍模式
        // 的公布結果畫廊發現過，見那邊 isRevealing 分支的處理）。
        //
        // width:'100%' 這個修正只在手機斷點（見 globals.css 的
        // .dg-fragment-page，套用在 @media (max-width: 640px) 裡）才生效，
        // 不是這裡用 inline style 不分螢幕寬度一律套用——之前一度改成不分
        // 螢幕寬度都給 width:'100%'，桌機版意外看起來「跑版」（後來查證那其實
        // 是另一個獨立問題：lobby 卡片沒有水平置中，不是這個修正本身造成的，
        // 見下面 lobby 分支 margin:'6px auto 0' 的說明），但既然這個
        // shrink-to-fit 問題只有在手機窄螢幕上才會造成「超出頁面」這種明顯
        // 外觀症狀（桌機寬螢幕下 shrink-to-fit 算出來的寬度通常還是夠放得下
        // 內容），縮小範圍只在手機斷點套用，桌機版的版面計算方式完全不受這個
        // 修正影響，降低不必要的變動範圍。
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <BackButton href="/online" label="線上模式" onBeforeLeave={leaveRoom} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <p className="dg-eyebrow" style={{ margin: 0 }}>房間代碼</p>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.06em', margin: 0 }}>{room.joinCode}</h1>
        </div>
        <span className="dg-tag">拼圖接畫</span>
        {teammateName && room.status === 'playing' && (
          <span className="dg-tag" style={{ background: 'var(--blue-soft)' }}>隊友：{teammateName}</span>
        )}
        <div style={{ flex: 1, minWidth: 8 }} />
        <SoundToggleButton />
      </div>

      <div style={{ marginTop: 10, visibility: timeLeftSec !== null ? 'visible' : 'hidden' }}>
        <RoundTimer remainingSec={timeLeftSec ?? 0} timeLimitSec={timeLimitSec || 1} />
      </div>

      {isRevealing ? (
        <FragmentRevealSection reveal={reveal} room={room} myPlayerId={myPlayerId} voteReadyForNextRound={voteReadyForNextRound} />
      ) : room.status === 'lobby' ? (
        // .dg-canvas-frame 這個 class 原本是設計給「跟工具列並排在同一個
        // flex row（.dg-canvas-row）裡」的情境用的，那個情境下容器本身的
        // justifyContent 或 flex 排列邏輯會讓子項目自然置中，不需要額外處理。
        // 這裡（lobby 狀態）是單獨使用，沒有跟任何東西並排——單獨使用時
        // .dg-canvas-frame 就只是一個有 max-width 的普通區塊元素，區塊元素
        // 沒有指定 margin 時預設靠左對齊，不會自動置中。這個問題原本被
        // <main> 本身的 shrink-to-fit bug 意外遮蓋住（<main> 那時候本來就
        // 收縮到接近內容寬度，沒有「多出來的空間」讓置中與否產生視覺差異），
        // 修正 <main> 讓它確實撐滿寬度之後，這個一直都存在、只是沒被看見的
        // 置中缺失就顯現出來了——明確加上 margin:'0 auto' 讓它在變寬的
        // <main> 裡確實置中，不會整個貼齊左邊、右側留下一大塊不對稱的空白。
        <div className="dg-canvas-frame" style={{ margin: '6px auto 0' }}>
          <StatusOverlay standalone icon="clock" iconColor="var(--blue)" title="遊戲尚未開始">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', width: '100%' }}>
              <RoomTicket joinCode={room.joinCode} url={pageUrl} />
              
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', textAlign: 'center', maxWidth: 320 }}>
                兩人一組，一組畫一組猜；至少要 {FRAGMENT_MIN_PLAYERS} 人、且人數為偶數才能開始
              </p>
            </div>

            {(() => {
              // 組隊視覺化：每一組都有自己獨立的「加入」圖示按鈕，點下去就把
              // 自己移到那一組——開始遊戲前允許人數暫時不對稱（某組暫時3人、
              // 某組暫時0人都可以），不會像之前的「固定配對、互換位置」那樣
              // 綁死每組一定是2人；真正要開始遊戲時，每一組都必須剛好2人
              // 才會通過驗證（見下面開始按鈕的卡控）。已經在某一組的人，那一組
              // 的加入按鈕會被 disable（見使用者需求「某玩家在該組那該玩家就
              // 不能點擊該組的 ICON」），只能點別組的按鈕移過去。
              const assignment = room.fragmentTeamAssignment;
              const teamNumbers = new Set(Object.values(assignment));
              // 團隊編號的組數至少要夠放下所有連線中的人（每組2人下限），
              // 也要包含玩家目前已經在用的最大編號（避免有人手動點到很後面
              // 的編號、畫面卻沒有顯示那個編號的組別）。
              const slotCount = Math.max(
                Math.ceil(connectedPlayerCount / 2),
                teamNumbers.size > 0 ? Math.max(...teamNumbers) + 1 : 0,
                1
              );
              const nameOf = (id: string) => room.players.find((p) => p.id === id)?.displayName ?? '？';
              const membersOfTeam = (teamNumber: number) =>
                Object.entries(assignment)
                  .filter(([, t]) => t === teamNumber)
                  .map(([id]) => id);

              return (
                <div style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', textAlign: 'center' }}>
                    點「加入」把自己移到那一組；每組必須剛好 2 人才能開始遊戲
                  </p>
                  {Array.from({ length: slotCount }).map((_, teamNumber) => {
                    const members = membersOfTeam(teamNumber);
                    const iAmHere = myPlayerId !== null && members.includes(myPlayerId);
                    const isValid = members.length === 2;
                    return (
                      <div
                        key={teamNumber}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                          padding: '6px 10px',
                          border: `2px solid ${isValid ? 'var(--ink)' : 'var(--accent)'}`,
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--paper)',
                        }}
                      >
                        <span style={{ fontSize: 11, color: 'var(--ink-soft)', minWidth: 40 }}>
                          第 {teamNumber + 1} 組（{members.length}/2）
                        </span>
                        {members.length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>還沒有人</span>
                        ) : (
                          members.map((id) => (
                            <span
                              key={id}
                              className="dg-tag"
                              style={{
                                padding: '4px 10px',
                                fontSize: 13,
                                background: 'var(--paper)',
                                // 不用另外標註文字「（你）」，單純把自己名字的顏色
                                // 換成強調色，一眼就能認出自己在哪一組。
                                color: id === myPlayerId ? 'var(--accent-ink)' : 'var(--ink)',
                                fontWeight: id === myPlayerId ? 800 : 400,
                              }}
                            >
                              {nameOf(id)}
                            </span>
                          ))
                        )}
                        <button
                          type="button"
                          onClick={() => joinTeam(teamNumber)}
                          disabled={iAmHere}
                          aria-label={`加入第 ${teamNumber + 1} 組`}
                          title={iAmHere ? '你已經在這一組了' : `加入第 ${teamNumber + 1} 組`}
                          className="dg-btn"
                          style={{
                            width: 44,
                            height: 44,
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: iAmHere ? 0.35 : 1,
                            marginLeft: 'auto',
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                  {!fragmentAllTeamsExactlyTwo && (
                    <p style={{ fontSize: 12, color: 'var(--accent-ink)', textAlign: 'center' }}>
                      每一組都要剛好 2 人才能開始，紅框是還沒湊齊的組別
                    </p>
                  )}
                </div>
              );
            })()}

            <RoomSettingsPanel
              settings={room.settings}
              categories={categories}
              isHost={isHost}
              onUpdate={updateSettings}
              showRoundDuration={false}
            />

            {connectedPlayerCount >= FRAGMENT_MIN_PLAYERS && fragmentAllTeamsExactlyTwo ? (
              <button type="button" onClick={startGame} className="dg-btn dg-btn-primary" style={{ padding: '12px 24px', fontSize: 16 }}>
                開始遊戲
              </button>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                至少需要 {FRAGMENT_MIN_PLAYERS} 人、且每一組都要剛好 2 人才能開始，目前 {connectedPlayerCount} 人
              </p>
            )}
          </StatusOverlay>
        </div>
      ) : guessPhase ? (
        <FragmentGuessSection
          guessPhase={guessPhase}
          guessInput={guessInput}
          onGuessInputChange={setGuessInput}
          onSubmitGuess={handleSubmitGuess}
          hasGuessed={guessedTeamId === guessPhase.teamId}
        />
      ) : (
        <FragmentDrawingSection
          yourTurn={yourTurn}
          teammateDrawing={teammateDrawing}
          myTeamSubPhase={myTeam?.subPhase ?? null}
          guessingStarted={f?.guessingStarted ?? false}
          playersStillGuessingCount={f?.playersStillGuessingCount ?? 0}
          color={color}
          width={width}
          tool={tool}
          onColorChange={setColor}
          onWidthChange={setWidth}
          onToolChange={setTool}
          canvasHandleRef={canvasHandleRef}
          setOrientation={setOrientation}
          submitDrawing1={submitDrawing1}
          submitDrawing2={submitDrawing2}
          isDrawingSubphase={isDrawingSubphase}
        />
      )}

      {!isRevealing && (
        <div style={{ marginTop: 24 }}>
          <PlayerList players={room.players} hostPlayerId={room.hostPlayerId} showScore={false} />
        </div>
      )}
    </main>
  );
}

interface FragmentDrawingSectionProps {
  yourTurn: FragmentYourTurn | null;
  teammateDrawing: FragmentTeammateDrawing | null;
  myTeamSubPhase: 'drawing1' | 'drawing2' | 'done' | null;
  /** 猜題階段是否已經開始（所有組別都畫完了）——用來判斷「這一組已經 done」
   *  這個狀態，要顯示「還在等其他組畫完」還是「已經在猜題階段、等其他人
   *  猜完」，兩種文字含意不同，不能混用同一句。 */
  guessingStarted: boolean;
  /** 猜題階段還有幾位連線中的玩家沒猜完，給「等其他人猜完」的畫面顯示整體
   *  進度用（自己已經沒有東西可猜時才會顯示這個畫面）。 */
  playersStillGuessingCount: number;
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
  onToolChange: (t: 'pen' | 'eraser') => void;
  canvasHandleRef: React.RefObject<DrawingCanvasHandle | null>;
  setOrientation: (o: FragmentSplitOrientation) => void;
  submitDrawing1: () => void;
  submitDrawing2: () => void;
  isDrawingSubphase: boolean;
}

/**
 * 作畫階段的畫面：工具列直接放在畫布正上方（不是並排），畫布本身比其他模式大
 * （見 globals.css 的 .dg-fragment-canvas-frame），見使用者需求。三種情況分開處理：
 *  - 輪到自己畫（起手或補全）：完整的工具列＋畫布＋交卷按鈕
 *  - 隊友正在補全，自己是起手、可以旁觀：唯讀畫布顯示即時過程，沒有工具列
 *  - 其餘（等隊友開始、還在等其他組畫完、或猜題階段自己暫時沒有下一組要猜、
 *    在等其他人猜完）：純文字狀態卡片
 */
function FragmentDrawingSection({
  yourTurn,
  teammateDrawing,
  myTeamSubPhase,
  guessingStarted,
  playersStillGuessingCount,
  color,
  width,
  tool,
  onColorChange,
  onWidthChange,
  onToolChange,
  canvasHandleRef,
  setOrientation,
  submitDrawing1,
  submitDrawing2,
  isDrawingSubphase,
}: FragmentDrawingSectionProps) {
  if (yourTurn) {
    const isFirst = yourTurn.subPhase === 'drawing1';
    return (
      <div className="dg-fragment-canvas-frame" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="dg-tag" style={{ background: 'var(--accent)' }}>
            題目：{yourTurn.word}
          </span>
          {isFirst && (
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                type="button"
                onClick={() => setOrientation(yourTurn.splitOrientation === 'vertical' ? 'horizontal' : 'vertical')}
                className="dg-btn"
                style={{ padding: '6px 12px', fontSize: 12 }}
                title="切換畫布分割方向（左右切／上下切）；切換會清空目前畫的內容，因為引導線的位置變了，原本畫的東西可能跨到另一半去了"
              >
                切割方向：{yourTurn.splitOrientation === 'vertical' ? '左右' : '上下'}（點擊切換）
              </button>
            </div>
          )}
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {isFirst ? '自由畫滿整個畫布，等一下系統會隨機保留其中一半給隊友補全' : '只能在空白那一半接續作畫，補全題目內容'}
          </span>
        </div>

        <Toolbar
          color={color}
          width={width}
          tool={tool}
          onColorChange={onColorChange}
          onWidthChange={onWidthChange}
          onToolChange={onToolChange}
          onUndo={() => canvasHandleRef.current?.undo()}
          onClear={() => canvasHandleRef.current?.clear()}
          disabled={!isDrawingSubphase}
          forceLayout="mobile"
        />

        <div className="rm-sheet" style={{ width: '100%', aspectRatio: '3 / 2', minHeight: 420 }}>
          <FragmentCanvas
            ref={canvasHandleRef}
            color={color}
            width={width}
            tool={tool}
            splitOrientation={yourTurn.splitOrientation}
            keptHalf={yourTurn.subPhase === 'drawing2' ? yourTurn.keptHalf : undefined}
            keptStrokes={yourTurn.subPhase === 'drawing2' ? yourTurn.keptStrokes : undefined}
          />
        </div>

        <button
          type="button"
          onClick={isFirst ? submitDrawing1 : submitDrawing2}
          className="dg-btn dg-btn-primary"
          style={{ alignSelf: 'center', padding: '10px 24px', fontSize: 15 }}
        >
          {isFirst ? '交出這一半，隨機保留給隊友' : '交出完成的作品'}
        </button>
      </div>
    );
  }

  if (teammateDrawing) {
    return (
      <div className="dg-fragment-canvas-frame" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', textAlign: 'center' }}>
          隊友正在補全你的畫作，即時看看他畫得怎麼樣
        </p>
        <div className="rm-sheet" style={{ width: '100%', aspectRatio: '3 / 2', minHeight: 420 }}>
          <FragmentCanvas
            color={color}
            width={width}
            tool={tool}
            disabled
            splitOrientation={teammateDrawing.splitOrientation}
            keptHalf={teammateDrawing.keptHalf}
            keptStrokes={teammateDrawing.keptStrokes}
          />
        </div>
      </div>
    );
  }

  const waitingText =
    myTeamSubPhase === 'drawing1'
      ? '等待隊友開始畫第一筆'
      : myTeamSubPhase === 'done'
        ? guessingStarted
          ? // 已經進入猜題階段、自己也已經把該猜的組別全部猜完了，只是暫時
            // 沒有下一組可猜——不是「還在等畫完」，文字要對應到正確的階段，
            // 不然使用者會誤以為系統卡住了。
            `你已經猜完所有作品了，還有 ${playersStillGuessingCount} 人在猜，全部猜完後會公布結果`
          : '你們這組已經畫完了，等其他組畫完才會進入猜題階段'
        : '等待遊戲開始';

  return (
    <div className="dg-canvas-frame" style={{ margin: '6px auto 0' }}>
      <StatusOverlay standalone icon="clock" iconColor="var(--blue)" title={waitingText} />
    </div>
  );
}

interface FragmentGuessSectionProps {
  guessPhase: FragmentGuessPhase;
  guessInput: string;
  onGuessInputChange: (v: string) => void;
  onSubmitGuess: () => void;
  /** 這組作品是不是已經送出過猜測——每組只能猜一次，送出後輸入框跟按鈕都要
   *  鎖住並顯示明確提示，不然使用者可能誤以為還能再猜、對著被伺服器安靜忽略
   *  的重複請求納悶「怎麼猜了沒反應」。 */
  hasGuessed: boolean;
}

/**
 * 猜題階段的畫面：私訊給「現在該猜這一組」的玩家（見
 * fragmentOrchestrator.ts 的 sendFragmentGuessTurnToPlayer），收到這個 prop
 * 就代表這是輪到自己猜的組別，不再需要 isOwnTeam 判斷要不要顯示猜測輸入框
 * ——自己組的作品本來就不會被排進自己的猜題序列裡。
 */
function FragmentGuessSection({
  guessPhase,
  guessInput,
  onGuessInputChange,
  onSubmitGuess,
  hasGuessed,
}: FragmentGuessSectionProps) {
  const combinedStrokes = [...guessPhase.keptStrokes, ...guessPhase.completedStrokes];
  return (
    <div className="dg-fragment-canvas-frame" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="rm-ask">這一組畫的是什麼？</p>
      <div
        style={{
          width: '100%',
          aspectRatio: '3 / 2',
          minHeight: 360,
          border: '2px solid var(--ink)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <StrokeReplay strokes={combinedStrokes} emptyLabel="（沒有畫）" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <input
            type="text"
            value={guessInput}
            onChange={(e) => onGuessInputChange(e.target.value)}
            onKeyDown={(e) => {
              // 中文輸入法組字過程中按 Enter 是為了確認選字，不是要送出——
              // 排除 isComposing 才不會把還沒打完的片段（例如注音符號本身）
              // 誤送出去，理由詳見 GuessChatBox.tsx 同樣的處理。這個 bug
              // 原本會讓使用注音、拼音等輸入法的玩家，組字被 Enter 鍵一直
              // 打斷、要不斷重新輸入，嚴重時甚至可能因此拖到猜題逾時，
              // 被系統自動代打成「（沒有人猜）」。
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmitGuess();
            }}
            placeholder="輸入你的猜測"
            className="dg-input"
            disabled={hasGuessed}
            style={{ maxWidth: 240 }}
          />
          <button
            type="button"
            onClick={onSubmitGuess}
            disabled={hasGuessed}
            className={hasGuessed ? 'dg-btn' : 'dg-btn dg-btn-primary'}
            // 不設定固定寬高，寬度、高度都跟著文字內容本身自然撐開（「已送出」
            // 比「送出猜測」短，按鈕就該跟著變窄，不需要兩個按鈕維持一樣寬）；
            // 容器加上 alignItems:'center'（見上面），按鈕才不會被預設的
            // stretch 行為拉伸成跟旁邊 .dg-input 一樣高——.dg-input 的內距、
            // 字體都比這個按鈕大，不做這個修正的話按鈕會被撐得比實際文字內容
            // 需要的高度大上一圈，看起來不成比例。
            style={{ padding: '8px 14px', fontSize: 13, width: 'auto', height: 'auto' }}
          >
            {hasGuessed ? '已送出' : '送出猜測'}
          </button>
        </div>
        {hasGuessed && (
          <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            每組只能猜一次，已經送出你的猜測，等其他人猜完就會換下一組
          </p>
        )}
      </div>
    </div>
  );
}

interface FragmentRevealSectionProps {
  reveal: FragmentReveal | null;
  room: RoomSummary;
  myPlayerId: string | null;
  voteReadyForNextRound: () => void;
}

/** 公布階段：以組為單位呈現，每組顯示完整作品（保留下來那一半＋補全那一半合併）
 *  跟外組玩家各自的猜測，跟接龍模式的公布畫廊同一套視覺語言、同一套投票機制。 */
function FragmentRevealSection({ reveal, room, myPlayerId, voteReadyForNextRound }: FragmentRevealSectionProps) {
  if (!reveal) return null;
  const readyIds = room.fragment?.readyForNextRoundIds ?? [];
  const iAmReady = myPlayerId !== null && readyIds.includes(myPlayerId);
  const connectedCount = room.players.filter((p) => p.connected).length;
  const readyConnectedCount = readyIds.filter((id) => room.players.find((p) => p.id === id)?.connected).length;

  return (
    <div style={{ marginTop: 6, width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="rm-reveal-grid"      >
        {reveal.teams.map((t, teamIdx) => {
          const combinedStrokes = [...t.keptStrokes, ...t.completedStrokes];
          // 猜測列表依「猜測者所屬的組別」在 reveal.teams 裡的順序排列（不是
          // 依送出先後），比較容易一眼看出「第2組的人猜了什麼、第3組的人猜了
          // 什麼」這種依組別分類的脈絡——需要反查每個猜測者屬於哪一組，用
          // memberIds 對照。
          const teamIndexOfPlayer = new Map<string, number>();
          reveal.teams.forEach((team, idx) => {
            team.memberIds.forEach((id) => teamIndexOfPlayer.set(id, idx));
          });
          const sortedGuesses = [...t.guesses].sort(
            (a, b) => (teamIndexOfPlayer.get(a.guesserId) ?? 0) - (teamIndexOfPlayer.get(b.guesserId) ?? 0)
          );
          return (
            <div
              key={t.teamId}
              className="dg-card dg-taped rm-reveal-card"
              style={{ ['--i' as string]: teamIdx, ['--tilt' as string]: `${teamIdx % 2 === 0 ? -0.8 : 0.9}deg`, ['--tape-tilt' as string]: `${teamIdx % 2 === 0 ? -3 : 4}deg` }}
            >
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, textAlign: 'center' }}>
                {t.memberNames[0]} ＋ {t.memberNames[1]}：{t.word}
              </p>
              <div
                style={{
                  width: '100%',
                  aspectRatio: '3 / 2',
                  border: '2px solid var(--ink)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <StrokeReplay strokes={combinedStrokes} emptyLabel="（沒有畫）" />
              </div>
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4 }}>
                  大家的猜測
                </p>
                {sortedGuesses.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sortedGuesses.map((g) => (
                      <p key={g.guesserId} style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                        <strong style={{ color: 'var(--ink)' }}>{g.guesserDisplayName}</strong> 猜：{g.text}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)' }}>沒有人猜這一組</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(() => {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              {readyConnectedCount} / {connectedCount} 人已準備好下一場
            </p>
            <button
              type="button"
              onClick={voteReadyForNextRound}
              disabled={iAmReady}
              className={iAmReady ? 'dg-btn' : 'dg-btn dg-btn-primary'}
              style={{ padding: '8px 20px', fontSize: 13 }}
            >
              {iAmReady ? '已準備，等其他人…' : '我準備好了，返回大廳'}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
