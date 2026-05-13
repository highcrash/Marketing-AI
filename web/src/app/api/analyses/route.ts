import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { listAnalyses } from '@/lib/analyses';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const items = await listAnalyses(business.id);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}
