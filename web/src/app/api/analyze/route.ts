import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { RestoraClient } from '@/lib/restora-client';
import { runAnalysis } from '@/lib/ai/analyze';
import {
  getBusinessGoals,
  getBusinessTimezone,
  getOrCreateBusinessFromEnv,
} from '@/lib/business';
import { saveAnalysis } from '@/lib/analyses';

export const dynamic = 'force-dynamic';
// Analysis takes ~75s end-to-end (data fetch + Claude). The default Vercel
// route timeout is much shorter on hobby plans — we set 300s here so it
// works locally and on any tier ≥ Pro.
export const maxDuration = 300;

export async function POST() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'missing_env', message: 'ANTHROPIC_API_KEY is not set' },
      { status: 500 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();
    const restora = new RestoraClient(business.baseUrl, business.apiKey);
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const [goals, tzOverride] = await Promise.all([
      getBusinessGoals(business.id),
      getBusinessTimezone(business.id),
    ]);

    const result = await runAnalysis(restora, anthropic, {
      model: process.env.ANTHROPIC_MODEL,
      goalTags: goals.tags,
      goalNotes: goals.notes,
      businessId: business.id,
      timezoneOverride: tzOverride,
    });

    const analysisId = await saveAnalysis(business.id, result);

    return NextResponse.json({ id: analysisId, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'analysis_failed', message }, { status: 500 });
  }
}
