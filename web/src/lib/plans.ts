import { prisma } from './db';
import type { CampaignPlan } from './ai/plan';

export interface PlanRow extends CampaignPlan {
  id: string;
  analysisId: string;
  createdAt: string;
}

function rowToPlan(row: {
  id: string;
  analysisId: string;
  totalBudgetMinor: number;
  horizonDays: number;
  startDate: string;
  disabledCategories: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  payload: string;
  createdAt: Date;
}): PlanRow {
  const body = JSON.parse(row.payload) as Pick<
    CampaignPlan,
    'summary' | 'redistributionNotes' | 'weeks' | 'tasks'
  >;
  return {
    id: row.id,
    analysisId: row.analysisId,
    generatedAt: row.createdAt.toISOString(),
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    totalBudgetMinor: row.totalBudgetMinor,
    horizonDays: row.horizonDays,
    startDate: row.startDate,
    disabledCategories: JSON.parse(row.disabledCategories) as CampaignPlan['disabledCategories'],
    summary: body.summary,
    redistributionNotes: body.redistributionNotes,
    weeks: body.weeks,
    tasks: body.tasks,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function savePlan(analysisId: string, plan: CampaignPlan): Promise<PlanRow> {
  const row = await prisma.campaignPlan.create({
    data: {
      analysisId,
      totalBudgetMinor: plan.totalBudgetMinor,
      horizonDays: plan.horizonDays,
      startDate: plan.startDate,
      disabledCategories: JSON.stringify(plan.disabledCategories),
      model: plan.model,
      inputTokens: plan.inputTokens,
      outputTokens: plan.outputTokens,
      cacheReadTokens: plan.cacheReadTokens,
      cacheWriteTokens: plan.cacheWriteTokens,
      payload: JSON.stringify({
        summary: plan.summary,
        redistributionNotes: plan.redistributionNotes,
        weeks: plan.weeks,
        tasks: plan.tasks,
      }),
    },
  });
  return rowToPlan(row);
}

export async function listPlansForAnalysis(analysisId: string): Promise<PlanRow[]> {
  const rows = await prisma.campaignPlan.findMany({
    where: { analysisId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(rowToPlan);
}

export async function getPlanById(id: string): Promise<PlanRow | null> {
  const row = await prisma.campaignPlan.findUnique({ where: { id } });
  return row ? rowToPlan(row) : null;
}
