import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { listAllCompletions } from '@/lib/all-completions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const items = await listAllCompletions(business.id);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}
