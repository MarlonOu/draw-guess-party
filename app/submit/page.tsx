'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BackButton } from '../../components/nav/BackButton';
import { StatusIcon } from '../../components/room/StatusIcon';
import type { DuplicateCheckResult } from '../../lib/types/submission';
import type { WordDifficulty } from '../../lib/types/word';

const DIFFICULTIES: { value: WordDifficulty; label: string; hint: string }[] = [
  { value: 'EASY', label: '易', hint: '一眼就知道怎麼畫，例如：太陽' },
  { value: 'MEDIUM', label: '中', hint: '要想一下怎麼表現，例如：腳踏車' },
  { value: 'HARD', label: '難', hint: '抽象或要靠創意，例如：時間' },
];

const MAX_TEXT = 20;
const MAX_CATEGORY = 12;

type Phase = 'form' | 'done';

export default function SubmitPage() {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<WordDifficulty>('MEDIUM');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState(''); // 蜜罐：真人看不到、不會填

  const [categories, setCategories] = useState<string[]>([]);
  const [check, setCheck] = useState<DuplicateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmSimilar, setConfirmSimilar] = useState(false);

  const [phase, setPhase] = useState<Phase>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; field?: 'text' | 'category' } | null>(null);

  const textRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/word-categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  // 輸入題目時即時查重：停手 350ms 後才送，且只採用「最後一次請求」的結果
  const trimmed = text.trim();
  useEffect(() => {
    if (!trimmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 輸入清空時重置查重狀態，是對外部輸入的同步，非衍生渲染狀態
      setCheck(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/word-submissions/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        });
        const data: DuplicateCheckResult = await res.json();
        if (!cancelled) {
          setCheck(data);
          setConfirmSimilar(false);
        }
      } catch {
        if (!cancelled) setCheck(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const blocked = check?.verdict === 'blocked';
  const needsConfirm = check?.verdict === 'warning';

  const fail = (message: string, field?: 'text' | 'category') => {
    setError({ message, field });
    (field === 'category' ? categoryRef : textRef).current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return fail('請輸入題目', 'text');
    if (!category.trim()) return fail('請選一個分類，或輸入新的分類', 'category');
    if (blocked) return fail('這個題目已經有了，換一個吧', 'text');
    if (needsConfirm && !confirmSimilar) return fail('有相近的題目，請先確認下方的提醒再送出', 'text');

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/word-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmed,
          category: category.trim(),
          difficulty,
          submitterName: name.trim(),
          note: note.trim(),
          confirmSimilar,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPhase('done');
        return;
      }
      if (data?.check) setCheck(data.check); // 伺服器查重結果比前端的即時查重新，以它為準
      fail(data?.error ?? '投稿失敗，請稍後再試', res.status === 400 ? undefined : 'text');
    } catch {
      fail('網路連線有問題，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setText('');
    setNote('');
    setCheck(null);
    setConfirmSimilar(false);
    setError(null);
    setPhase('form');
    setTimeout(() => textRef.current?.focus(), 0);
  };

  if (phase === 'done') {
    return (
      <main id="main" className="ol-wrap">
        <div className="ol-top dg-in">
          <BackButton href="/" label="首頁" />
        </div>
        <div className="dg-card dg-taped sb-done" style={{ ['--tape-tilt' as string]: '-3deg' }}>
          <StatusIcon kind="megaphone" color="var(--green)" size={56} />
          <h1 className="ol-h1" style={{ fontSize: 'clamp(1.6rem, 6vw, 2.4rem)' }}>投稿成功！</h1>
          <p className="dg-lead">管理員審核通過後，「{trimmed}」就會出現在題庫裡。</p>
          <div className="sb-done-actions">
            <button type="button" className="dg-btn dg-btn-primary" onClick={reset}>
              再投一題
            </button>
            <Link href="/" className="dg-btn">
              回首頁
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="ol-wrap">
      <div className="ol-top dg-in">
        <BackButton href="/" label="首頁" />
      </div>

      <header className="ol-head dg-in" style={{ ['--i' as string]: 1 }}>
        <p className="dg-eyebrow">題庫共創</p>
        <h1 className="ol-h1">投稿你想畫的題目</h1>
      </header>

      <div className="ol-grid">
        <aside className="ol-aside dg-in" style={{ ['--i' as string]: 2 }}>
          <div className="dg-card dg-taped ol-preview" style={{ ['--tape-tilt' as string]: '3deg' }}>
            <h2 className="ol-preview-name">什麼是好題目？</h2>
            <ul className="ol-rules">
              <li>畫得出來，也猜得到：具體的東西、動作、成語、場景都很適合。</li>
              <li>最多 {MAX_TEXT} 個字，越短越好猜。</li>
              <li>不要放個人資料、不當或冒犯他人的內容。</li>
              <li>送出前系統會幫你比對題庫，避免重複。</li>
              <li>管理員審核通過後才會進題庫，不會馬上出現。</li>
            </ul>
          </div>
        </aside>

        <section className="ol-panel dg-in" style={{ ['--i' as string]: 3 }}>
          <form className="dg-card ol-form" onSubmit={handleSubmit} noValidate>
            <div className="dg-field">
              <label htmlFor="sb-text" className="dg-label"><span className="ol-step">1</span>題目</label>
              <input
                id="sb-text"
                ref={textRef}
                className="dg-input"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                placeholder="例如：熱氣球"
                maxLength={MAX_TEXT}
                autoComplete="off"
                aria-invalid={error?.field === 'text' || blocked}
                aria-describedby="sb-check"
              />

              {/* 即時查重結果：aria-live 讓讀屏使用者也知道狀態 */}
              <div id="sb-check" className="sb-check" aria-live="polite">
                {trimmed && checking && <p className="dg-hint">比對題庫中…</p>}
                {trimmed && !checking && check?.verdict === 'ok' && (
                  <p className="sb-ok">題庫裡沒有這題，可以投稿。</p>
                )}
                {!checking && check && check.verdict !== 'ok' && (
                  <div className={`sb-warn ${blocked ? 'sb-warn-block' : ''}`}>
                    <p className="sb-warn-title">
                      {blocked ? '這題已經有了，不能重複投稿' : '有相近的題目，請確認不是同一題'}
                    </p>
                    <ul>
                      {check.matches.map((m, i) => (
                        <li key={i}>
                          {m.kind === 'exact' && <>題庫已有「{m.text}」（{m.category}）</>}
                          {m.kind === 'pending' && <>已經有人投稿「{m.text}」，審核中</>}
                          {m.kind === 'similar' && <>相近：「{m.text}」（{m.category}）</>}
                          {m.kind === 'rejected' && <>這題以前被退回過{m.reason ? `：${m.reason}` : ''}</>}
                        </li>
                      ))}
                    </ul>
                    {needsConfirm && (
                      <label className="sb-confirm">
                        <input type="checkbox" checked={confirmSimilar} onChange={(e) => setConfirmSimilar(e.target.checked)} />
                        <span>我確認不一樣，仍要投稿</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="dg-field">
              <span className="dg-label" id="sb-cat-label"><span className="ol-step">2</span>分類</span>
              <div className="ol-chips" role="group" aria-labelledby="sb-cat-label">
                {categories.map((c) => (
                  <button key={c} type="button" className="dg-chip" aria-pressed={category === c} onClick={() => { setCategory(c); setError(null); }}>
                    {c}
                  </button>
                ))}
              </div>
              <input
                ref={categoryRef}
                className="dg-input"
                value={category}
                onChange={(e) => { setCategory(e.target.value); setError(null); }}
                placeholder="或輸入新的分類"
                maxLength={MAX_CATEGORY}
                aria-label="分類（可直接輸入新分類）"
                aria-invalid={error?.field === 'category'}
              />
            </div>

            <div className="dg-field">
              <span className="dg-label" id="sb-diff-label"><span className="ol-step">3</span>你覺得難度</span>
              <div className="ol-chips" role="group" aria-labelledby="sb-diff-label">
                {DIFFICULTIES.map((d) => (
                  <button key={d.value} type="button" className="dg-chip" aria-pressed={difficulty === d.value} onClick={() => setDifficulty(d.value)}>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="dg-hint">{DIFFICULTIES.find((d) => d.value === difficulty)?.hint}</p>
            </div>

            <div className="dg-field">
              <label htmlFor="sb-name" className="dg-label">你的暱稱（選填）</label>
              <input id="sb-name" className="dg-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="nickname" placeholder="讓審核者知道是誰投的" />
            </div>

            <div className="dg-field">
              <label htmlFor="sb-note" className="dg-label">備註（選填）</label>
              <input id="sb-note" className="dg-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="例如：可以畫一顆有籃子的氣球" />
            </div>

            {/* 蜜罐：用 CSS 移出畫面，不用 display:none（有些機器人會跳過 display:none 的欄位） */}
            <div className="sb-hp" aria-hidden="true">
              <label>
                網站
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            {error && (
              <div className="dg-notice" role="alert">
                <StatusIcon kind="alert" color="var(--red)" size={36} />
                <span>{error.message}</span>
              </div>
            )}

            <button type="submit" disabled={submitting || blocked} className="dg-btn dg-btn-primary dg-btn-lg dg-btn-block">
              {submitting ? '送出中…' : '送出投稿'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
