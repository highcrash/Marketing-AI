import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { cancelScheduledSend } from '@/lib/scheduled-sends';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const business = await getOrCreateBusinessFromEnv();
    // Verify ownership via Schedule → Draft → Analysis → Business.
    const owned = await prisma.scheduledSend.findFirst({
      where: { id, draft: { analysis: { businessId: business.id } } },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const canceled = await cancelScheduledSend(id);
    if (!canceled) {
      return NextResponse.json(
        { error: 'already_started', message: 'The scheduled send has already started or finished' },
        { status: 409 },
      );
    }
    return NextResponse.json({ scheduled: canceled });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'cancel_failed', message }, { status: 500 });
  }
}
