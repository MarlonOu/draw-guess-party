import Link from 'next/link';

export default function Home() {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <p className="dg-eyebrow" style={{ marginBottom: 12 }}>
          派對遊戲
        </p>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: 12,
          }}
        >
          畫圖猜謎派對
        </h1>
        <p style={{ fontSize: 17, color: 'var(--ink-soft)', marginBottom: 32 }}>
          一人畫、大家猜。房間代碼分享給朋友，手機也能玩。
        </p>

        <svg
          viewBox="0 0 200 120"
          width="100%"
          height="120"
          style={{ marginBottom: 32, display: 'block' }}
          aria-hidden="true"
        >
          <path
            d="M20 90 Q 50 20, 90 60 T 170 40"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="20" cy="90" r="6" fill="var(--ink)" />
          <circle cx="170" cy="40" r="6" fill="var(--blue)" />
        </svg>

        <Link
          href="/online"
          className="dg-btn dg-btn-primary dg-btn-block"
          style={{ padding: '16px 20px', fontSize: 17 }}
        >
          開始遊戲
        </Link>
      </div>
    </main>
  );
}
