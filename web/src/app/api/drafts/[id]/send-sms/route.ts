import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getDraftById } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { executeSingleSmsSend, SendExecutionError } from '@/lib/execute-sends';
import { listSendsByDraftGroupedByPiece } from '@/lib/sms-sends';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PostBody {
  pieceIndex?: unknown;
  phone?: unknown;
  campaignTag?: unknown;
  /// Optional user-edited body. When supplied, replaces piece.content
  /// for THIS send only (piece.content stays untouched). Lets the user
  /// fix placeholder leftovers like [DATE+14] before the SMS goes out.
  body?: unknown;
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
  const bodyOverride =
    typeof body.body === 'string' && body.body.trim().length > 0
      ? body.body.trim()
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

    const event = await executeSingleSmsSend({
      business,
      draftId,
      pieceIndex,
      phone: phoneRaw,
      campaignTag,
      bodyOverride,
    });

    // executeSingleSmsSend persists FAILED / PROVIDER_ERROR rows too;
    // the route returns them with a 502 so the client can show the
    // error inline while still keeping the audit row visible.
    if (event.status !== 'SENT') {
      return NextResponse.json(
        { event, error: 'send_failed', message: event.error ?? event.status },
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
