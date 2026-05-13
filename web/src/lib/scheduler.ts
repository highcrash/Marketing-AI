/**
 * Scheduler tick — picked up by instrumentation.ts and called every ~30s
 * while the dev server is up. Picks PENDING ScheduledSend rows whose
 * scheduledAt has passed, executes them via the same execute-sends libs
 * the HTTP routes use, and persists the result.
 *
 * Concurrency: each tick claims rows by flipping to RUNNING via a
 * conditional update, so two overlapping ticks can't double-fire the
 * same row. A row that ends up stuck in RUNNING after a crash will need
 * manual cleanup (set status back to PENDING and bump attemptCount).
 *
 * Limitations of THIS implementation:
 *  - In-process timer means scheduled sends ONLY fire while the dev
 *    server is running. A killed dev = no sends until you start it
 *    again. Acceptable for local single-user dev; production will need
 *    a proper out-of-band worker (Vercel Cron, a separate Node process,
 *    BullMQ, etc.) before this can be left unattended.
 *  - Bound to one business — the env-bootstrapped Business. Phase 1.D
 *    multi-business changes the picture here too.
 */

import { getOrCreateBusinessFromEnv } from './business';
import { executeSingleSmsSend, executeSmsBlast } from './execute-sends';
import {
  claimDueScheduledSends,
  markScheduledComplete,
  markScheduledFailed,
  markScheduledSkipped,
  type ScheduledBlastConfig,
  type ScheduledSingleConfig,
} from './scheduled-sends';
import { listDueRecurring, markRecurringFired } from './recurring-schedules';
import { prisma } from './db';

/// Run one tick: claim due rows, execute each, persist results. Returns
/// the number of rows fired this tick (for logging / monitoring).
export async function runSchedulerTick(): Promise<{ fired: number; failed: number; skipped: number }> {
  let fired = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const due = await claimDueScheduledSends();
    const dueRecurring = await listDueRecurring();
    if (due.length === 0 && dueRecurring.length === 0) {
      return { fired, failed, skipped };
    }

    const business = await getOrCreateBusinessFromEnv().catch(() => null);
    if (!business) {
      // Couldn't resolve a business (missing env, network, whatever).
      // Release the claimed one-off rows back to PENDING. Recurring
      // rows aren't "claimed" so the next tick naturally retries.
      for (const row of due) {
        await prisma.scheduledSend.updateMany({
          where: { id: row.id, status: 'RUNNING' },
          data: { status: 'PENDING' },
        });
      }
      return { fired, failed, skipped };
    }

    // Recurring schedules first: each fire enters the same audit tables
    // as on-demand sends, so the activity feed picks them up uniformly.
    for (const r of dueRecurring) {
      try {
        const draft = await prisma.campaignDraft.findUnique({
          where: { id: r.draftId },
          select: { status: true },
        });
        if (!draft || draft.status !== 'APPROVED') {
          // Skip THIS fire but don't deactivate the schedule — the user
          // might re-approve before next week's fire. Still bump
          // nextFireAt so we don't fire-storm on a re-opened draft.
          await markRecurringFired(r.id, {
            ok: false,
            error: `Draft ${draft ? `is ${draft.status}` : 'no longer exists'} at fire time — skipped`,
          });
          skipped += 1;
          continue;
        }

        if (r.kind === 'single') {
          const cfg = r.config as ScheduledSingleConfig;
          await executeSingleSmsSend({
            business,
            draftId: r.draftId,
            pieceIndex: r.pieceIndex,
            phone: cfg.phone,
            campaignTag: cfg.campaignTag ?? null,
          });
        } else if (r.kind === 'blast') {
          const cfg = r.config as ScheduledBlastConfig;
          await executeSmsBlast({
            business,
            draftId: r.draftId,
            pieceIndex: r.pieceIndex,
            segment: cfg.segment,
            campaignTag: cfg.campaignTag ?? null,
          });
        } else {
          throw new Error(`Unknown recurring kind: ${r.kind as string}`);
        }
        await markRecurringFired(r.id, { ok: true });
        fired += 1;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await markRecurringFired(r.id, { ok: false, error: message });
        failed += 1;
      }
    }

    for (const row of due) {
      try {
        // Verify the draft is still APPROVED at fire time. A user who
        // approved → scheduled → re-opened to PENDING_REVIEW shouldn't
        // see the scheduled send fire on the old approved snapshot.
        const draft = await prisma.campaignDraft.findUnique({
          where: { id: row.draftId },
          select: { status: true },
        });
        if (!draft) {
          await markScheduledSkipped(row.id, 'Draft no longer exists');
          skipped += 1;
          continue;
        }
        if (draft.status !== 'APPROVED') {
          await markScheduledSkipped(
            row.id,
            `Draft is ${draft.status} at fire time, not APPROVED`,
          );
          skipped += 1;
          continue;
        }

        if (row.kind === 'single') {
          const cfg = row.config as ScheduledSingleConfig;
          const result = await executeSingleSmsSend({
            business,
            draftId: row.draftId,
            pieceIndex: row.pieceIndex,
            phone: cfg.phone,
            campaignTag: cfg.campaignTag ?? null,
          });
          await markScheduledComplete(row.id, result);
          fired += 1;
        } else if (row.kind === 'blast') {
          const cfg = row.config as ScheduledBlastConfig;
          const result = await executeSmsBlast({
            business,
            draftId: row.draftId,
            pieceIndex: row.pieceIndex,
            segment: cfg.segment,
            campaignTag: cfg.campaignTag ?? null,
          });
          await markScheduledComplete(row.id, result);
          fired += 1;
        } else {
          await markScheduledFailed(row.id, `Unknown kind: ${row.kind as string}`);
          failed += 1;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await markScheduledFailed(row.id, message);
        failed += 1;
      }
    }
  } catch (err: unknown) {
    // Top-level tick failure (e.g. DB down). Log + skip; next tick
    // retries.
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[scheduler] tick failed:', message);
  }

  return { fired, failed, skipped };
}

/// Install a process-level timer that runs the scheduler every
/// intervalMs. Idempotent — calling more than once short-circuits after
/// the first install.
let timerInstalled = false;
export function installSchedulerTimer(intervalMs = 30_000): void {
  if (timerInstalled) return;
  timerInstalled = true;
  // Fire once immediately so a freshly-started server doesn't wait the
  // full interval before the first tick.
  void runSchedulerTick();
  setInterval(() => {
    void runSchedulerTick();
  }, intervalMs);
  console.warn(`[scheduler] tick installed every ${intervalMs}ms`);
}
