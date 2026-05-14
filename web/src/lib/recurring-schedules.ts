import { prisma } from './db';
import type { ScheduledConfig } from './scheduled-sends';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface RecurringScheduleRow {
  id: string;
  draftId: string;
  pieceIndex: number;
  kind: 'single' | 'blast' | 'fb-post';
  config: ScheduledConfig;
  frequency: 'weekly';
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
  active: boolean;
  nextFireAt: string;
  lastFireAt: string | null;
  runCount: number;
  startsAt: string;
  endsAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToRecurring(row: {
  id: string;
  draftId: string;
  pieceIndex: number;
  kind: string;
  config: string;
  frequency: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
  active: boolean;
  nextFireAt: Date;
  lastFireAt: Date | null;
  runCount: number;
  startsAt: Date;
  endsAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RecurringScheduleRow {
  return {
    id: row.id,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    kind: row.kind as 'single' | 'blast' | 'fb-post',
    config: JSON.parse(row.config) as ScheduledConfig,
    frequency: row.frequency as 'weekly',
    dayOfWeek: row.dayOfWeek,
    hour: row.hour,
    minute: row.minute,
    timezone: row.timezone,
    active: row.active,
    nextFireAt: row.nextFireAt.toISOString(),
    lastFireAt: row.lastFireAt?.toISOString() ?? null,
    runCount: row.runCount,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// Computes the next fire time after `prev`. For weekly schedules in
/// non-DST timezones this is just prev + 7 days. The dayOfWeek/hour/
/// minute fields exist so a future DST-aware implementation can
/// recompute correctly without losing the user's original intent.
export function bumpFireAt(prev: Date, frequency: 'weekly'): Date {
  if (frequency === 'weekly') {
    return new Date(prev.getTime() + WEEK_MS);
  }
  throw new Error(`Unsupported frequency: ${frequency as string}`);
}

export async function createRecurringSchedule(params: {
  draftId: string;
  pieceIndex: number;
  kind: 'single' | 'blast' | 'fb-post';
  config: ScheduledConfig;
  frequency: 'weekly';
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
  firstFireAt: Date;
  endsAt?: Date | null;
}): Promise<RecurringScheduleRow> {
  const row = await prisma.recurringSchedule.create({
    data: {
      draftId: params.draftId,
      pieceIndex: params.pieceIndex,
      kind: params.kind,
      config: JSON.stringify(params.config),
      frequency: params.frequency,
      dayOfWeek: params.dayOfWeek,
      hour: params.hour,
      minute: params.minute,
      timezone: params.timezone,
      startsAt: params.firstFireAt,
      nextFireAt: params.firstFireAt,
      endsAt: params.endsAt ?? null,
    },
  });
  return rowToRecurring(row);
}

/// Active recurring schedules whose nextFireAt has passed. The scheduler
/// processes each by executing the send + bumping nextFireAt forward.
export async function listDueRecurring(): Promise<RecurringScheduleRow[]> {
  const now = new Date();
  const rows = await prisma.recurringSchedule.findMany({
    where: {
      active: true,
      nextFireAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    orderBy: { nextFireAt: 'asc' },
    take: 50,
  });
  return rows.map(rowToRecurring);
}

export async function markRecurringFired(
  id: string,
  result: { ok: boolean; error?: string | null },
): Promise<void> {
  const row = await prisma.recurringSchedule.findUnique({ where: { id } });
  if (!row) return;
  const next = bumpFireAt(row.nextFireAt, row.frequency as 'weekly');
  await prisma.recurringSchedule.update({
    where: { id },
    data: {
      lastFireAt: new Date(),
      runCount: { increment: 1 },
      nextFireAt: next,
      lastError: result.ok ? null : (result.error ?? 'Unknown error'),
    },
  });
}

export async function setRecurringActive(
  id: string,
  active: boolean,
): Promise<RecurringScheduleRow | null> {
  const row = await prisma.recurringSchedule.update({
    where: { id },
    data: { active },
  });
  return rowToRecurring(row);
}

/// Skip the NEXT scheduled fire without firing it. Used when there's a
/// holiday / event / out-of-office week and you want the recurring
/// schedule to resume on the following occurrence rather than pause
/// outright. Implemented as `nextFireAt = bumpFireAt(nextFireAt, freq)`.
export async function skipNextRecurring(
  id: string,
): Promise<RecurringScheduleRow | null> {
  const row = await prisma.recurringSchedule.findUnique({ where: { id } });
  if (!row) return null;
  const next = bumpFireAt(row.nextFireAt, row.frequency as 'weekly');
  const updated = await prisma.recurringSchedule.update({
    where: { id },
    data: { nextFireAt: next },
  });
  return rowToRecurring(updated);
}

export async function deleteRecurring(id: string): Promise<boolean> {
  try {
    await prisma.recurringSchedule.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function listRecurringByDraft(draftId: string): Promise<RecurringScheduleRow[]> {
  const rows = await prisma.recurringSchedule.findMany({
    where: { draftId },
    orderBy: { nextFireAt: 'asc' },
  });
  return rows.map(rowToRecurring);
}
