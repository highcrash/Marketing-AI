import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import { getDraftById } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import {
  createScheduledSend,
  listScheduledByDraft,
  type ScheduledConfig,
} from '@/lib/scheduled-sends';
import type { BlastSegmentFilter } from '@/lib/sms-blasts';

export const dynamic = 'force-dynamic';

interface PostBody {
  pieceIndex?: unknown;
  kind?: unknown;
  config?: unknown;
  scheduledAt?: unknown;
}

const PHONE_RE = /^[+0-9()\-\s]{6,20}$/;

function parseConfig(kind: string, raw: unknown): ScheduledConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const body =
    typeof obj.body === 'string' && obj.body.trim().length > 0 ? obj.body.trim() : null;
  if (kind === 'single') {
    const phone = typeof obj.phone === 'string' ? obj.phone.trim() : '';
    if (!PHONE_RE.test(phone)) return null;
    const campaignTag =
      typeof obj.campaignTag === 'string' && obj.campaignTag.trim().length > 0
        ? obj.campaignTag.trim().slice(0, 120)
        : null;
    return { phone, campaignTag, body };
  }
  if (kind === 'blast') {
    const seg = obj.segment;
    if (!seg || typeof seg !== 'object') return null;
    const segObj = seg as Record<string, unknown>;
    const filter: BlastSegmentFilter = {};
    for (const key of ['minSpent', 'minVisits', 'maxLastVisitDays', 'minLoyaltyPoints'] as const) {
      const v = segObj[key];
      if (v == null || v === '') continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      filter[key] = n;
    }
    const campaignTag =
      typeof obj.campaignTag === 'string' && obj.campaignTag.trim().length > 0
        ? obj.campaignTag.trim().slice(0, 120)
        : null;
    return { segment: filter, campaignTag, body };
  }
  if (kind === 'fb-post') {
    const connectionId =
      typeof obj.connectionId === 'string' && obj.connectionId.trim().length > 0
        ? obj.connectionId.trim()
        : null;
    if (!connectionId) return null;
    const rawImage = typeof obj.imageUrl === 'string' ? obj.imageUrl.trim() : '';
    const imageUrl = /^https?:\/\/[^\s]+$/i.test(rawImage) ? rawImage : null;
    const rawVideo = typeof obj.videoUrl === 'string' ? obj.videoUrl.trim() : '';
    const videoUrl = /^https?:\/\/[^\s]+$/i.test(rawVideo) ? rawVideo : null;
    const target = obj.target === 'instagram' ? 'instagram' : 'facebook';
    return { connectionId, body, imageUrl, videoUrl, target };
  }
  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PostBody;

  const pieceIndex = typeof body.pieceIndex === 'number' ? body.pieceIndex : null;
  const kind =
    body.kind === 'single' || body.kind === 'blast' || body.kind === 'fb-post' ? body.kind : null;
  const scheduledAtStr = typeof body.scheduledAt === 'string' ? body.scheduledAt : null;

  if (pieceIndex == null || pieceIndex < 0 || !kind || !scheduledAtStr) {
    return NextResponse.json(
      { error: 'bad_request', message: 'pieceIndex, kind (single|blast|fb-post), scheduledAt required' },
      { status: 400 },
    );
  }
  const scheduledAt = new Date(scheduledAtStr);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json(
      { error: 'bad_request', message: 'scheduledAt must be a valid ISO datetime' },
      { status: 400 },
    );
  }
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: 'bad_request', message: 'scheduledAt must be in the future (or within the last minute)' },
      { status: 400 },
    );
  }
  const config = parseConfig(kind, body.config);
  if (!config) {
    return NextResponse.json(
      { error: 'bad_request', message: 'config invalid for the supplied kind' },
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

    // The send won't execute unless the draft is APPROVED at fire time,
    // but we require it at SCHEDULE time too so users don't queue work
    // that's guaranteed to be skipped.
    if (draft.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'not_approved', message: 'Only approved drafts can be scheduled' },
        { status: 409 },
      );
    }
    const piece = draft.payload.pieces[pieceIndex];
    if (!piece) {
      return NextResponse.json(
        { error: 'bad_piece', message: 'pieceIndex out of range' },
        { status: 400 },
      );
    }
    if ((kind === 'single' || kind === 'blast') && piece.assetType !== 'sms') {
      return NextResponse.json(
        { error: 'bad_piece', message: 'pieceIndex does not point to an SMS piece' },
        { status: 400 },
      );
    }
    if (kind === 'fb-post') {
      const isFb =
        piece.channel.toLowerCase() === 'facebook' &&
        (piece.assetType === 'social-post' || piece.assetType === 'paid-ad-copy');
      if (!isFb) {
        return NextResponse.json(
          { error: 'bad_piece', message: 'pieceIndex must be a Facebook social-post or ad-copy piece' },
          { status: 400 },
        );
      }
    }

    const scheduled = await createScheduledSend({
      draftId,
      pieceIndex,
      kind,
      config,
      scheduledAt,
    });
    return NextResponse.json({ scheduled });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'schedule_failed', message }, { status: 500 });
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: draftId } = await ctx.params;
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
    const items = await listScheduledByDraft(draftId);
    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}
