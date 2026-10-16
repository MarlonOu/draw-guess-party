'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** 首頁的「有代碼直接加入」：不用先進 /online 再切分頁，少一步。 */
export function QuickJoin() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/online?tab=join&code=${encodeURIComponent(clean)}`);
  };

  return (
    <form className="hm-quickjoin" onSubmit={submit}>
      <label htmlFor="quick-code" className="dg-sr-only">
        房間代碼
      </label>
      <input
        id="quick-code"
        ref={inputRef}
        className="dg-input hm-quickjoin-input"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
        placeholder="已有房間代碼？"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={8}
        inputMode="text"
      />
      <button type="submit" className="dg-btn dg-btn-ink">
        加入
        <svg className="dg-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
