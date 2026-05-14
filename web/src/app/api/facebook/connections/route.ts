import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { listConnections, listRecentPostEvents } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const [connections, recentPosts] = await Promise.all([
      listConnections(business.id),
      listRecentPostEvents(business.id),
    ]);
    return NextResponse.json({ connections, recentPosts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}
