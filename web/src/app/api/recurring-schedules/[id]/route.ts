import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { deleteRecurring, setRecurringActive } from '@/lib/recurring-schedules';

export const dynamic = 'force-dynamic';

async function ownershipCheck(id: string): Promise<boolean> {
  const business = await getOrCreateBusinessFromEnv();
  const owned = await prisma.recurringSchedule.findFirst({
    where: { id, draft: { analysis: { businessId: business.id } } },
    select: { id: true },
  });
  return !!owned;
}

interface PatchBody {
  active?: unknown;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (typeof body.active !== 'boolean') {
    return NextResponse.json(
      { error: 'bad_request', message: 'active (boolean) is required' },
      { status: 400 },
    );
  }
  try {
    if (!(await ownershipCheck(id))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const updated = await setRecurringActive(id, body.active);
    return NextResponse.json({ recurring: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'patch_failed', message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    if (!(await ownershipCheck(id))) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const ok = await deleteRecurring(id);
    if (!ok) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'delete_failed', message }, { status: 500 });
  }
}
