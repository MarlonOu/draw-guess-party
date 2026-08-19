'use client';

import { useEffect, useState } from 'react';
import type { WordBankEntry, WordDifficulty } from '../../lib/types/word';
import { BackButton } from '../../components/nav/BackButton';

const DIFFICULTY_LABEL: Record<WordDifficulty, string> = {
  EASY: '易',
  MEDIUM: '中',
  HARD: '難',
};

interface EditState {
  text: string;
  category: string;
  difficulty: WordDifficulty;
}

export default function AdminWordsPage() {
  const [words, setWords] = useState<WordBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDifficulty, setNewDifficulty] = useState<WordDifficulty>('MEDIUM');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/words');
      if (!res.ok) throw new Error('讀取題庫失敗');
      const data = await res.json();
      setWords(data.words);
    } catch {
      setError('讀取題庫失敗，請重新整理');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時讀取遠端資料，非同步呼叫，非直接同步 setState
    void load();
  }, []);

  const handleCreate = async () => {
    if (!newText.trim() || !newCategory.trim()) {
      setError('題目與分類不可為空白');
      return;
    }
    const res = await fetch('/api/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText, category: newCategory, difficulty: newDifficulty }),
    });
    if (!res.ok) {
      setError('新增失敗');
      return;
    }
    setNewText('');
    setNewCategory('');
    setError(null);
    load();
  };

  const startEdit = (word: WordBankEntry) => {
    setEditingId(word.id);
    setEditState({ text: word.text, category: word.category, difficulty: word.difficulty });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = async (id: string) => {
    if (!editState) return;
    const res = await fetch(`/api/words/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editState),
    });
    if (!res.ok) {
      setError('更新失敗');
      return;
    }
    cancelEdit();
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個題目嗎？')) return;
    const res = await fetch(`/api/words/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('刪除失敗');
      return;
    }
    load();
  };

  const handleImport = async () => {
    if (!csvText.trim()) return;
    const res = await fetch('/api/words/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText }),
    });
    if (!res.ok) {
      setImportResult('匯入失敗');
      return;
    }
    const data = await res.json();
    setImportResult(`新增 ${data.created} 筆，略過重複 ${data.skipped} 筆`);
    setCsvText('');
    load();
  };

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <BackButton href="/" label="首頁" />
      </div>
      <p className="dg-eyebrow" style={{ marginBottom: 8 }}>
        管理後台
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 24 }}>題庫管理</h1>

      {error && (
        <div
          className="dg-card"
          style={{ padding: 12, marginBottom: 16, background: 'var(--red-soft)' }}
        >
          {error}
        </div>
      )}

      <section className="dg-card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>新增題目</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="dg-input"
            style={{ flex: '1 1 160px' }}
            placeholder="題目（例如：長頸鹿）"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <input
            className="dg-input"
            style={{ flex: '1 1 120px' }}
            placeholder="分類（例如：動物）"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <select
            className="dg-input"
            style={{ flex: '0 1 100px' }}
            value={newDifficulty}
            onChange={(e) => setNewDifficulty(e.target.value as WordDifficulty)}
          >
            <option value="EASY">易</option>
            <option value="MEDIUM">中</option>
            <option value="HARD">難</option>
          </select>
          <button type="button" className="dg-btn dg-btn-primary" onClick={handleCreate}>
            新增
          </button>
        </div>
      </section>

      <section className="dg-card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>批次匯入</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
          每行一筆，格式：<code>題目,分類,難度</code>（難度可省略，預設「中」），已存在的
          題目+分類組合會自動略過。
        </p>
        <textarea
          className="dg-input"
          style={{ minHeight: 100, fontFamily: 'monospace', fontSize: 13, marginBottom: 8 }}
          placeholder={'貓熊,動物,EASY\n壽司,食物\n打鐵趁熱,成語,HARD'}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button type="button" className="dg-btn" onClick={handleImport}>
          匯入
        </button>
        {importResult && (
          <span style={{ marginLeft: 12, fontSize: 14, color: 'var(--ink-soft)' }}>
            {importResult}
          </span>
        )}
      </section>

      <section className="dg-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
          題庫列表（共 {words.length} 題）
        </h2>

        {loading ? (
          <p>載入中…</p>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '2px solid var(--ink)',
                    textAlign: 'left',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--paper)',
                  }}
                >
                  <th style={{ padding: '8px 6px' }}>題目</th>
                  <th style={{ padding: '8px 6px' }}>分類</th>
                  <th style={{ padding: '8px 6px' }}>難度</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {words.map((word) => (
                  <tr key={word.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    {editingId === word.id && editState ? (
                      <>
                        <td style={{ padding: '6px' }}>
                          <input
                            className="dg-input"
                            style={{ padding: '6px 8px' }}
                            value={editState.text}
                            onChange={(e) =>
                              setEditState({ ...editState, text: e.target.value })
                            }
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            className="dg-input"
                            style={{ padding: '6px 8px' }}
                            value={editState.category}
                            onChange={(e) =>
                              setEditState({ ...editState, category: e.target.value })
                            }
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <select
                            className="dg-input"
                            style={{ padding: '6px 8px' }}
                            value={editState.difficulty}
                            onChange={(e) =>
                              setEditState({
                                ...editState,
                                difficulty: e.target.value as WordDifficulty,
                              })
                            }
                          >
                            <option value="EASY">易</option>
                            <option value="MEDIUM">中</option>
                            <option value="HARD">難</option>
                          </select>
                        </td>
                        <td style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="dg-btn"
                            style={{ padding: '6px 10px', marginRight: 6 }}
                            onClick={() => saveEdit(word.id)}
                          >
                            儲存
                          </button>
                          <button
                            type="button"
                            className="dg-btn"
                            style={{ padding: '6px 10px' }}
                            onClick={cancelEdit}
                          >
                            取消
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ padding: '8px 6px' }}>{word.text}</td>
                        <td style={{ padding: '8px 6px' }}>
                          <span className="dg-tag">{word.category}</span>
                        </td>
                        <td style={{ padding: '8px 6px' }}>
                          {DIFFICULTY_LABEL[word.difficulty]}
                        </td>
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="dg-btn"
                            style={{ padding: '6px 10px', marginRight: 6 }}
                            onClick={() => startEdit(word)}
                          >
                            編輯
                          </button>
                          <button
                            type="button"
                            className="dg-btn"
                            style={{ padding: '6px 10px' }}
                            onClick={() => handleDelete(word.id)}
                          >
                            刪除
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
