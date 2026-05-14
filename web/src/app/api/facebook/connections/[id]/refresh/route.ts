import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { refreshConnection } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

/// Re-query Graph for the linked IG account using the connection's
/// stored token. Useful when the owner has just linked an IG Business
/// account in Meta Business Suite and wants the platform to pick it up
/// without re-pasting the access token.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const business = await getOrCreateBusinessFromEnv();
    const conn = await prisma.facebookConnection.findFirst({
      where: { id, businessId: business.id },
      select: { id: true },
    });
    if (!conn) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const refreshed = await refreshConnection(id);
    return NextResponse.json({ connection: refreshed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'refresh_failed', message }, { status: 500 });
  }
}
