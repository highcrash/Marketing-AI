import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { getAuditComparison } from '@/lib/audit-compare';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const business = await getOrCreateBusinessFromEnv();
    const comparison = await getAuditComparison(id, business.id);
    return NextResponse.json({ comparison });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'comparison_failed', message }, { status: 500 });
  }
}
