interface TimerProps {
  remainingSec: number;
  timeLimitSec: number;
}

/**
 * 倒數橫條，放在畫布正上方。remainingSec 由前端本地計算（見 RoomPage），
 * 只是「跟伺服器的限時計時器大致同步」的估計值，不是伺服器逐秒推播，
 * 誤差在一般網路延遲下感覺不出來，避免為了一個進度條增加太多 WebSocket 流量。
 */
export function RoundTimer({ remainingSec, timeLimitSec }: TimerProps) {
  const ratio = timeLimitSec > 0 ? remainingSec / timeLimitSec : 0;
  const urgent = ratio <= 0.3;

  return (
    <div
      className="dg-card"
      style={{ padding: '8px 12px', marginBottom: 10, boxShadow: 'none', border: '2px solid var(--ink)' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        <span>剩餘時間</span>
        <span style={{ color: urgent ? 'var(--red)' : 'var(--ink)' }}>{Math.max(0, remainingSec)}s</span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 6,
          background: 'var(--line)',
          overflow: 'hidden',
          border: '1px solid var(--ink)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
            background: urgent ? 'var(--red)' : 'var(--accent)',
            transition: 'width 1s linear, background 0.3s',
          }}
        />
      </div>
    </div>
  );
}
