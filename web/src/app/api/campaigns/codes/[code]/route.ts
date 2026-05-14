import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { deleteCode, findCodeByCode, listRedemptionsForCode } from '@/lib/campaign-codes';

export const dynamic = 'force-dynamic';

async function ownershipOk(codeRow: { draftId: string }): Promise<boolean> {
  const business = await getOrCreateBusinessFromEnv();
  const draft = await prisma.campaignDraft.findFirst({
    where: { id: codeRow.draftId, analysis: { businessId: business.id } },
    select: { id: true },
  });
  return !!draft;
}

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const row = await findCodeByCode(code);
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await ownershipOk(row))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const redemptions = await listRedemptionsForCode(row.id);
    return NextResponse.json({ code: row, redemptions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'read_failed', message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  try {
    const row = await findCodeByCode(code);
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await ownershipOk(row))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await deleteCode(row.id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'delete_failed', message }, { status: 500 });
  }
}
