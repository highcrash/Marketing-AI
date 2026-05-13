import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getDraftById } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { executeSmsBlast, SendExecutionError } from '@/lib/execute-sends';
import { RestoraClient, RestoraApiError } from '@/lib/restora-client';
import { describeSegment, type BlastSegmentFilter } from '@/lib/sms-blasts';

export const dynamic = 'force-dynamic';
// Bulk send loops one-by-one on the Restora side. At ~100ms per SMS
// and a soft cap of ~500 recipients per blast, we want the headroom.
export const maxDuration = 300;

interface PostBody {
  pieceIndex?: unknown;
  segment?: unknown;
  campaignTag?: unknown;
  dryRun?: unknown;
  /// Optional user-edited body. Replaces piece.content for the blast,
  /// piece.content stays untouched. Same {{name}} placeholders work.
  body?: unknown;
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
  const bodyOverride =
    typeof body.body === 'string' && body.body.trim().length > 0
      ? body.body.trim()
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

    if (dryRun) {
      // For preview we still verify ownership but don't need
      // executeSmsBlast — it would write an audit row we don't want.
      const draft = await getDraftById(draftId);
      if (!draft) return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
      const analysisRow = await prisma.analysis.findFirst({
        where: { id: draft.analysisId, businessId: business.id },
        select: { id: true },
      });
      if (!analysisRow) {
        return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
      }
      const piece = draft.payload.pieces[pieceIndex];
      if (!piece || piece.assetType !== 'sms') {
        return NextResponse.json(
          { error: 'bad_piece', message: 'pieceIndex does not point to an SMS piece' },
          { status: 400 },
        );
      }
      const previewBody = bodyOverride || piece.content;
      const restora = new RestoraClient(business.baseUrl, business.apiKey);
      try {
        const preview = await restora.sendSmsBlast({
          segment,
          smsTemplate: previewBody,
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

    const event = await executeSmsBlast({
      business,
      draftId,
      pieceIndex,
      segment,
      campaignTag,
      bodyOverride,
    });

    if (event.status === 'FAILED') {
      return NextResponse.json(
        { event, error: 'blast_failed', message: event.error ?? event.status },
        { status: 502 },
      );
    }
    return NextResponse.json({ event });
  } catch (err: unknown) {
    if (err instanceof SendExecutionError) {
      const code = err.code;
      const status = code === 'not_approved' ? 409 : code === 'draft_not_found' ? 404 : 400;
      return NextResponse.json({ error: code, message: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'unexpected', message }, { status: 500 });
  }
}
