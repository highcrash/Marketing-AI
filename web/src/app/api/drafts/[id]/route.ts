import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getDraftById } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

interface PatchBody {
  status?: unknown;
}

/// PATCH /api/drafts/[id] — mutate workflow state on a draft.
/// For now the only mutable field is `status`. Discarded is deliberately
/// not in the allowed list; deleting drafts can come later if needed.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const status = body.status;

  if (typeof status !== 'string' || !ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: `status must be one of: ${ALLOWED_STATUSES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();

    // Verify the draft belongs to a business this caller owns.
    const existing = await prisma.campaignDraft.findUnique({
      where: { id },
      select: { id: true, analysisId: true, analysis: { select: { businessId: true } } },
    });
    if (!existing || existing.analysis.businessId !== business.id) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }

    await prisma.campaignDraft.update({
      where: { id },
      data: { status: status as AllowedStatus },
    });

    const updated = await getDraftById(id);
    return NextResponse.json({ draft: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'update_failed', message }, { status: 500 });
  }
}
