import { NextResponse } from 'next/server';
import { listReportSummaries } from '../../../../lib/server/reportManager';
import type { ReportStatus } from '../../../../lib/types/report';

export const dynamic = 'force-dynamic';

export async function GET() {
  const reports = listReportSummaries();
  const counts: Record<ReportStatus, number> = { open: 0, in_progress: 0, resolved: 0, wontfix: 0 };
  for (const r of reports) counts[r.status]++;
  return NextResponse.json({ reports, counts });
}
