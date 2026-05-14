import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { findCodeByCode, logRedemption } from '@/lib/campaign-codes';

export const dynamic = 'force-dynamic';

interface PostBody {
  amountMinor?: unknown;
  qty?: unknown;
  source?: unknown;
  notes?: unknown;
  redeemedAt?: unknown;
}

const VALID_SOURCES = new Set(['manual', 'restora-webhook', 'pos-export']);

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const amountMinor =
    typeof body.amountMinor === 'number' && Number.isFinite(body.amountMinor) && body.amountMinor >= 0
      ? Math.floor(body.amountMinor)
      : 0;
  const qty =
    typeof body.qty === 'number' && Number.isInteger(body.qty) && body.qty > 0 ? body.qty : 1;
  const source =
    typeof body.source === 'string' && VALID_SOURCES.has(body.source) ? body.source : 'manual';
  const notes =
    typeof body.notes === 'string' && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 500)
      : null;
  const redeemedAt =
    typeof body.redeemedAt === 'string' ? new Date(body.redeemedAt) : undefined;
  if (redeemedAt && Number.isNaN(redeemedAt.getTime())) {
    return NextResponse.json(
      { error: 'bad_request', message: 'redeemedAt must be a valid ISO datetime' },
      { status: 400 },
    );
  }

  try {
    const row = await findCodeByCode(code);
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // Ownership: must be a code on a draft belonging to the env business.
    const business = await getOrCreateBusinessFromEnv();
    const draft = await prisma.campaignDraft.findFirst({
      where: { id: row.draftId, analysis: { businessId: business.id } },
      select: { id: true },
    });
    if (!draft) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const redemption = await logRedemption({
      codeId: row.id,
      amountMinor,
      qty,
      source,
      notes,
      redeemedAt,
    });
    return NextResponse.json({ redemption });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'redeem_failed', message }, { status: 500 });
  }
}
