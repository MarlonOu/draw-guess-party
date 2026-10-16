import { NextRequest, NextResponse } from 'next/server';
import { getRoom, countConnectedPlayers } from '../../../../lib/server/roomManager';

/**
 * 查詢房間是否存在、能不能加入（供「換房間」功能在真正離開目前房間之前先確認目標房間可用，
 * 避免輸入錯代碼卻已經退出原本的房間）。只回傳公開資訊：玩法、狀態、人數，不含玩家名單與內容。
 *
 * joinable 的判定跟 roomManager.joinRoom 的實際規則對齊，再多收一條產品面的限制：
 * 接龍／拼圖接畫這兩種「全員固定參與到結束」的玩法，遊戲開始後不開放中途加入
 * （你畫我猜本來就是輪流制，可以中途加入）。
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ joinCode: string }> }) {
  const { joinCode } = await params;
  const code = joinCode.toUpperCase();
  const room = getRoom(code);
  if (!room) {
    return NextResponse.json({ exists: false, joinable: false, reason: '找不到這個房間代碼' }, { status: 404 });
  }

  const mode = room.settings.mode;
  let joinable = true;
  let reason: string | undefined;
  if (room.status === 'finished') {
    joinable = false;
    reason = '這個房間正在公布結果，請稍後再試';
  } else if (room.status === 'playing' && mode !== 'DRAW_GUESS') {
    joinable = false;
    reason = '這個房間已經開始遊戲，這種玩法不能中途加入';
  }

  return NextResponse.json({
    exists: true,
    joinCode: room.joinCode,
    mode,
    status: room.status,
    playerCount: countConnectedPlayers(room),
    joinable,
    reason,
  });
}
