'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { pushLog } from '../lib/client/clientLog';
import { ReportButton } from '../components/feedback/ReportButton';

/** 頁面發生未預期錯誤時的畫面：可以重試，也可以直接把錯誤連同操作紀錄回報 */
export default function GlobalRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    pushLog('error', `頁面錯誤：${error.name}: ${error.message}${error.digest ? ` (digest ${error.digest})` : ''}`);
  }, [error]);

  return (
    <main id="main" className="dg-page" style={{ maxWidth: 560, margin: '0 auto', padding: 24, width: '100%' }}>
      <section className="dg-card" style={{ padding: 24, marginTop: 40 }}>
        <h1 className="ol-h1" style={{ marginBottom: 12 }}>這一頁出了點問題</h1>
        <p className="dg-hint" style={{ marginBottom: 18 }}>
          抱歉，頁面發生了未預期的錯誤。可以先重試；如果一直發生，請回報給我們，會自動附上錯誤資訊。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button type="button" className="dg-btn dg-btn-primary" onClick={reset}>
            重試
          </button>
          <ReportButton
            variant="inline"
            label="回報這個錯誤"
            prefill={{ category: 'bug', message: `頁面發生錯誤：${error.message}`.slice(0, 300) }}
          />
          <Link className="dg-btn dg-btn-ghost" href="/">
            回首頁
          </Link>
        </div>
      </section>
    </main>
  );
}
