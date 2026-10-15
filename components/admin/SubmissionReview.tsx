'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DuplicateCheckResult, SubmissionStatus, WordSubmission } from '../../lib/types/submission';
import type { WordDifficulty } from '../../lib/types/word';

type AdminSubmission = WordSubmission & { check?: DuplicateCheckResult };
type Counts = Record<SubmissionStatus, number>;
type Tab = 'pending' | 'approved' | 'rejected';

const DIFFICULTY_LABEL: Record<WordDifficulty, string> = { EASY: '易', MEDIUM: '中', HARD: '難' };
const TAB_LABEL: Record<Tab, string> = { pending: '待審', approved: '已通過', rejected: '已退回' };

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

interface Draft {
  text: string;
  category: string;
  difficulty: WordDifficulty;
}

/**
 * 題庫管理後台的「投稿審核」區塊。
 * 待審的每一筆都附有伺服器即時查重的結果（跟題庫完全相同／相近／已有人投稿／曾被退回），
 * 審核者不需要自己去題庫列表搜尋比對。通過時可以先修改文字、分類與難度。
 */
export function SubmissionReview({ onWordBankChanged }: { onWordBankChanged: () => void }) {
  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, removed: 0 });
  const [categories, setCategories] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [subRes, catRes] = await Promise.all([fetch('/api/admin/submissions'), fetch('/api/word-categories')]);
      if (!subRes.ok) throw new Error();
      const data = await subRes.json();
      setItems(data.submissions);
      setCounts(data.counts);
      const cats = await catRes.json().catch(() => ({ categories: [] }));
      setCategories(cats.categories ?? []);
      setError(null);
    } catch {
      setError('讀取投稿失敗，請重新整理');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時讀取遠端資料，非同步呼叫
    void load();
  }, [load]);

  const visible = useMemo(() => items.filter((s) => s.status === tab), [items, tab]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? '操作失敗');
        return false;
      }
      await load();
      if (body.action === 'approve') onWordBankChanged();
      return true;
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (s: AdminSubmission) => {
    const body: Record<string, unknown> = { action: 'approve' };
    if (editingId === s.id && draft) Object.assign(body, draft);
    if (await patch(s.id, body)) {
      setEditingId(null);
      setDraft(null);
    }
  };

  const reject = async (s: AdminSubmission, reason: string) => {
    if (await patch(s.id, { action: 'reject', reason })) {
      setRejectingId(null);
      setRejectReason('');
    }
  };

  const removeRecord = async (id: string) => {
    if (!confirm('刪除這筆審核紀錄？（不會影響已經在題庫裡的題目）')) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!res.ok) setError('刪除失敗');
    else await load();
  };

  const bankDuplicates = items.filter(
    (s) => s.status === 'pending' && s.check?.matches.some((m) => m.kind === 'exact' && m.source === 'bank')
  );

  const rejectAllBankDuplicates = async () => {
    if (!confirm(`把 ${bankDuplicates.length} 筆「題庫已有」的待審投稿全部退回？`)) return;
    for (const s of bankDuplicates) {
      await patch(s.id, { action: 'reject', reason: '題庫已有相同題目' });
    }
  };

  return (
    <section className="dg-card adm-sub" aria-labelledby="adm-sub-title">
      <div className="adm-sub-head">
        <h2 id="adm-sub-title" className="adm-h2">
          投稿審核
          {counts.pending > 0 && <span className="adm-badge" aria-label={`${counts.pending} 筆待審`}>{counts.pending}</span>}
        </h2>
        <div className="dg-seg adm-tabs" role="tablist" aria-label="投稿狀態" style={{ ['--n' as string]: 3, ['--idx' as string]: ['pending', 'approved', 'rejected'].indexOf(tab) }}>
          <span className="dg-seg-thumb" aria-hidden="true" />
          {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {TAB_LABEL[t]} {counts[t]}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="dg-notice" role="alert">{error}</div>}

      {tab === 'pending' && bankDuplicates.length > 0 && (
        <div className="adm-bulk">
          <span>有 {bankDuplicates.length} 筆待審投稿跟題庫完全重複。</span>
          <button type="button" className="dg-btn dg-btn-sm" onClick={rejectAllBankDuplicates} disabled={busyId !== null}>
            全部退回
          </button>
        </div>
      )}

      {loading ? (
        <p>載入中…</p>
      ) : visible.length === 0 ? (
        <p className="adm-empty">{tab === 'pending' ? '目前沒有待審的投稿。' : '沒有紀錄。'}</p>
      ) : (
        <ul className="adm-list">
          {visible.map((s) => {
            const isEditing = editingId === s.id && draft;
            const bankExact = s.check?.matches.find((m) => m.kind === 'exact' && m.source === 'bank');
            return (
              <li key={s.id} className="adm-item">
                <div className="adm-item-main">
                  {isEditing ? (
                    <div className="adm-edit">
                      <input className="dg-input" aria-label="題目" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
                      <input className="dg-input" aria-label="分類" list="adm-cats" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                      <select className="dg-input" aria-label="難度" value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as WordDifficulty })}>
                        <option value="EASY">易</option>
                        <option value="MEDIUM">中</option>
                        <option value="HARD">難</option>
                      </select>
                    </div>
                  ) : (
                    <p className="adm-item-text">
                      <strong>{s.text}</strong>
                      <span className="dg-tag">{s.category}</span>
                      <span className="dg-tag">難度 {DIFFICULTY_LABEL[s.difficulty]}</span>
                    </p>
                  )}
                  <p className="adm-item-meta">
                    {formatTime(s.createdAt)}
                    {s.submitterName && `・${s.submitterName}`}
                    {s.note && `・備註：${s.note}`}
                    {s.status === 'rejected' && s.rejectReason && `・退回理由：${s.rejectReason}`}
                  </p>

                  {s.status === 'pending' && s.check && s.check.matches.length > 0 && (
                    <ul className="adm-flags" aria-label="查重結果">
                      {s.check.matches.map((m, i) => (
                        <li key={i} className={`adm-flag adm-flag-${m.kind}`}>
                          {m.kind === 'exact' && `題庫已有「${m.text}」（${m.category}）`}
                          {m.kind === 'pending' && `另一筆待審投稿也是「${m.text}」`}
                          {m.kind === 'similar' && `相近：「${m.text}」（${m.category}${m.source === 'submission' ? '・待審' : ''}）`}
                          {m.kind === 'rejected' && `曾被退回${m.reason ? `：${m.reason}` : ''}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="adm-item-actions">
                  {s.status === 'pending' && rejectingId !== s.id && (
                    <>
                      <button
                        type="button"
                        className="dg-btn dg-btn-sm dg-btn-mint"
                        disabled={busyId === s.id || (!!bankExact && !isEditing)}
                        title={bankExact ? '題庫已有相同題目，請退回，或先編輯成不同的題目' : undefined}
                        onClick={() => approve(s)}
                      >
                        {isEditing ? '儲存並通過' : '通過'}
                      </button>
                      <button
                        type="button"
                        className="dg-btn dg-btn-sm"
                        onClick={() => {
                          if (isEditing) {
                            setEditingId(null);
                            setDraft(null);
                          } else {
                            setEditingId(s.id);
                            setDraft({ text: s.text, category: s.category, difficulty: s.difficulty });
                          }
                        }}
                      >
                        {isEditing ? '取消編輯' : '編輯'}
                      </button>
                      <button
                        type="button"
                        className="dg-btn dg-btn-sm"
                        onClick={() => {
                          setRejectingId(s.id);
                          setRejectReason(bankExact ? '題庫已有相同題目' : '');
                        }}
                      >
                        退回
                      </button>
                    </>
                  )}

                  {s.status === 'pending' && rejectingId === s.id && (
                    <div className="adm-reject">
                      <input
                        className="dg-input"
                        aria-label="退回理由（選填）"
                        placeholder="退回理由（選填）"
                        maxLength={80}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        autoFocus
                      />
                      <button type="button" className="dg-btn dg-btn-sm" disabled={busyId === s.id} onClick={() => reject(s, rejectReason)}>
                        確定退回
                      </button>
                      <button type="button" className="dg-btn dg-btn-sm dg-btn-ghost" onClick={() => setRejectingId(null)}>
                        取消
                      </button>
                    </div>
                  )}

                  {s.status !== 'pending' && (
                    <button type="button" className="dg-btn dg-btn-sm dg-btn-ghost" disabled={busyId === s.id} onClick={() => removeRecord(s.id)}>
                      刪除紀錄
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <datalist id="adm-cats">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </section>
  );
}
