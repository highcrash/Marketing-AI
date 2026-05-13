import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { RestoraClient } from '@/lib/restora-client';
import { runAnalysis } from '@/lib/ai/analyze';

export const dynamic = 'force-dynamic';
// Analysis takes ~75s end-to-end (data fetch + Claude). The default Vercel
// route timeout is much shorter on hobby plans — we set 300s here so it
// works locally and on any tier ≥ Pro.
export const maxDuration = 300;

export async function POST() {
  const base = process.env.RESTORA_API_BASE;
  const key = process.env.RESTORA_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!base || !key || !anthropicKey) {
    return NextResponse.json(
      {
        error: 'missing_env',
        message:
          'Set RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC_API_KEY in web/.env',
      },
      { status: 500 },
    );
  }

  try {
    const restora = new RestoraClient(base, key);
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const result = await runAnalysis(restora, anthropic, {
      model: process.env.ANTHROPIC_MODEL,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'analysis_failed', message }, { status: 500 });
  }
}
