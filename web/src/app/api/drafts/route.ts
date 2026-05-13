import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { runDraftGeneration } from '@/lib/ai/draft';
import type { AnalysisResult } from '@/lib/ai/analyze';
import { prisma } from '@/lib/db';
import { saveDraft } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';

export const dynamic = 'force-dynamic';
// Draft generation runs ~30-45s typically. Same headroom as audits.
export const maxDuration = 300;

interface PostBody {
  analysisId?: unknown;
  recIndex?: unknown;
}

export async function POST(req: Request) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'missing_env', message: 'ANTHROPIC_API_KEY is not set' },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const analysisId = typeof body.analysisId === 'string' ? body.analysisId : null;
  const recIndex = typeof body.recIndex === 'number' ? body.recIndex : null;

  if (!analysisId || recIndex == null || recIndex < 0) {
    return NextResponse.json(
      { error: 'bad_request', message: 'analysisId (string) and recIndex (non-negative number) are required' },
      { status: 400 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();
    const analysisRow = await prisma.analysis.findFirst({
      where: { id: analysisId, businessId: business.id },
    });
    if (!analysisRow) {
      return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
    }

    const result = JSON.parse(analysisRow.payload) as AnalysisResult;
    const rec = result.recommendations[recIndex];
    if (!rec) {
      return NextResponse.json(
        { error: 'rec_out_of_range', message: `recIndex ${recIndex} out of range` },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const draftResult = await runDraftGeneration(anthropic, result, rec, {
      model: process.env.ANTHROPIC_MODEL,
    });

    const draft = await saveDraft(analysisId, recIndex, rec.title, draftResult);
    return NextResponse.json({ draft });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'draft_failed', message }, { status: 500 });
  }
}
