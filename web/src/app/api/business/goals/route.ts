import { NextResponse } from 'next/server';

import {
  STANDARD_GOAL_TAGS,
  getBusinessGoals,
  getOrCreateBusinessFromEnv,
  setBusinessGoals,
  type StandardGoalTag,
} from '@/lib/business';

export const dynamic = 'force-dynamic';

const TAG_SET = new Set<string>(STANDARD_GOAL_TAGS);

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const goals = await getBusinessGoals(business.id);
    return NextResponse.json({ goals, options: STANDARD_GOAL_TAGS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'load_failed', message }, { status: 500 });
  }
}

interface PutBody {
  tags?: unknown;
  notes?: unknown;
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as PutBody;
    const rawTags = Array.isArray(body.tags) ? body.tags : [];
    const tags = rawTags
      .filter((v): v is string => typeof v === 'string')
      .filter((v) => TAG_SET.has(v)) as StandardGoalTag[];
    const notes = typeof body.notes === 'string' ? body.notes : null;
    const business = await getOrCreateBusinessFromEnv();
    const goals = await setBusinessGoals(business.id, { tags, notes });
    return NextResponse.json({ goals });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'save_failed', message }, { status: 500 });
  }
}
