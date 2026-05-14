import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { deleteConnection } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const business = await getOrCreateBusinessFromEnv();
    const conn = await prisma.facebookConnection.findFirst({
      where: { id, businessId: business.id },
      select: { id: true },
    });
    if (!conn) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await deleteConnection(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'delete_failed', message }, { status: 500 });
  }
}
