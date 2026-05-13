import { prisma } from './db';
import type { AnalysisResult } from './ai/analyze';
import { listLatestDraftsByAnalysis, type DraftRow } from './drafts';
import { listCompletionsForDraft, type PieceCompletionRow } from './piece-completions';

export type DraftsByRecIndex = Record<number, DraftRow>;
/// Keyed by `${draftId}:${pieceIndex}` so the dashboard can render
/// completion status across all drafts in one map.
export type CompletionsByKey = Record<string, PieceCompletionRow>;

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

async function loadCompletionsForDrafts(
  drafts: DraftsByRecIndex,
): Promise<CompletionsByKey> {
  const out: CompletionsByKey = {};
  for (const draft of Object.values(drafts)) {
    const perDraft = await listCompletionsForDraft(draft.id);
    for (const [pieceIndex, row] of Object.entries(perDraft)) {
      out[`${draft.id}:${pieceIndex}`] = row;
    }
  }
  return out;
}

/// Fetch one analysis by id (with its latest draft per rec) and parse the
/// stored payload back into the AnalysisResult shape. Returns null if not
/// found.
export async function getAnalysisById(
  id: string,
  businessId: string,
): Promise<{
  id: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  completions: CompletionsByKey;
} | null> {
  const row = await prisma.analysis.findFirst({ where: { id, businessId } });
  if (!row) return null;
  const drafts = Object.fromEntries(await listLatestDraftsByAnalysis(row.id));
  const completions = await loadCompletionsForDrafts(drafts);
  return {
    id: row.id,
    result: JSON.parse(row.payload) as AnalysisResult,
    drafts,
    completions,
  };
}

export async function getLatestAnalysis(businessId: string): Promise<{
  id: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  completions: CompletionsByKey;
} | null> {
  const row = await prisma.analysis.findFirst({
    where: { businessId },
    orderBy: { generatedAt: 'desc' },
  });
  if (!row) return null;
  const drafts = Object.fromEntries(await listLatestDraftsByAnalysis(row.id));
  const completions = await loadCompletionsForDrafts(drafts);
  return {
    id: row.id,
    result: JSON.parse(row.payload) as AnalysisResult,
    drafts,
    completions,
  };
}
