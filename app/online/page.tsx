'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackButton } from '../../components/nav/BackButton';
import { StatusIcon } from '../../components/room/StatusIcon';
import { ArtDrawGuess, ArtTelephone, ArtFragment, Star } from '../../components/art/Doodles';

type Mode = 'DRAW_GUESS' | 'DRAW_TELEPHONE' | 'FRAGMENT_DRAW';
type Tab = 'create' | 'join';
type Field = 'createName' | 'joinName' | 'joinCode';

function storeIdentity(joinCode: string, displayName: string, playerId?: string) {
  sessionStorage.setItem(`draw-guess-party:${joinCode}`, JSON.stringify({ displayName, playerId }));
}

const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'EASY', label: '易' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HARD', label: '難' },
];

const ROUND_DURATIONS = [30, 60, 90, 120];

const MODES: {
  key: Mode;
  name: string;
  meta: string;
  bg: string;
  art: (p: { live?: boolean }) => React.ReactNode;
  rules: string[];
}[] = [
  {
    key: 'DRAW_GUESS',
    name: '你畫我猜',
    meta: '2 人起 · 計分',
    bg: 'var(--amber-soft)',
    art: (p) => <ArtDrawGuess {...p} />,
    rules: [
      '輪流當畫圖者，其他人在聊天室搶答。',
      '猜中的人依當下剩餘時間拿 1～10 分，越早猜中分數越高。',
      '猜對了，畫圖者也跟著加 5 分。',
      '時間到都沒人猜中，這輪雙方都不得分。',
    ],
  },
  {
    key: 'DRAW_TELEPHONE',
    name: '畫圖接龍',
    meta: '3 人起 · 不計分',
    bg: 'var(--pink-soft)',
    art: (p) => <ArtTelephone {...p} />,
    rules: [
      '至少 3 人才能開始。',
      '第一位隨機拿到題目並開始畫。',
      '之後每一位先猜前一棒畫的是什麼，再畫下自己的猜測。',
      '最後公布原始題目與整條接龍的所有作品。',
      '猜測限時 25 秒、作畫限時 60 秒，不受「每輪限時」影響。',
    ],
  },
  {
    key: 'FRAGMENT_DRAW',
    name: '拼圖接畫',
    meta: '4 人起（偶數）· 組隊',
    bg: 'var(--green-soft)',
    art: (p) => <ArtFragment {...p} />,
    rules: [
      '兩人一組，至少 4 人且為偶數才能開始。',
      '每組拿到各自的題目，起手先自由畫滿整個畫布。',
      '交卷後系統隨機只保留一半，隊友只能在空白那一半補全。',
      '全部組別畫完後，每個人依自己的節奏猜其他組的作品。',
      '不計分，純粹娛樂。',
    ],
  },
];

const isMode = (v: string | null): v is Mode => MODES.some((m) => m.key === v);

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function ArrowIcon() {
  return (
    <svg className="dg-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function OnlineLobby() {
  const router = useRouter();
  const params = useSearchParams();

  const [tab, setTab] = useState<Tab>(params.get('tab') === 'join' ? 'join' : 'create');
  const [mode, setMode] = useState<Mode>(() => {
    const q = params.get('mode');
    return isMode(q) ? q : 'DRAW_GUESS';
  });

  const [createName, setCreateName] = useState('');
  const [roundDurationSec, setRoundDurationSec] = useState(60);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);

  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState(() => cleanCode(params.get('code') ?? ''));

  const [error, setError] = useState<{ message: string; field?: Field } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createNameRef = useRef<HTMLInputElement>(null);
  const joinNameRef = useRef<HTMLInputElement>(null);
  const joinCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/word-categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const fail = (message: string, field?: Field) => {
    setError({ message, field });
    const target = field === 'createName' ? createNameRef : field === 'joinName' ? joinNameRef : field === 'joinCode' ? joinCodeRef : null;
    target?.current?.focus();
  };

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!createName.trim()) {
      fail('請先輸入暱稱，朋友才認得出你', 'createName');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: createName.trim(),
          mode,
          roundDurationSec,
          categoryFilter: selectedCategories,
          difficultyFilter: selectedDifficulties,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        fail(data?.error ?? '建立房間失敗，請稍後再試');
        return;
      }
      const room = await res.json();
      // 建立房間當下只有自己一個人在裡面，直接取第一個（也是唯一一個）玩家即可。
      const creator = room.players[0];
      storeIdentity(room.joinCode, createName.trim(), creator?.id);
      router.push(`/online/room/${room.joinCode}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!joinCode.trim()) {
      fail('請輸入朋友給你的房間代碼', 'joinCode');
      return;
    }
    if (!joinName.trim()) {
      fail('請先輸入暱稱', 'joinName');
      return;
    }
    setError(null);
    const code = joinCode.trim().toUpperCase();
    storeIdentity(code, joinName.trim());
    router.push(`/online/room/${code}`);
  };

  const current = MODES.find((m) => m.key === mode)!;
  const advancedCount =
    selectedCategories.length + selectedDifficulties.length + (mode === 'DRAW_GUESS' && roundDurationSec !== 60 ? 1 : 0);

  const errorBox = error && (
    <div id="ol-error" className="dg-notice" role="alert">
      <StatusIcon kind="alert" color="var(--red)" size={36} />
      <span>{error.message}</span>
    </div>
  );

  return (
    <main id="main" className="ol-wrap">
      <div className="ol-top dg-in">
        <BackButton href="/" label="首頁" />
      </div>

      <header className="ol-head dg-in" style={{ ['--i' as string]: 1 }}>
        <p className="dg-eyebrow">線上模式</p>
        <h1 className="ol-h1">{tab === 'create' ? '開一桌，叫朋友來' : '坐進朋友的桌'}</h1>
      </header>

      <div className="ol-grid">
        {/* ------------------------------------------------ 左：玩法預覽 */}
        <aside className="ol-aside dg-in" style={{ ['--i' as string]: 2 }}>
          {tab === 'create' ? (
            <div className="dg-card dg-taped ol-preview" style={{ ['--tape-tilt' as string]: '3deg' }}>
              <div className="ol-preview-art" style={{ background: current.bg }}>
                {/* key 讓切換玩法時整張插圖重掛載，描線動畫重新播放 */}
                <div key={mode}>{current.art({ live: true })}</div>
              </div>
              <h2 className="ol-preview-name">{current.name}</h2>
              <ul className="ol-rules">
                {current.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="dg-card dg-taped ol-preview" style={{ ['--tape-tilt' as string]: '-3deg' }}>
              <div className="ol-ticketart" aria-hidden="true">
                <span>ROOM CODE</span>
                <strong>ABC123</strong>
              </div>
              <h2 className="ol-preview-name">拿著代碼入場</h2>
              <ol className="ol-rules ol-rules-num">
                <li>跟朋友要 6 碼房間代碼（或直接掃他的 QR code）。</li>
                <li>輸入你的暱稱與代碼。</li>
                <li>進房間，等大家到齊就開始。</li>
              </ol>
            </div>
          )}
          <Star size={40} className="ol-aside-star" />
        </aside>

        {/* ------------------------------------------------ 右：表單 */}
        <section className="ol-panel dg-in" style={{ ['--i' as string]: 3 }}>
          <div className="dg-seg" role="tablist" aria-label="建立或加入房間" style={{ ['--n' as string]: 2, ['--idx' as string]: tab === 'create' ? 0 : 1 }}>
            <span className="dg-seg-thumb" aria-hidden="true" />
            <button type="button" role="tab" id="tab-create" aria-selected={tab === 'create'} aria-controls="panel-create" onClick={() => { setTab('create'); setError(null); }}>
              建立房間
            </button>
            <button type="button" role="tab" id="tab-join" aria-selected={tab === 'join'} aria-controls="panel-join" onClick={() => { setTab('join'); setError(null); }}>
              加入房間
            </button>
          </div>

          {tab === 'create' ? (
            <form id="panel-create" role="tabpanel" aria-labelledby="tab-create" className="dg-card ol-form" onSubmit={handleCreate} noValidate>
              <fieldset className="ol-fieldset">
                <legend className="dg-label">
                  <span className="ol-step">1</span>選一種玩法
                </legend>
                <div className="ol-modes">
                  {MODES.map((m) => (
                    <label key={m.key} className="ol-mode">
                      <input type="radio" name="mode" value={m.key} className="dg-sr-only" checked={mode === m.key} onChange={() => setMode(m.key)} />
                      <span className="ol-mode-body">
                        <span className="ol-mode-art" style={{ background: m.bg }}>{m.art({})}</span>
                        <span className="ol-mode-name">{m.name}</span>
                        <span className="ol-mode-meta">{m.meta}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="dg-field">
                <label htmlFor="create-name" className="dg-label">
                  <span className="ol-step">2</span>你的暱稱
                </label>
                <input
                  id="create-name"
                  ref={createNameRef}
                  className="dg-input"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="例如：阿翔"
                  maxLength={16}
                  autoComplete="nickname"
                  aria-invalid={error?.field === 'createName'}
                  aria-describedby={error?.field === 'createName' ? 'ol-error' : undefined}
                />
              </div>

              <details className="ol-adv">
                <summary>
                  <span className="ol-step">3</span>
                  進階設定
                  <span className="dg-hint ol-adv-hint">時間、分類、難度（可略過）</span>
                  {advancedCount > 0 && <span className="dg-tag ol-adv-count">已調整 {advancedCount}</span>}
                  <svg className="ol-adv-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="ol-adv-body">
                  {mode === 'DRAW_GUESS' && (
                    <div className="dg-field">
                      <span className="dg-label" id="lbl-duration">每輪限時</span>
                      <div className="ol-chips" role="group" aria-labelledby="lbl-duration">
                        {ROUND_DURATIONS.map((sec) => (
                          <button key={sec} type="button" className="dg-chip" aria-pressed={roundDurationSec === sec} onClick={() => setRoundDurationSec(sec)}>
                            {sec} 秒
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="dg-field">
                    <span className="dg-label" id="lbl-cat">分類</span>
                    <p className="dg-hint">不選代表全部分類都會出現。</p>
                    <div className="ol-chips" role="group" aria-labelledby="lbl-cat">
                      {categories.length === 0 && <span className="dg-hint">題庫目前沒有分類</span>}
                      {categories.map((cat) => (
                        <button key={cat} type="button" className="dg-chip" aria-pressed={selectedCategories.includes(cat)} onClick={() => toggle(selectedCategories, setSelectedCategories, cat)}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="dg-field">
                    <span className="dg-label" id="lbl-diff">難度</span>
                    <p className="dg-hint">不選代表全部難度。</p>
                    <div className="ol-chips" role="group" aria-labelledby="lbl-diff">
                      {DIFFICULTIES.map((d) => (
                        <button key={d.value} type="button" className="dg-chip" aria-pressed={selectedDifficulties.includes(d.value)} onClick={() => toggle(selectedDifficulties, setSelectedDifficulties, d.value)}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </details>

              {errorBox}

              <button type="submit" disabled={submitting} className="dg-btn dg-btn-primary dg-btn-lg dg-btn-block">
                {submitting ? '建立中…' : '建立房間'}
                {!submitting && <ArrowIcon />}
              </button>
            </form>
          ) : (
            <form id="panel-join" role="tabpanel" aria-labelledby="tab-join" className="dg-card ol-form" onSubmit={handleJoin} noValidate>
              <div className="dg-field">
                <label htmlFor="join-code" className="dg-label">
                  <span className="ol-step">1</span>房間代碼
                </label>
                <input
                  id="join-code"
                  ref={joinCodeRef}
                  className="dg-input ol-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(cleanCode(e.target.value))}
                  placeholder="ABC123"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={8}
                  aria-invalid={error?.field === 'joinCode'}
                  aria-describedby={error?.field === 'joinCode' ? 'ol-error' : undefined}
                />
              </div>

              <div className="dg-field">
                <label htmlFor="join-name" className="dg-label">
                  <span className="ol-step">2</span>你的暱稱
                </label>
                <input
                  id="join-name"
                  ref={joinNameRef}
                  className="dg-input"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="例如：小美"
                  maxLength={16}
                  autoComplete="nickname"
                  aria-invalid={error?.field === 'joinName'}
                  aria-describedby={error?.field === 'joinName' ? 'ol-error' : undefined}
                />
              </div>

              {errorBox}

              <button type="submit" className="dg-btn dg-btn-blue dg-btn-lg dg-btn-block">
                加入房間
                <ArrowIcon />
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

export default function OnlineLobbyPage() {
  // useSearchParams 在靜態預先渲染時需要 Suspense 邊界
  return (
    <Suspense fallback={null}>
      <OnlineLobby />
    </Suspense>
  );
}
