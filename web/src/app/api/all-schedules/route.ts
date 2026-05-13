import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { listAllSchedules } from '@/lib/all-schedules';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const data = await listAllSchedules(business.id);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}
