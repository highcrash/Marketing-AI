/// External cron entry-point for the scheduler. Designed for Vercel
/// Cron Jobs but works with any cron-as-a-service that can POST to a
/// URL with a bearer token (Upstash QStash, Inngest, GitHub Actions,
/// etc.).
///
/// Auth: requires the `Authorization: Bearer <CRON_SECRET>` header.
/// Vercel Cron sets this automatically using the CRON_SECRET env var
/// you configure on the project.
///
/// Behaviour: identical to one in-process tick. Idempotent on its own
/// (the scheduler's claim/run loop prevents double-fires), so being
/// called multiple times by an over-eager cron isn't dangerous.

import { NextResponse } from 'next/server';

import { runSchedulerTick } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'cron_disabled', message: 'CRON_SECRET is not set' },
      { status: 503 },
    );
  }
  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await runSchedulerTick();
  return NextResponse.json(result);
}

/// GET for liveness/health checks. Returns 200 with the same shape as
/// POST would (without running a tick). Useful for Vercel deployment
/// preview checks. No auth.
export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: process.env.SCHEDULER_MODE ?? 'in-process',
    hasCronSecret: !!process.env.CRON_SECRET,
  });
}
