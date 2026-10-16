import { NextRequest, NextResponse } from 'next/server';
import { recordAcceptedReport, submitReport, takeReportSlot } from '../../../lib/server/reportManager';

/** 單筆回報（含 log）請求大小上限，約 300 筆 log × 200 字元之內 */
const MAX_BODY_CHARS = 160_000;

function clientKey(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** 公開端點：玩家送出錯誤回報（附帶前端自動收集的操作紀錄） */
export async function POST(request: NextRequest) {
  const text = await request.text().catch(() => '');
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: '回報內容太大' }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // 落到下面的格式錯誤
  }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '資料格式不正確' }, { status: 400 });
  const data = body as Record<string, unknown>;

  // 蜜罐：真人看不到，機器人會填
  if (typeof data.website === 'string' && data.website.trim() !== '') return NextResponse.json({ ok: true }, { status: 201 });

  const key = clientKey(request);
  if (!takeReportSlot(key)) return NextResponse.json({ error: '回報太頻繁了，請過幾分鐘再試' }, { status: 429 });

  const result = submitReport(data);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  recordAcceptedReport(key);
  return NextResponse.json({ ok: true, id: result.report.id }, { status: 201 });
}
