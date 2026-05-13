import { prisma } from './db';
import type { AnalysisResult } from './ai/analyze';

const SUMMARY_PREVIEW_LEN = 500;

/// Persist an AnalysisResult. The full structured result lives in the
/// `payload` column as JSON; a handful of fields are denormalised onto
/// the row so the list view can sort and filter without parsing JSON.
export async function saveAnalysis(businessId: string, result: AnalysisResult): Promise<string> {
  const row = await prisma.analysis.create({
    data: {
      businessId,
      generatedAt: new Date(result.generatedAt),
      model: result.model,
      summary: result.summary.slice(0, SUMMARY_PREVIEW_LEN),
      recommendationCount: result.recommendations.length,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
      payload: JSON.stringify(result),
    },
  });
  return row.id;
}

export interface AnalysisListItem {
  id: string;
  generatedAt: string;
  model: string;
  summary: string;
  recommendationCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/// Compact rows for the past-runs sidebar. Excludes `payload` (the JSON
/// blob) so this stays fast even with hundreds of runs.
export async function listAnalyses(
  businessId: string,
  limit = 50,
): Promise<AnalysisListItem[]> {
  const rows = await prisma.analysis.findMany({
    where: { businessId },
    orderBy: { generatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      generatedAt: true,
      model: true,
      summary: true,
      recommendationCount: true,
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
    },
  });
  return rows.map((r) => ({ ...r, generatedAt: r.generatedAt.toISOString() }));
}

/// Fetch one analysis by id and parse the stored payload back into the
/// AnalysisResult shape. Returns null if not found.
export async function getAnalysisById(
  id: string,
  businessId: string,
): Promise<AnalysisResult | null> {
  const row = await prisma.analysis.findFirst({ where: { id, businessId } });
  if (!row) return null;
  return JSON.parse(row.payload) as AnalysisResult;
}

export async function getLatestAnalysis(businessId: string): Promise<{
  id: string;
  result: AnalysisResult;
} | null> {
  const row = await prisma.analysis.findFirst({
    where: { businessId },
    orderBy: { generatedAt: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    result: JSON.parse(row.payload) as AnalysisResult,
  };
}
