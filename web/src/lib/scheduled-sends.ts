import { prisma } from './db';
import type { BlastSegmentFilter } from './sms-blasts';

export type ScheduledKind = 'single' | 'blast';

export interface ScheduledSingleConfig {
  phone: string;
  campaignTag?: string | null;
  /// User-edited body captured at schedule time. When set, the
  /// scheduler passes it to execute-sends as bodyOverride so the fire
  /// uses the edited copy instead of piece.content.
  body?: string | null;
}

export interface ScheduledBlastConfig {
  segment: BlastSegmentFilter;
  campaignTag?: string | null;
  /// Same as the single config — captured edit; replaces piece.content
  /// for this scheduled fire.
  body?: string | null;
}

export type ScheduledConfig = ScheduledSingleConfig | ScheduledBlastConfig;

export interface ScheduledSendRow {
  id: string;
  draftId: string;
  pieceIndex: number;
  kind: ScheduledKind;
  config: ScheduledConfig;
  scheduledAt: string;
  status: string;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  completedAt: string | null;
  resultJson: unknown;
  createdAt: string;
  updatedAt: string;
}

function rowToScheduled(row: {
  id: string;
  draftId: string;
  pieceIndex: number;
  kind: string;
  config: string;
  scheduledAt: Date;
  status: string;
  attemptCount: number;
  lastAttemptAt: Date | null;
  lastError: string | null;
  completedAt: Date | null;
  resultJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ScheduledSendRow {
  return {
    id: row.id,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    kind: row.kind as ScheduledKind,
    config: JSON.parse(row.config) as ScheduledConfig,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    lastError: row.lastError,
    completedAt: row.completedAt?.toISOString() ?? null,
    resultJson: row.resultJson ? JSON.parse(row.resultJson) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createScheduledSend(params: {
  draftId: string;
  pieceIndex: number;
  kind: ScheduledKind;
  config: ScheduledConfig;
  scheduledAt: Date;
}): Promise<ScheduledSendRow> {
  const row = await prisma.scheduledSend.create({
    data: {
      draftId: params.draftId,
      pieceIndex: params.pieceIndex,
      kind: params.kind,
      config: JSON.stringify(params.config),
      scheduledAt: params.scheduledAt,
    },
  });
  return rowToScheduled(row);
}

/// Find PENDING rows due to fire now. The scheduler claims each by
/// flipping to RUNNING in a transactional update to prevent double-fires
/// if two ticks overlap.
export async function claimDueScheduledSends(limit = 25): Promise<ScheduledSendRow[]> {
  const now = new Date();
  const due = await prisma.scheduledSend.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });
  if (due.length === 0) return [];
  // Try to claim each. Conditional update on status === PENDING so two
  // concurrent ticks can't both claim the same row.
  const claimed: ScheduledSendRow[] = [];
  for (const row of due) {
    const result = await prisma.scheduledSend.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { status: 'RUNNING', lastAttemptAt: now, attemptCount: { increment: 1 } },
    });
    if (result.count === 1) {
      const refreshed = await prisma.scheduledSend.findUnique({ where: { id: row.id } });
      if (refreshed) claimed.push(rowToScheduled(refreshed));
    }
  }
  return claimed;
}

export async function markScheduledComplete(
  id: string,
  resultPayload: unknown,
): Promise<void> {
  await prisma.scheduledSend.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      resultJson: JSON.stringify(resultPayload),
    },
  });
}

export async function markScheduledFailed(id: string, error: string): Promise<void> {
  await prisma.scheduledSend.update({
    where: { id },
    data: {
      status: 'FAILED',
      lastError: error,
    },
  });
}

export async function markScheduledSkipped(id: string, reason: string): Promise<void> {
  await prisma.scheduledSend.update({
    where: { id },
    data: {
      status: 'SKIPPED',
      lastError: reason,
    },
  });
}

export async function cancelScheduledSend(id: string): Promise<ScheduledSendRow | null> {
  const result = await prisma.scheduledSend.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'CANCELED' },
  });
  if (result.count === 0) return null;
  const row = await prisma.scheduledSend.findUnique({ where: { id } });
  return row ? rowToScheduled(row) : null;
}

export async function listScheduledByDraft(draftId: string): Promise<ScheduledSendRow[]> {
  const rows = await prisma.scheduledSend.findMany({
    where: { draftId },
    orderBy: { scheduledAt: 'asc' },
  });
  return rows.map(rowToScheduled);
}
