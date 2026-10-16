import type { RoomPlayer } from '../../lib/types/room';

interface PlayerListProps {
  players: RoomPlayer[];
  drawerPlayerId?: string | null;
  /** 下一位輪到畫圖的玩家 id；傳 null 代表不顯示（例如比賽尚未開始） */
  nextDrawerPlayerId?: string | null;
  /** 這一題目前已經猜對的玩家 id；傳空陣列或不傳都代表不顯示這個標示 */
  correctGuesserIds?: string[];
  /** 目前房主的玩家 id；傳 null 代表不顯示（理論上不會發生，房間一定有房主） */
  hostPlayerId?: string | null;
  /** 固定最大高度，超過就內部捲動；跟聊天室並排時可調整成一致高度 */
  maxHeight?: number;
  /** 是否顯示右側分數欄位；DRAW_TELEPHONE 模式沒有計分，傳 false 隱藏 */
  showScore?: boolean;
}

/** 頭像底色：依玩家 id 雜湊挑一個麥克筆色，同一個人永遠是同一種顏色 */
const AVATAR_COLORS = ['var(--accent)', 'var(--amber)', 'var(--green)', 'var(--blue)', 'var(--pink)', 'var(--grape)'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function PlayerList({
  players,
  drawerPlayerId,
  nextDrawerPlayerId,
  correctGuesserIds = [],
  hostPlayerId,
  maxHeight = 220,
  showScore = true,
}: PlayerListProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <ul className="rm-players" style={{ maxHeight }}>
      {sorted.map((p) => {
        const isDrawing = p.id === drawerPlayerId;
        const isNext = !isDrawing && p.id === nextDrawerPlayerId;
        const hasGuessedCorrectly = correctGuesserIds.includes(p.id);
        const isHost = p.id === hostPlayerId;
        const cls = ['rm-player', isDrawing && 'is-drawing', hasGuessedCorrectly && 'is-correct', !p.connected && 'is-offline']
          .filter(Boolean)
          .join(' ');
        return (
          <li key={p.id} className={cls}>
            <span className="rm-avatar" style={{ background: avatarColor(p.id) }} aria-hidden="true">
              {Array.from(p.displayName)[0] ?? '?'}
            </span>
            <span className="rm-player-main">
              <span className="rm-player-name">
                {p.displayName}
                {!p.connected && <span className="rm-player-off">（已離線）</span>}
              </span>
              {(isHost || isDrawing || isNext || hasGuessedCorrectly) && (
                <span className="rm-player-tags">
                  {isHost && <span className="dg-tag rm-tag" style={{ background: 'var(--amber)' }}>房主</span>}
                  {isDrawing && <span className="dg-tag rm-tag" style={{ background: 'var(--accent)' }}>畫圖中</span>}
                  {isNext && <span className="dg-tag rm-tag" style={{ background: 'var(--blue-soft)' }}>下一位</span>}
                  {hasGuessedCorrectly && <span className="dg-tag rm-tag" style={{ background: 'var(--green)' }}>已答對</span>}
                </span>
              )}
            </span>
            {showScore && <span className="rm-player-score" aria-label={`${p.score} 分`}>{p.score}</span>}
          </li>
        );
      })}
    </ul>
  );
}
