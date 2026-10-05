'use client';

import { useEffect, useRef, useState } from 'react';
import type { GuessMessage } from '../../lib/types/round';

interface GuessChatBoxProps {
  messages: GuessMessage[];
  onSend: (text: string) => void;
  /** 畫圖者本人在自己的回合裡不能打字（避免用聊天文字提示答案），由 RoomPage 判斷後傳入 */
  disabled?: boolean;
  /** 整個聊天卡片（含輸入框）的固定高度，預設 320；跟玩家清單並排時可調整成一致高度 */
  maxHeight?: number;
}

/** 判定「使用者是否已經把聊天室捲到底」用的容許誤差（px） */
const BOTTOM_THRESHOLD = 40;

export function GuessChatBox({ messages, onSend, disabled = false, maxHeight = 320 }: GuessChatBoxProps) {
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
    <div
      className="dg-card rm-chat"
      style={{ height: maxHeight }}
    >
      <div ref={listRef} onScroll={handleScroll} className="rm-chat-list" role="log" aria-live="polite" aria-label="猜題聊天室訊息">
        {messages.length === 0 && <p className="rm-chat-empty">還沒有人發言，搶頭香吧</p>}
        {messages.map((m) => (
          <div key={m.id} className={`rm-msg${m.isCorrectGuess ? ' is-correct' : ''}`}>
            <span className="rm-msg-who">{m.displayName}</span>
            <span className="rm-msg-text">{m.isCorrectGuess ? '猜對了！' : m.text}</span>
          </div>
        ))}
      </div>
      <div className="rm-chat-form">
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // 中文輸入法（注音、拼音、倉頡……任何需要候選字的輸入法）在組字
            // 過程中，使用者按 Enter 是為了「確認選字」，不是要送出——如果
            // 沒有排除這個狀態，Enter 鍵會被誤判成「使用者要送出」，把還
            // 沒組字完成的片段（例如注音符號本身）直接送出，使用者體驗被
            // 打斷、還要重新輸入一次，嚴重的話甚至可能因此拖到逾時。
            // e.nativeEvent.isComposing 是瀏覽器原生提供的 IME 組字狀態旗標，
            // 組字進行中是 true，這裡排除掉，只有真的按下 Enter 送出（不是
            // 選字用的 Enter）才觸發。
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit();
          }}
          placeholder={disabled ? '輪到你畫圖，不能發言' : '輸入猜題或聊天內容'}
          className="dg-input"
          style={{ flex: 1 }}
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
