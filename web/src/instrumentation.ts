/**
 * Next.js calls register() exactly once when the server boots — in dev
 * after compile, in production at startup. We use it to install the
 * scheduled-send tick so users can queue a send for later and have it
 * actually fire without an external cron.
 *
 * Caveats:
 *  - Edge runtime can't run this; the runtime check prevents trying to.
 *  - In dev with HMR, register() gets called once per worker, which
 *    is fine — installSchedulerTimer() is idempotent.
 *  - When the server is down, scheduled sends sit and wait. The
 *    scheduler picks up any rows due in the past on its next tick
 *    after restart, so missing a few minutes is recoverable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { installSchedulerTimer } = await import('./lib/scheduler');
  installSchedulerTimer();
}
