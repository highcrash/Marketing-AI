/**
 * Next.js calls register() exactly once when the server boots — in dev
 * after compile, in production at startup. We use it to install the
 * scheduled-send tick so users can queue a send for later and have it
 * actually fire without an external cron.
 *
 * SCHEDULER_MODE env:
 *  - 'in-process' (default, dev): a setInterval inside this Node
 *    process runs the scheduler every 30s. Works on long-running
 *    servers (local dev, dedicated VM, container).
 *  - 'cron': don't install the timer. An external cron service
 *    (Vercel Cron, QStash, etc.) is expected to POST
 *    /api/cron/scheduler-tick on a schedule. Required for serverless
 *    hosts (Vercel, Netlify) where the Node process doesn't outlive
 *    a single request.
 *
 * Caveats:
 *  - Edge runtime can't run this; the runtime check prevents trying.
 *  - In dev with HMR, register() gets called once per worker —
 *    installSchedulerTimer is idempotent.
 *  - When the server is down (in-process mode), scheduled sends sit
 *    and wait. The scheduler picks up any rows due in the past on
 *    its next tick, so missing a few minutes is recoverable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const mode = (process.env.SCHEDULER_MODE ?? 'in-process').toLowerCase();
  if (mode === 'cron') {
    console.warn('[scheduler] in-process timer skipped (SCHEDULER_MODE=cron)');
    return;
  }
  const { installSchedulerTimer } = await import('./lib/scheduler');
  installSchedulerTimer();
}
