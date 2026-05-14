import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { getDraftById } from '@/lib/drafts';

export const dynamic = 'force-dynamic';

interface PatchBody {
  title?: unknown;
  content?: unknown;
  notes?: unknown;
}

/// Inline edit one piece of a draft. Mutates the JSON payload in place
/// — we don't create a new draft version because the user might be
/// fixing a typo, not iterating creatively. Skipping the Claude
/// roundtrip keeps cost down (a refine is ~$0.30) and avoids the
/// version churn that re-drafting causes.
///
/// Trade-off: prior send/blast/post events were locked to the body at
/// that time; later edits don't retroactively change them. The
/// dashboard shows piece.content (the new edited value) by default;
/// the historical body stays in the send/blast event rows so the audit
/// trail is intact.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; index: string }> },
) {
  const { id: draftId, index } = await ctx.params;
  const pieceIndex = Number(index);
  if (!Number.isInteger(pieceIndex) || pieceIndex < 0) {
    return NextResponse.json(
      { error: 'bad_request', message: 'pieceIndex must be a non-negative integer' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const newTitle =
    typeof body.title === 'string' && body.title.trim().length > 0
      ? body.title.trim().slice(0, 200)
      : undefined;
  const newContent =
    typeof body.content === 'string' && body.content.length > 0
      ? body.content.slice(0, 60000)
      : undefined;
  const newNotes =
    typeof body.notes === 'string'
      ? body.notes.length > 0
        ? body.notes.slice(0, 2000)
        : null
      : undefined;

  if (newTitle === undefined && newContent === undefined && newNotes === undefined) {
    return NextResponse.json(
      { error: 'bad_request', message: 'no editable fields supplied' },
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
    const piece = draft.payload.pieces?.[pieceIndex];
    if (!piece) {
      return NextResponse.json(
        { error: 'bad_request', message: 'pieceIndex out of range' },
        { status: 400 },
      );
    }
    const updatedPiece = {
      ...piece,
      ...(newTitle !== undefined ? { title: newTitle } : {}),
      ...(newContent !== undefined ? { content: newContent } : {}),
      ...(newNotes !== undefined ? { notes: newNotes } : {}),
    };
    const updatedPayload = {
      ...draft.payload,
      pieces: draft.payload.pieces.map((p, i) => (i === pieceIndex ? updatedPiece : p)),
    };
    await prisma.campaignDraft.update({
      where: { id: draftId },
      data: { payload: JSON.stringify(updatedPayload) },
    });
    return NextResponse.json({ piece: updatedPiece });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'patch_failed', message }, { status: 500 });
  }
}
