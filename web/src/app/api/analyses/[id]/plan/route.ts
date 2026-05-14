import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

import { prisma } from '@/lib/db';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { runCampaignPlanning, type DisabledCategory } from '@/lib/ai/plan';
import { listPlansForAnalysis, savePlan } from '@/lib/plans';
import type { AnalysisResult } from '@/lib/ai/analyze';

export const dynamic = 'force-dynamic';
// AI planning takes ~30-60s for a typical audit.
export const maxDuration = 180;

const VALID_DISABLED: ReadonlySet<DisabledCategory> = new Set([
  'video-production',
  'photography',
  'physical-campaigns',
  'influencer-coordination',
  'creative-asset-production',
  'offline-promotions',
]);

interface PostBody {
  totalBudgetMinor?: unknown;
  horizonDays?: unknown;
  disabledCategories?: unknown;
  startDate?: unknown;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: analysisId } = await ctx.params;
  try {
    const business = await getOrCreateBusinessFromEnv();
    const analysis = await prisma.analysis.findFirst({
      where: { id: analysisId, businessId: business.id },
      select: { id: true },
    });
    if (!analysis) return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
    const plans = await listPlansForAnalysis(analysisId);
    return NextResponse.json({ plans });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: analysisId } = await ctx.params;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'missing_env', message: 'ANTHROPIC_API_KEY is not set' },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const totalBudgetMinor =
    typeof body.totalBudgetMinor === 'number' && Number.isFinite(body.totalBudgetMinor) && body.totalBudgetMinor > 0
      ? Math.floor(body.totalBudgetMinor)
      : null;
  const horizonDays =
    typeof body.horizonDays === 'number' && Number.isInteger(body.horizonDays) && body.horizonDays >= 7 && body.horizonDays <= 365
      ? body.horizonDays
      : null;
  if (totalBudgetMinor == null || horizonDays == null) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'totalBudgetMinor (positive integer minor units) and horizonDays (7-365) required',
      },
      { status: 400 },
    );
  }
  const rawDisabled = Array.isArray(body.disabledCategories) ? body.disabledCategories : [];
  const disabledCategories = rawDisabled
    .filter((c): c is string => typeof c === 'string')
    .filter((c): c is DisabledCategory => VALID_DISABLED.has(c as DisabledCategory));
  const startDate =
    typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      ? body.startDate
      : undefined;

  try {
    const business = await getOrCreateBusinessFromEnv();
    const analysisRow = await prisma.analysis.findFirst({
      where: { id: analysisId, businessId: business.id },
    });
    if (!analysisRow) {
      return NextResponse.json({ error: 'analysis_not_found' }, { status: 404 });
    }
    const result = JSON.parse(analysisRow.payload) as AnalysisResult;
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const plan = await runCampaignPlanning(anthropic, result, {
      totalBudgetMinor,
      horizonDays,
      disabledCategories,
      startDate,
    });
    const saved = await savePlan(analysisId, plan);
    return NextResponse.json({ plan: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'plan_failed', message }, { status: 500 });
  }
}
