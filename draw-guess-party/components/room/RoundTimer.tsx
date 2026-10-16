interface TimerProps {
  remainingSec: number;
  timeLimitSec: number;
}

/**
 * 倒數橫條，放在畫布正上方。remainingSec 由前端本地計算（見 RoomPage），
 * 只是「跟伺服器的限時計時器大致同步」的估計值，不是伺服器逐秒推播，
 * 誤差在一般網路延遲下感覺不出來，避免為了一個進度條增加太多 WebSocket 流量。
 *
 * 視覺：一支鉛筆沿著橫條往左「寫完」——填滿的墨條末端是鉛筆尖。剩 30% 以下
 * 變紅、數字加粗並輕微跳動（只在緊急時，非裝飾性循環動畫）。
 * 以 role="progressbar" 提供剩餘秒數給輔助科技，避免每秒播報，只在數值變化時更新屬性。
 */
export function RoundTimer({ remainingSec, timeLimitSec }: TimerProps) {
  const ratio = timeLimitSec > 0 ? Math.max(0, Math.min(1, remainingSec / timeLimitSec)) : 0;
  const urgent = ratio <= 0.3;

  return (
    <div
      className={`rm-timer${urgent ? ' is-urgent' : ''}`}
      role="progressbar"
      aria-label="剩餘時間"
      aria-valuemin={0}
      aria-valuemax={timeLimitSec}
      aria-valuenow={Math.max(0, remainingSec)}
      aria-valuetext={`剩餘 ${Math.max(0, remainingSec)} 秒`}
    >
      <span className="rm-timer-label">剩餘時間</span>
      <div className="rm-timer-track">
        <div className="rm-timer-fill" style={{ width: `${ratio * 100}%` }}>
          <i className="rm-timer-tip" aria-hidden="true" />
        </div>
      </div>
      <span className="rm-timer-num">{Math.max(0, remainingSec)}s</span>
    </div>
  );
}
