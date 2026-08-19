'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '../../components/nav/BackButton';
import { StatusIcon } from '../../components/room/StatusIcon';

function storeIdentity(joinCode: string, displayName: string, playerId?: string) {
  sessionStorage.setItem(
    `draw-guess-party:${joinCode}`,
    JSON.stringify({ displayName, playerId })
  );
}

const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'EASY', label: '易' },
  { value: 'MEDIUM', label: '中' },
  { value: 'HARD', label: '難' },
];

const ROUND_DURATIONS = [30, 60, 90, 120];

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dg-tag"
      style={{
        cursor: 'pointer',
        background: active ? 'var(--accent)' : 'var(--paper)',
        color: active ? 'var(--paper)' : 'var(--ink)',
      }}
    >
      {children}
    </button>
  );
}

export default function OnlineLobbyPage() {
  const router = useRouter();
  const [mobileTab, setMobileTab] = useState<'create' | 'join'>('create');

  const [createName, setCreateName] = useState('');
  const [roundDurationSec, setRoundDurationSec] = useState(60);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);

  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/word-categories')
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      setError('請輸入暱稱');
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
          roundDurationSec,
          categoryFilter: selectedCategories,
          difficultyFilter: selectedDifficulties,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? '建立房間失敗');
        return;
      }
      const room = await res.json();
      // 建立房間當下只有自己一個人在裡面，直接取第一個（也是唯一一個）玩家即可，
      // 不需要「誰是房主」這種角色概念。
      const creator = room.players[0];
      storeIdentity(room.joinCode, createName.trim(), creator?.id);
      router.push(`/online/room/${room.joinCode}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = () => {
    if (!joinName.trim() || !joinCode.trim()) {
      setError('請輸入暱稱與房間代碼');
      return;
    }
    setError(null);
    storeIdentity(joinCode.trim().toUpperCase(), joinName.trim());
    router.push(`/online/room/${joinCode.trim().toUpperCase()}`);
  };

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <BackButton href="/" label="首頁" />
      </div>
      <p className="dg-eyebrow" style={{ marginBottom: 8 }}>
        線上模式
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 20 }}>建立或加入房間</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="dg-btn"
          style={{
            flex: 1,
            background: mobileTab === 'create' ? 'var(--accent)' : 'var(--paper)',
            color: mobileTab === 'create' ? 'var(--paper)' : 'var(--ink)',
          }}
          onClick={() => setMobileTab('create')}
        >
          建立房間
        </button>
        <button
          type="button"
          className="dg-btn"
          style={{
            flex: 1,
            background: mobileTab === 'join' ? 'var(--blue)' : 'var(--paper)',
            color: mobileTab === 'join' ? 'var(--paper)' : 'var(--ink)',
          }}
          onClick={() => setMobileTab('join')}
        >
          加入房間
        </button>
      </div>

      <div
        className="dg-card"
        style={{
          padding: '10px 14px',
          marginBottom: 16,
          background: 'var(--blue-soft)',
          boxShadow: 'none',
          fontSize: 13,
        }}
      >
        <strong>計分規則：</strong>猜中的人依當下剩餘時間拿 1~10 分，越早猜中分數越高；
        猜對了，畫圖者也跟著加 5 分。時間到都沒人猜中，這輪雙方都不得分。
      </div>

      {mobileTab === 'create' ? (
        <section className="dg-card" style={{ padding: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            你的暱稱
          </label>
          <input
            className="dg-input"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="例如：阿翔"
            style={{ marginBottom: 16 }}
          />

          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            每輪限時
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {ROUND_DURATIONS.map((sec) => (
              <ChipToggle
                key={sec}
                active={roundDurationSec === sec}
                onClick={() => setRoundDurationSec(sec)}
              >
                {sec} 秒
              </ChipToggle>
            ))}
          </div>

          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            分類篩選（不選代表全部）
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {categories.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>題庫目前沒有分類</span>
            )}
            {categories.map((cat) => (
              <ChipToggle
                key={cat}
                active={selectedCategories.includes(cat)}
                onClick={() => toggle(selectedCategories, setSelectedCategories, cat)}
              >
                {cat}
              </ChipToggle>
            ))}
          </div>

          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            難度篩選（不選代表全部）
          </label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {DIFFICULTIES.map((d) => (
              <ChipToggle
                key={d.value}
                active={selectedDifficulties.includes(d.value)}
                onClick={() => toggle(selectedDifficulties, setSelectedDifficulties, d.value)}
              >
                {d.label}
              </ChipToggle>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting}
            className="dg-btn dg-btn-primary dg-btn-block"
            style={{ padding: '14px 16px' }}
          >
            {submitting ? '建立中…' : '建立房間'}
          </button>
        </section>
      ) : (
        <section className="dg-card" style={{ padding: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            你的暱稱
          </label>
          <input
            className="dg-input"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="例如：小美"
            style={{ marginBottom: 16 }}
          />

          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            房間代碼
          </label>
          <input
            className="dg-input"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="6 碼代碼"
            style={{ marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.1em' }}
          />

          <button
            type="button"
            onClick={handleJoin}
            className="dg-btn dg-btn-block"
            style={{ padding: '14px 16px', background: 'var(--blue)', color: '#fff' }}
          >
            加入房間
          </button>
        </section>
      )}

      {error && (
        <div
          className="dg-card"
          style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'var(--red-soft)',
            boxShadow: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <StatusIcon kind="alert" color="var(--red)" size={32} />
          <p style={{ fontWeight: 700, fontSize: 14 }}>{error}</p>
        </div>
      )}
    </main>
  );
}
