import { prisma } from './db';
import type { ScheduledSendRow } from './scheduled-sends';
import type { RecurringScheduleRow } from './recurring-schedules';

export interface ScheduleListItem {
  draftId: string;
  analysisId: string;
  recTitle: string;
  pieceIndex: number;
}

/// Aggregate all scheduled-work rows for the business: one-off PENDING +
/// any RUNNING (rare, but the user should see them) + all recurring,
/// each with enough draft+analysis info that the global /schedules page
/// can render a meaningful row.
export async function listAllSchedules(businessId: string): Promise<{
  pendingOnce: Array<ScheduledSendRow & ScheduleListItem>;
  recentOnce: Array<ScheduledSendRow & ScheduleListItem>;
  recurring: Array<RecurringScheduleRow & ScheduleListItem>;
}> {
  const [onceRows, recurringRows] = await Promise.all([
    prisma.scheduledSend.findMany({
      where: { draft: { analysis: { businessId } } },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
      include: {
        draft: { select: { recTitle: true, analysisId: true, recIndex: true } },
      },
    }),
    prisma.recurringSchedule.findMany({
      where: { draft: { analysis: { businessId } } },
      orderBy: { nextFireAt: 'asc' },
      include: {
        draft: { select: { recTitle: true, analysisId: true, recIndex: true } },
      },
    }),
  ]);

  const pendingOnce = onceRows
    .filter((r) => r.status === 'PENDING' || r.status === 'RUNNING')
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .map((r) => ({
      id: r.id,
      draftId: r.draftId,
      pieceIndex: r.pieceIndex,
      kind: r.kind as 'single' | 'blast',
      config: JSON.parse(r.config),
      scheduledAt: r.scheduledAt.toISOString(),
      status: r.status,
      attemptCount: r.attemptCount,
      lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
      lastError: r.lastError,
      completedAt: r.completedAt?.toISOString() ?? null,
      resultJson: r.resultJson ? JSON.parse(r.resultJson) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      recTitle: r.draft.recTitle,
      analysisId: r.draft.analysisId,
    })) as Array<ScheduledSendRow & ScheduleListItem>;

  const recentOnce = onceRows
    .filter((r) => r.status === 'COMPLETED' || r.status === 'FAILED' || r.status === 'CANCELED' || r.status === 'SKIPPED')
    .slice(0, 25)
    .map((r) => ({
      id: r.id,
      draftId: r.draftId,
      pieceIndex: r.pieceIndex,
      kind: r.kind as 'single' | 'blast',
      config: JSON.parse(r.config),
      scheduledAt: r.scheduledAt.toISOString(),
      status: r.status,
      attemptCount: r.attemptCount,
      lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
      lastError: r.lastError,
      completedAt: r.completedAt?.toISOString() ?? null,
      resultJson: r.resultJson ? JSON.parse(r.resultJson) : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      recTitle: r.draft.recTitle,
      analysisId: r.draft.analysisId,
    })) as Array<ScheduledSendRow & ScheduleListItem>;

  const recurring = recurringRows.map((r) => ({
    id: r.id,
    draftId: r.draftId,
    pieceIndex: r.pieceIndex,
    kind: r.kind as 'single' | 'blast',
    config: JSON.parse(r.config),
    frequency: r.frequency as 'weekly',
    dayOfWeek: r.dayOfWeek,
    hour: r.hour,
    minute: r.minute,
    timezone: r.timezone,
    active: r.active,
    nextFireAt: r.nextFireAt.toISOString(),
    lastFireAt: r.lastFireAt?.toISOString() ?? null,
    runCount: r.runCount,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    lastError: r.lastError,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    recTitle: r.draft.recTitle,
    analysisId: r.draft.analysisId,
  })) as Array<RecurringScheduleRow & ScheduleListItem>;

  return { pendingOnce, recentOnce, recurring };
}
