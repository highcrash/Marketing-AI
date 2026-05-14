import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { publishPost } from '@/lib/facebook';
import { markPieceComplete } from '@/lib/piece-completions';

export const dynamic = 'force-dynamic';

interface PostBody {
  connectionId?: unknown;
  message?: unknown;
  draftId?: unknown;
  pieceIndex?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const connectionId =
      typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const draftId =
      typeof body.draftId === 'string' && body.draftId.trim().length > 0
        ? body.draftId.trim()
        : null;
    const pieceIndex =
      typeof body.pieceIndex === 'number' && Number.isInteger(body.pieceIndex)
        ? body.pieceIndex
        : null;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'connectionId is required' },
        { status: 400 },
      );
    }
    if (message.length === 0) {
      return NextResponse.json(
        { error: 'bad_request', message: 'message is required' },
        { status: 400 },
      );
    }
    if (message.length > 60000) {
      return NextResponse.json(
        { error: 'bad_request', message: 'message exceeds Facebook 63206-char limit' },
        { status: 400 },
      );
    }

    const business = await getOrCreateBusinessFromEnv();
    const event = await publishPost({
      businessId: business.id,
      connectionId,
      message,
      draftId,
      pieceIndex,
    });

    // Auto-mark the originating piece as done on a successful post, same
    // way SMS sends do. The user can still un-mark or edit the note.
    if (event.status === 'POSTED' && draftId !== null && pieceIndex !== null) {
      await markPieceComplete({
        draftId,
        pieceIndex,
        source: 'integrated-facebook-post',
        notes: event.providerPostId
          ? `Posted to Facebook · post id ${event.providerPostId}`
          : null,
      });
    }

    return NextResponse.json({ event });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'post_failed', message }, { status: 500 });
  }
}
