'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CopyButton } from './CopyButton';

/**
 * 房間「入場券」：三種模式的 lobby 共用（取代原本各自重複的代碼／連結／QR 區塊）。
 * 左半是大字房間代碼與複製按鈕，右半是撕下來的票根——直接攤開的 QR code，
 * 現場分享時朋友拿手機一掃就進來，不用再多點一次才看得到。
 */
export function RoomTicket({ joinCode, url }: { joinCode: string; url: string }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 280, margin: 1, color: { dark: '#1b1a2e', light: '#ffffff' } })
      .then((d) => {
        if (!cancelled) setQr(d);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <section className="rm-ticket" aria-label="房間入場券">
      <div className="rm-ticket-main">
        <p className="rm-ticket-label">ROOM CODE · 房間代碼</p>
        <p className="rm-ticket-code" aria-label={`房間代碼 ${joinCode.split('').join(' ')}`}>
          {joinCode}
        </p>
        <div className="rm-ticket-actions">
          <CopyButton value={joinCode} label="複製房間代碼" text="複製代碼" />
          {url && <CopyButton value={url} label="複製邀請連結" text="複製連結" />}
        </div>
      </div>
      <div className="rm-ticket-stub">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- 動態產生的 data URL，不適用 next/image
          <img src={qr} alt="房間邀請連結的 QR code，用手機相機掃描即可加入" width={140} height={140} />
        ) : (
          <span className="rm-ticket-qrph" aria-hidden="true" />
        )}
        <p>掃碼加入</p>
      </div>
    </section>
  );
}
