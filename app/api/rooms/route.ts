import { NextRequest, NextResponse } from 'next/server';
import { createRoom, toRoomSummary } from '../../../lib/server/roomManager';
import type { GameMode } from '../../../lib/types/room';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (!displayName) {
    return NextResponse.json({ error: '請輸入暱稱' }, { status: 400 });
  }

  const mode: GameMode =
    body?.mode === 'DRAW_TELEPHONE'
      ? 'DRAW_TELEPHONE'
      : body?.mode === 'FRAGMENT_DRAW'
        ? 'FRAGMENT_DRAW'
        : 'DRAW_GUESS';
  const roundDurationSec =
    typeof body?.roundDurationSec === 'number' ? body.roundDurationSec : 60;
  const categoryFilter: string[] = Array.isArray(body?.categoryFilter)
    ? body.categoryFilter.filter((c: unknown) => typeof c === 'string')
    : [];
  const difficultyFilter: string[] = Array.isArray(body?.difficultyFilter)
    ? body.difficultyFilter.filter((d: unknown) => typeof d === 'string')
    : [];
  // 接龍模式的流程切換，預設 'combined'（原本唯一的玩法），確保沒有特別指定時
  // 行為跟這個功能出現之前完全一致；其餘模式忽略這個欄位，但一律給預設值，
  // 不讓 RoomSettings 出現缺欄位的物件。
  const telephoneFlow: 'combined' | 'alternating' =
    body?.telephoneFlow === 'alternating' ? 'alternating' : 'combined';

  const room = createRoom(displayName, {
    mode,
    roundDurationSec,
    categoryFilter,
    difficultyFilter,
    telephoneFlow,
  });

  return NextResponse.json(toRoomSummary(room), { status: 201 });
}
