import { NextRequest, NextResponse } from 'next/server';
import { getReportDetail, removeReport, updateReport } from '../../../../../lib/server/reportManager';

export const dynamic = 'force-dynamic';

/** 單筆回報的完整內容（含全部自動收集的操作紀錄） */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReportDetail(id);
  if (!report) return NextResponse.json({ error: '找不到這筆回報' }, { status: 404 });
  return NextResponse.json(report);
}

/** 更新狀態與管理員備註：{ status?, adminNote? } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '資料格式不正確' }, { status: 400 });
  const updated = updateReport(id, body as Record<string, unknown>);
  if (!updated) return NextResponse.json({ error: '找不到這筆回報' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!removeReport(id)) return NextResponse.json({ error: '找不到這筆回報' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
