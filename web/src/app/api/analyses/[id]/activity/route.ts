import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { getAnalysisActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const business = await getOrCreateBusinessFromEnv();
    const ownership = await prisma.analysis.findFirst({
      where: { id, businessId: business.id },
      select: { id: true },
    });
    if (!ownership) {
      return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
    }
    const { items } = await getAnalysisActivity(id);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'activity_failed', message }, { status: 500 });
  }
}
