'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SwitchRoomButtonProps {
  /** 目前所在的房間代碼 */
  joinCode: string;
  /** 房間狀態：遊戲進行中離開要多一行提醒 */
  status: 'lobby' | 'playing' | 'finished';
  /** 離開目前房間（送 room:leave，伺服器立刻移除這位玩家） */
  leaveRoom: () => void;
}

const MODE_NAME: Record<string, string> = {
  DRAW_GUESS: '你畫我猜',
  DRAW_TELEPHONE: '畫圖接龍',
  FRAGMENT_DRAW: '拼圖接畫',
};

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

function readName(joinCode: string): string {
  try {
    const raw = sessionStorage.getItem(`draw-guess-party:${joinCode}`);
    return raw ? (JSON.parse(raw).displayName ?? '') : '';
  } catch {
    return '';
  }
}

function SwapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </svg>
  );
}

/**
 * 「換房間」：三種玩法的房間畫面共用。
 * 流程：輸入新的房間代碼 → 先查目標房間（GET /api/rooms/:code）確認存在且可加入 →
 * 才離開目前房間、帶著同一個暱稱進新房間。順序不能反過來——先離開再查，
 * 輸錯代碼就會把人白白踢出原本的房間。
 * 也可以「建立新房間」：離開目前房間後回到建房頁。
 */
export function SwitchRoomButton({ joinCode, status, leaveRoom }: SwitchRoomButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [target, setTarget] = useState<{ mode: string; playerCount: number } | null>(null);

  // 對話框關閉（Esc、點取消）時清掉輸入與錯誤
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const onClose = () => {
      setCode('');
      setError(null);
      setTarget(null);
      setChecking(false);
    };
    dlg.addEventListener('close', onClose);
    return () => dlg.removeEventListener('close', onClose);
  }, []);

  const open = () => {
    dialogRef.current?.showModal();
    inputRef.current?.focus();
  };
  const close = () => dialogRef.current?.close();

  const goToRoom = (newCode: string) => {
    const name = readName(joinCode);
    try {
      sessionStorage.setItem(`draw-guess-party:${newCode}`, JSON.stringify({ displayName: name }));
    } catch {
      /* 寫不進去時，新房間頁會顯示輸入暱稱的表單 */
    }
    leaveRoom();
    close();
    router.push(`/online/room/${newCode}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = code.trim();
    if (!next) {
      setError('請輸入要加入的房間代碼');
      inputRef.current?.focus();
      return;
    }
    if (next === joinCode) {
      setError('你已經在這個房間了');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(next)}`);
      const data = await res.json().catch(() => null);
      if (!data?.exists) {
        setError('找不到這個房間代碼，請再確認一次');
        inputRef.current?.focus();
        return;
      }
      if (!data.joinable) {
        setError(data.reason ?? '這個房間目前無法加入');
        return;
      }
      setTarget({ mode: data.mode, playerCount: data.playerCount });
      goToRoom(next);
    } catch {
      setError('網路連線有問題，沒有離開目前的房間，請稍後再試');
    } finally {
      setChecking(false);
    }
  };

  const handleCreate = () => {
    leaveRoom();
    close();
    router.push('/online?tab=create');
  };

  return (
    <>
      <button type="button" className="dg-btn dg-btn-sm rm-switch-btn" onClick={open} aria-haspopup="dialog">
        <SwapIcon />
        <span>換房間</span>
      </button>

      <dialog ref={dialogRef} className="dg-card rm-dialog" aria-labelledby={titleId}>
        <form onSubmit={handleSubmit} noValidate className="rm-dialog-body">
          <h2 id={titleId} className="rm-dialog-title">換到其他房間</h2>
          <p className="dg-hint">
            目前在房間 <strong>{joinCode}</strong>。輸入朋友給你的房間代碼，會用同一個暱稱加入。
          </p>

          <div className="dg-field">
            <label htmlFor={`${titleId}-code`} className="dg-label">新的房間代碼</label>
            <input
              id={`${titleId}-code`}
              ref={inputRef}
              className="dg-input ol-code"
              value={code}
              onChange={(e) => {
                setCode(cleanCode(e.target.value));
                setError(null);
              }}
              placeholder="ABC123"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              aria-invalid={error !== null}
              aria-describedby={error ? errId : undefined}
            />
          </div>

          {error && (
            <p id={errId} className="rm-dialog-error" role="alert">
              {error}
            </p>
          )}
          {status === 'playing' && (
            <p className="rm-dialog-warn">這場遊戲還在進行中，離開後你這一輪會被視為退出，分數也不會保留。</p>
          )}
          {target && (
            <p className="dg-hint">
              {MODE_NAME[target.mode] ?? '新房間'}・目前 {target.playerCount} 人，正在前往…
            </p>
          )}

          <div className="rm-dialog-actions">
            <button type="submit" className="dg-btn dg-btn-blue" disabled={checking}>
              {checking ? '確認中…' : '加入這個房間'}
            </button>
            <button type="button" className="dg-btn" onClick={handleCreate}>
              建立新房間
            </button>
            <button type="button" className="dg-btn dg-btn-ghost" onClick={close}>
              取消
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
