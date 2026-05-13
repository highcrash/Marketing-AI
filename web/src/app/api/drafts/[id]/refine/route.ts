import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { runDraftGeneration } from '@/lib/ai/draft';
import type { AnalysisResult } from '@/lib/ai/analyze';
import { prisma } from '@/lib/db';
import { getDraftById, saveDraft } from '@/lib/drafts';
import { getOrCreateBusinessFromEnv } from '@/lib/business';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface PostBody {
  feedback?: unknown;
}

const MIN_FEEDBACK_LEN = 4;
const MAX_FEEDBACK_LEN = 2000;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'missing_env', message: 'ANTHROPIC_API_KEY is not set' },
      { status: 500 },
    );
  }

  const { id: parentDraftId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
  if (feedback.length < MIN_FEEDBACK_LEN || feedback.length > MAX_FEEDBACK_LEN) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: `feedback must be between ${MIN_FEEDBACK_LEN} and ${MAX_FEEDBACK_LEN} characters`,
      },
      { status: 400 },
    );
  }

  try {
    const business = await getOrCreateBusinessFromEnv();

    const parent = await getDraftById(parentDraftId);
    if (!parent) {
      return NextResponse.json({ error: 'draft_not_found' }, { status: 404 });
    }

    const analysisRow = await prisma.analysis.findFirst({
      where: { id: parent.analysisId, businessId: business.id },
    });
    if (!analysisRow) {
      return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
    }

    const audit = JSON.parse(analysisRow.payload) as AnalysisResult;
    const rec = audit.recommendations[parent.recIndex];
    if (!rec) {
      return NextResponse.json(
        { error: 'rec_out_of_range', message: 'Source recommendation no longer exists' },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const draftResult = await runDraftGeneration(anthropic, audit, rec, {
      model: process.env.ANTHROPIC_MODEL,
      refinement: {
        previous: parent.payload,
        feedback,
      },
    });

    const refined = await saveDraft(parent.analysisId, parent.recIndex, rec.title, draftResult, {
      parentDraftId: parent.id,
      feedback,
    });

    return NextResponse.json({ draft: refined });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'refine_failed', message }, { status: 500 });
  }
}
