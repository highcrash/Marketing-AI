import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import {
  markPieceComplete,
  unmarkPieceComplete,
} from '@/lib/piece-completions';

export const dynamic = 'force-dynamic';

async function ownershipOk(draftId: string): Promise<boolean> {
  const business = await getOrCreateBusinessFromEnv();
  const draft = await prisma.campaignDraft.findFirst({
    where: { id: draftId, analysis: { businessId: business.id } },
    select: { id: true },
  });
  return !!draft;
}

interface PostBody {
  notes?: unknown;
  source?: unknown;
  /// Proof-of-work attachment. The client uploads the file via
  /// /api/uploads first (which gives back publicPath/size/etc.) and
  /// then POSTs those fields here. Pass null to clear a prior
  /// attachment; omit the key to leave it unchanged.
  attachment?: {
    path?: unknown;
    name?: unknown;
    mime?: unknown;
    size?: unknown;
  } | null;
}

export async function POST(
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

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const notes =
    typeof body.notes === 'string' && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 500)
      : null;
  const source =
    typeof body.source === 'string' && body.source.trim().length > 0
      ? body.source.trim().slice(0, 40)
      : 'manual';

  let attachment: { path: string; name: string; mime: string; size: number } | null | undefined;
  if (body.attachment === null) {
    attachment = null;
  } else if (body.attachment && typeof body.attachment === 'object') {
    const a = body.attachment;
    const path = typeof a.path === 'string' ? a.path.trim() : '';
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    const mime = typeof a.mime === 'string' ? a.mime.trim() : '';
    const size = typeof a.size === 'number' ? a.size : null;
    // /api/uploads writes under /uploads/<sha>.<ext>; reject anything
    // that doesn't match the shape so we can't be tricked into pointing
    // a completion at an arbitrary path.
    if (
      path.length > 0 &&
      name.length > 0 &&
      mime.length > 0 &&
      size != null &&
      size > 0 &&
      /^\/uploads\/[a-f0-9]+\.[a-z0-9]+$/i.test(path)
    ) {
      attachment = { path, name: name.slice(0, 200), mime: mime.slice(0, 120), size };
    }
  }

  try {
    if (!(await ownershipOk(draftId))) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }
    const completion = await markPieceComplete({
      draftId,
      pieceIndex,
      notes,
      source,
      attachment,
    });
    return NextResponse.json({ completion });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'complete_failed', message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
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
  try {
    if (!(await ownershipOk(draftId))) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }
    await unmarkPieceComplete(draftId, pieceIndex);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'uncomplete_failed', message }, { status: 500 });
  }
}
