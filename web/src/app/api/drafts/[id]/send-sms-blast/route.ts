import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getDraftById } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { RestoraClient, RestoraApiError } from '@/lib/restora-client';
import {
  createPendingBlast,
  describeSegment,
  markBlastResult,
  type BlastSegmentFilter,
} from '@/lib/sms-blasts';

export const dynamic = 'force-dynamic';
// Bulk send loops one-by-one on the Restora side. At ~100ms per SMS
// and a soft cap of ~500 recipients per blast, we want the headroom.
export const maxDuration = 300;

interface PostBody {
  pieceIndex?: unknown;
  segment?: unknown;
  campaignTag?: unknown;
  dryRun?: unknown;
}

function parseSegment(raw: unknown): BlastSegmentFilter | null {
  if (raw == null || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const out: BlastSegmentFilter = {};
  for (const key of ['minSpent', 'minVisits', 'maxLastVisitDays', 'minLoyaltyPoints'] as const) {
    const v = obj[key];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  return out;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PostBody;

  const pieceIndex = typeof body.pieceIndex === 'number' ? body.pieceIndex : null;
  const segment = parseSegment(body.segment);
  const campaignTag =
    typeof body.campaignTag === 'string' && body.campaignTag.trim().length > 0
      ? body.campaignTag.trim().slice(0, 120)
      : null;
  const dryRun = body.dryRun === true;

  if (pieceIndex == null || pieceIndex < 0) {
    return NextResponse.json(
      { error: 'bad_request', message: 'pieceIndex must be a non-negative number' },
      { status: 400 },
    );
  }
  if (!segment) {
    return NextResponse.json(
      { error: 'bad_request', message: 'segment must be an object of optional numeric filters' },
      { status: 400 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();
    const draft = await getDraftById(draftId);
    if (!draft) return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });

    const analysisRow = await prisma.analysis.findFirst({
      where: { id: draft.analysisId, businessId: business.id },
      select: { id: true },
    });
    if (!analysisRow) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }

    if (draft.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'not_approved', message: 'Only approved drafts can be sent' },
        { status: 409 },
      );
    }

    const piece = draft.payload.pieces[pieceIndex];
    if (!piece || piece.assetType !== 'sms') {
      return NextResponse.json(
        { error: 'bad_piece', message: 'pieceIndex does not point to an SMS piece' },
        { status: 400 },
      );
    }

    const restora = new RestoraClient(business.baseUrl, business.apiKey);

    if (dryRun) {
      try {
        const preview = await restora.sendSmsBlast({
          segment,
          smsTemplate: piece.content,
          campaignTag: campaignTag ?? undefined,
          dryRun: true,
        });
        return NextResponse.json({
          dryRun: true,
          recipientCount: preview.data.recipientCount,
          segmentLabel: describeSegment(segment),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        return NextResponse.json(
          { error: 'preview_failed', message },
          { status: err instanceof RestoraApiError ? 502 : 500 },
        );
      }
    }

    // Persist BEFORE the upstream call so even a crash leaves an audit row.
    const blast = await createPendingBlast({
      draftId,
      pieceIndex,
      segmentFilter: segment,
      body: piece.content,
      campaignTag,
    });

    try {
      const result = await restora.sendSmsBlast({
        segment,
        smsTemplate: piece.content,
        campaignTag: campaignTag ?? undefined,
        dryRun: false,
      });
      if (result.data.dryRun) {
        // Should not happen — we passed dryRun: false. Defensive.
        const updated = await markBlastResult(blast.id, {
          recipientCount: 0,
          sentCount: 0,
          failedCount: 0,
          status: 'FAILED',
          error: 'Upstream returned dryRun: true unexpectedly',
        });
        return NextResponse.json({ event: updated }, { status: 502 });
      }
      const { recipientCount, sent, failed } = result.data;
      const status = failed === 0 ? 'COMPLETE' : sent === 0 ? 'FAILED' : 'PARTIAL';
      const updated = await markBlastResult(blast.id, {
        recipientCount,
        sentCount: sent,
        failedCount: failed,
        status,
      });
      return NextResponse.json({ event: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const updated = await markBlastResult(blast.id, {
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        status: 'FAILED',
        error: message,
      });
      return NextResponse.json({ event: updated, error: 'blast_failed', message }, { status: 502 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'unexpected', message }, { status: 500 });
  }
}
