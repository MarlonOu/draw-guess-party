import { NextRequest, NextResponse } from 'next/server';
import { checkDuplicates } from '../../../../lib/server/submissionManager';

/** 公開端點：輸入題目時即時查重（只回傳「有沒有、像什麼」，不外洩待審投稿者的資訊） */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) return NextResponse.json({ verdict: 'ok', matches: [] });
  return NextResponse.json(checkDuplicates(text.slice(0, 40)));
}
