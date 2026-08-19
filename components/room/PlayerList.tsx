import type { RoomPlayer } from '../../lib/types/room';

interface PlayerListProps {
  players: RoomPlayer[];
  drawerPlayerId?: string | null;
  /** 下一位輪到畫圖的玩家 id；傳 null 代表不顯示（例如比賽尚未開始） */
  nextDrawerPlayerId?: string | null;
  /** 這一題目前已經猜對的玩家 id；傳空陣列或不傳都代表不顯示這個標示 */
  correctGuesserIds?: string[];
}

export function PlayerList({
  players,
  drawerPlayerId,
  nextDrawerPlayerId,
  correctGuesserIds = [],
}: PlayerListProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <ul
      style={{
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 220,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {sorted.map((p) => {
        const isDrawing = p.id === drawerPlayerId;
        const isNext = !isDrawing && p.id === nextDrawerPlayerId;
        const hasGuessedCorrectly = correctGuesserIds.includes(p.id);
        return (
          <li
            key={p.id}
            className="dg-card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              boxShadow: 'none',
              border: `2px solid ${isDrawing ? 'var(--accent)' : hasGuessedCorrectly ? 'var(--green)' : 'var(--line)'}`,
              background: hasGuessedCorrectly ? 'var(--green-soft)' : 'var(--paper)',
              opacity: p.connected ? 1 : 0.5,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              {isDrawing && (
                <span
                  className="dg-tag"
                  style={{ padding: '2px 8px', background: 'var(--accent)', color: '#fff' }}
                >
                  畫圖中
                </span>
              )}
              {isNext && (
                <span
                  className="dg-tag"
                  style={{ padding: '2px 8px', background: 'var(--blue-soft)' }}
                >
                  下一位
                </span>
              )}
              {hasGuessedCorrectly && (
                <span
                  className="dg-tag"
                  style={{ padding: '2px 8px', background: 'var(--green)', color: '#fff' }}
                >
                  已答對
                </span>
              )}
              {p.displayName}
              {!p.connected && <span style={{ fontWeight: 400 }}>（已離線）</span>}
            </span>
            <span style={{ fontWeight: 800, color: 'var(--accent-ink)' }}>{p.score}</span>
          </li>
        );
      })}
    </ul>
  );
}
