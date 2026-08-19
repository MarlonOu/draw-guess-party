'use client';

import { useEffect, useRef, useState } from 'react';
import type { GuessMessage } from '../../lib/types/round';

interface GuessChatBoxProps {
  messages: GuessMessage[];
  onSend: (text: string) => void;
  /** 畫圖者本人在自己的回合裡不能打字（避免用聊天文字提示答案），由 RoomPage 判斷後傳入 */
  disabled?: boolean;
}

/** 判定「使用者是否已經把聊天室捲到底」用的容許誤差（px） */
const BOTTOM_THRESHOLD = 40;

export function GuessChatBox({ messages, onSend, disabled = false }: GuessChatBoxProps) {
  const [value, setValue] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  /** 記錄「使用者上次手動捲動後，是否已經在底部」，只有這樣才在新訊息進來時自動幫忙捲到底；
   *  如果使用者往上捲在看歷史訊息，新訊息進來不會把畫面硬拉走。 */
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSubmit = () => {
    if (disabled) return;
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue('');
  };

  return (
    <div className="dg-card" style={{ display: 'flex', flexDirection: 'column', height: 320 }}>
      <div ref={listRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {messages.length === 0 && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>還沒有人發言，搶頭香吧</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              padding: '6px 8px',
              borderRadius: 8,
              marginBottom: 4,
              background: m.isCorrectGuess ? 'var(--green-soft)' : 'transparent',
              color: m.isCorrectGuess ? 'var(--green)' : 'var(--ink)',
              fontWeight: m.isCorrectGuess ? 800 : 400,
            }}
          >
            <span style={{ color: 'var(--ink-soft)', fontWeight: 700 }}>{m.displayName}：</span>
            {m.isCorrectGuess ? '猜對了！' : m.text}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '2px solid var(--ink)' }}>
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder={disabled ? '輪到你畫圖，不能發言' : '輸入猜題或聊天內容'}
          className="dg-input"
          style={{ flex: 1, padding: '8px 12px', opacity: disabled ? 0.5 : 1 }}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          className="dg-btn dg-btn-primary"
        >
          送出
        </button>
      </div>
    </div>
  );
}
