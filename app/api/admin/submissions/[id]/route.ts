import { NextRequest, NextResponse } from 'next/server';
import {
  approveSubmission,
  rejectSubmission,
  removeSubmissionRecord,
} from '../../../../../lib/server/submissionManager';

/** 審核一筆投稿：{ action: 'approve', text?, category?, difficulty?, force? } 或 { action: 'reject', reason? } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);

  const result =
    body?.action === 'approve'
      ? approveSubmission(id, body, body.force === true)
      : body?.action === 'reject'
        ? rejectSubmission(id, body.reason)
        : null;

  if (!result) return NextResponse.json({ error: '未知的操作' }, { status: 400 });
  if (!result.ok) {
    return NextResponse.json({ error: result.message, check: result.check }, { status: result.status });
  }
  return NextResponse.json(result.submission);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!removeSubmissionRecord(id)) return NextResponse.json({ error: '找不到這筆投稿' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
