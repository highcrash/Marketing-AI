import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getDraftById } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { RestoraClient, RestoraApiError } from '@/lib/restora-client';
import {
  createPendingSmsSend,
  listSendsByDraftGroupedByPiece,
  markSmsSendResult,
} from '@/lib/sms-sends';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PostBody {
  pieceIndex?: unknown;
  phone?: unknown;
  campaignTag?: unknown;
}

const PHONE_RE = /^[+0-9()\-\s]{6,20}$/;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PostBody;

  const pieceIndex = typeof body.pieceIndex === 'number' ? body.pieceIndex : null;
  const phoneRaw = typeof body.phone === 'string' ? body.phone.trim() : '';
  const campaignTag =
    typeof body.campaignTag === 'string' && body.campaignTag.trim().length > 0
      ? body.campaignTag.trim().slice(0, 120)
      : null;

  if (pieceIndex == null || pieceIndex < 0) {
    return NextResponse.json(
      { error: 'bad_request', message: 'pieceIndex must be a non-negative number' },
      { status: 400 },
    );
  }
  if (!PHONE_RE.test(phoneRaw)) {
    return NextResponse.json(
      { error: 'bad_request', message: 'phone must look like a phone number (6–20 chars)' },
      { status: 400 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();

    const draft = await getDraftById(draftId);
    if (!draft) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }

    // Verify ownership via the parent Analysis → Business chain.
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

    // Audit FIRST so we have a row even if the upstream call hard-fails.
    const event = await createPendingSmsSend({
      draftId,
      pieceIndex,
      toPhone: phoneRaw,
      body: piece.content,
      campaignTag,
    });

    const restora = new RestoraClient(business.baseUrl, business.apiKey);
    try {
      const result = await restora.sendSms({
        phone: phoneRaw,
        body: piece.content,
        campaignTag: campaignTag ?? undefined,
      });

      const updated = await markSmsSendResult(event.id, {
        status: result.data.ok ? 'SENT' : 'PROVIDER_ERROR',
        providerRequestId: result.data.providerRequestId,
        providerStatus: result.data.status,
        error: result.data.error,
      });
      return NextResponse.json({ event: updated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      const isExternalError = err instanceof RestoraApiError;
      const updated = await markSmsSendResult(event.id, {
        status: isExternalError ? 'PROVIDER_ERROR' : 'FAILED',
        error: message,
      });
      return NextResponse.json(
        { event: updated, error: 'send_failed', message },
        { status: 502 },
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'unexpected', message }, { status: 500 });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params;
  try {
    const business = await getOrCreateBusinessFromEnv();
    const draft = await getDraftById(draftId);
    if (!draft) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }
    const analysisRow = await prisma.analysis.findFirst({
      where: { id: draft.analysisId, businessId: business.id },
      select: { id: true },
    });
    if (!analysisRow) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }
    const grouped = await listSendsByDraftGroupedByPiece(draftId);
    return NextResponse.json({ sendsByPiece: grouped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}
