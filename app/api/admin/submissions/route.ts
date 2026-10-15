import { NextResponse } from 'next/server';
import { listForAdmin } from '../../../../lib/server/submissionManager';

/** 管理後台：全部投稿（待審的附即時查重結果）。受 proxy.ts 的 Basic Auth 保護 */
export async function GET() {
  return NextResponse.json(listForAdmin());
}
