import { NextResponse } from 'next/server';

import { runHealthCheck } from '@/lib/health';

export const dynamic = 'force-dynamic';

// The Anthropic ping costs ~$0.0001, so we don't gate this behind any
// extra auth beyond the existing session middleware.
export async function GET() {
  const report = await runHealthCheck();
  return NextResponse.json(report);
}
