import { NextRequest, NextResponse } from 'next/server';
import { submitWord, takeAttemptSlot, recordAcceptedSubmission } from '../../../lib/server/submissionManager';

/** 投稿者來源：Cloudflare Tunnel 後面要看 cf-connecting-ip／x-forwarded-for，否則全部會是同一個 IP */
function clientKey(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '資料格式不正確' }, { status: 400 });
  }
  // 蜜罐欄位：真人看不到也不會填，機器人常會把所有欄位都填滿。裝作成功，不收。
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const key = clientKey(request);
  if (!takeAttemptSlot(key)) {
    return NextResponse.json({ error: '投稿太頻繁了，請過幾分鐘再試' }, { status: 429 });
  }

  const result = submitWord(body, body.confirmSimilar === true);
  if (!result.ok) {
    const status = result.code === 'invalid' ? 400 : result.code === 'full' ? 503 : 409;
    return NextResponse.json(
      { error: result.message, code: result.code, check: 'check' in result ? result.check : undefined },
      { status }
    );
  }
  recordAcceptedSubmission(key);
  return NextResponse.json({ ok: true, id: result.submission.id }, { status: 201 });
}
