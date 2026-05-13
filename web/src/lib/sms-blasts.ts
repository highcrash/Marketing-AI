import { prisma } from './db';

export interface BlastSegmentFilter {
  minSpent?: number;
  minVisits?: number;
  maxLastVisitDays?: number;
  minLoyaltyPoints?: number;
}

export interface BlastEventRow {
  id: string;
  draftId: string;
  pieceIndex: number;
  segmentFilter: BlastSegmentFilter;
  segmentLabel: string;
  body: string;
  campaignTag: string | null;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToBlast(row: {
  id: string;
  draftId: string;
  pieceIndex: number;
  segmentFilter: string;
  segmentLabel: string;
  body: string;
  campaignTag: string | null;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BlastEventRow {
  return {
    id: row.id,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    segmentFilter: JSON.parse(row.segmentFilter) as BlastSegmentFilter,
    segmentLabel: row.segmentLabel,
    body: row.body,
    campaignTag: row.campaignTag,
    status: row.status,
    recipientCount: row.recipientCount,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// Pretty-print the segment filter as a one-line label, used in the UI
/// and persisted on the BlastEvent row so historical sends stay
/// interpretable even after filter shapes evolve.
export function describeSegment(filter: BlastSegmentFilter): string {
  const parts: string[] = [];
  if (filter.minSpent != null) parts.push(`min spend ৳${filter.minSpent}`);
  if (filter.minVisits != null) parts.push(`min visits ${filter.minVisits}`);
  if (filter.maxLastVisitDays != null) parts.push(`visited within ${filter.maxLastVisitDays}d`);
  if (filter.minLoyaltyPoints != null) parts.push(`≥ ${filter.minLoyaltyPoints} loyalty pts`);
  return parts.length === 0 ? 'All active customers with a phone' : parts.join(' · ');
}

export async function createPendingBlast(params: {
  draftId: string;
  pieceIndex: number;
  segmentFilter: BlastSegmentFilter;
  body: string;
  campaignTag: string | null;
}): Promise<BlastEventRow> {
  const row = await prisma.smsBlastEvent.create({
    data: {
      draftId: params.draftId,
      pieceIndex: params.pieceIndex,
      segmentFilter: JSON.stringify(params.segmentFilter),
      segmentLabel: describeSegment(params.segmentFilter),
      body: params.body,
      campaignTag: params.campaignTag,
      status: 'PENDING',
    },
  });
  return rowToBlast(row);
}

export async function markBlastResult(
  id: string,
  result: {
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
    error?: string | null;
  },
): Promise<BlastEventRow> {
  const row = await prisma.smsBlastEvent.update({
    where: { id },
    data: {
      recipientCount: result.recipientCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      status: result.status,
      error: result.error ?? null,
    },
  });
  return rowToBlast(row);
}

export async function listBlastsByDraft(draftId: string): Promise<BlastEventRow[]> {
  const rows = await prisma.smsBlastEvent.findMany({
    where: { draftId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(rowToBlast);
}
