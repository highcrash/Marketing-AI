import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { createCampaignCode, listCodesForBusiness } from '@/lib/campaign-codes';

export const dynamic = 'force-dynamic';

interface PostBody {
  draftId?: unknown;
  pieceIndex?: unknown;
  prefix?: unknown;
  label?: unknown;
  expiresAt?: unknown;
}

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const codes = await listCodesForBusiness(business.id);
    return NextResponse.json({ codes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const draftId = typeof body.draftId === 'string' ? body.draftId.trim() : '';
  const pieceIndex =
    typeof body.pieceIndex === 'number' && Number.isInteger(body.pieceIndex) && body.pieceIndex >= 0
      ? body.pieceIndex
      : null;
  if (!draftId || pieceIndex == null) {
    return NextResponse.json(
      { error: 'bad_request', message: 'draftId + pieceIndex (>=0) required' },
      { status: 400 },
    );
  }
  const prefix = typeof body.prefix === 'string' ? body.prefix : undefined;
  const label =
    typeof body.label === 'string' && body.label.trim().length > 0
      ? body.label.trim().slice(0, 120)
      : null;
  const expiresAt =
    typeof body.expiresAt === 'string' ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json(
      { error: 'bad_request', message: 'expiresAt must be a valid ISO datetime' },
      { status: 400 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();
    // Ownership check via the draft's analysis-business chain.
    const draft = await prisma.campaignDraft.findFirst({
      where: { id: draftId, analysis: { businessId: business.id } },
      select: { id: true },
    });
    if (!draft) return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    const code = await createCampaignCode({ draftId, pieceIndex, prefix, label, expiresAt });
    return NextResponse.json({ code });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'mint_failed', message }, { status: 500 });
  }
}
