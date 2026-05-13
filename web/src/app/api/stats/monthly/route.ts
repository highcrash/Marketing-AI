import { NextResponse } from 'next/server';

import { getOperationalStats } from '@/lib/stats';
import { getOrCreateBusinessFromEnv } from '@/lib/business';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const stats = await getOperationalStats(business.id);
    return NextResponse.json({ stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'stats_failed', message }, { status: 500 });
  }
}
