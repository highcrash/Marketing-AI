import { NextResponse } from 'next/server';

import { getCachedHealthReport, overallStatus } from '@/lib/health';

export const dynamic = 'force-dynamic';

/// Lightweight overall-status endpoint for the header badge to poll.
/// Reuses the 60s-cached HealthReport so frequent polls don't burn
/// upstream calls; pull /api/health (uncached) when you want the full
/// breakdown on /health.
export async function GET() {
  const report = await getCachedHealthReport();
  const status = overallStatus(report);
  const issues: Array<{ component: string; message: string }> = [];
  // Surface the failing components by name so the badge tooltip can
  // say 'Restora is down' without the client having to load the whole
  // report.
  if (report.db.status !== 'ok') issues.push({ component: 'database', message: report.db.message });
  if (report.restora.status !== 'ok')
    issues.push({ component: 'Restora API', message: report.restora.message });
  if (report.anthropic.status !== 'ok')
    issues.push({ component: 'Anthropic API', message: report.anthropic.message });
  for (const f of report.facebook) {
    if (f.status !== 'ok')
      issues.push({ component: `Facebook · ${f.pageName}`, message: f.message });
  }
  return NextResponse.json({
    status,
    generatedAt: report.generatedAt,
    issues,
  });
}
