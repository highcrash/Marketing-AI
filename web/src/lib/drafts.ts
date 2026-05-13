import { prisma } from './db';
import type { CampaignDraftPayload, DraftResult } from './ai/draft';

export interface DraftRow {
  id: string;
  analysisId: string;
  recIndex: number;
  recTitle: string;
  status: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  feedback: string | null;
  parentDraftId: string | null;
  /// Total number of drafts for this recommendation (including this one),
  /// computed at fetch time. Surfaces as a "v3 of 3" indicator in UI.
  version: number;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
  payload: CampaignDraftPayload;
}

export async function saveDraft(
  analysisId: string,
  recIndex: number,
  recTitle: string,
  draft: DraftResult,
  refinement?: { parentDraftId: string; feedback: string },
): Promise<DraftRow> {
  const row = await prisma.campaignDraft.create({
    data: {
      analysisId,
      recIndex,
      recTitle,
      model: draft.model,
      inputTokens: draft.inputTokens,
      outputTokens: draft.outputTokens,
      cacheReadTokens: draft.cacheReadTokens,
      cacheWriteTokens: draft.cacheWriteTokens,
      payload: JSON.stringify(draft.payload),
      feedback: refinement?.feedback ?? null,
      parentDraftId: refinement?.parentDraftId ?? null,
    },
  });
  // Recompute version + versionCount for this rec so the returned row is
  // immediately renderable.
  const allForRec = await prisma.campaignDraft.findMany({
    where: { analysisId, recIndex },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const version = allForRec.findIndex((d) => d.id === row.id) + 1;
  return rowToDraft(row, version, allForRec.length);
}

/// Look up a single draft by id (any version).
export async function getDraftById(id: string): Promise<DraftRow | null> {
  const row = await prisma.campaignDraft.findUnique({ where: { id } });
  if (!row) return null;
  const siblings = await prisma.campaignDraft.findMany({
    where: { analysisId: row.analysisId, recIndex: row.recIndex },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const version = siblings.findIndex((d) => d.id === id) + 1;
  return rowToDraft(row, version, siblings.length);
}

/// Latest draft per recommendation index. We don't dedupe earlier
/// drafts — re-drafting creates new rows, but the UI default shows the
/// most recent. The `version` + `versionCount` fields surface the
/// chain length so the UI can show "v3 of 3".
export async function listLatestDraftsByAnalysis(
  analysisId: string,
): Promise<Map<number, DraftRow>> {
  const rows = await prisma.campaignDraft.findMany({
    where: { analysisId },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<number, DraftRow>();
  const countsPerRec = new Map<number, number>();
  for (const row of rows) {
    countsPerRec.set(row.recIndex, (countsPerRec.get(row.recIndex) ?? 0) + 1);
  }
  // rows is desc-by-createdAt, so the first one we see per recIndex is the
  // newest = the version = countsPerRec[recIndex].
  for (const row of rows) {
    if (!latest.has(row.recIndex)) {
      const versionCount = countsPerRec.get(row.recIndex) ?? 1;
      latest.set(row.recIndex, rowToDraft(row, versionCount, versionCount));
    }
  }
  return latest;
}

function rowToDraft(
  row: {
    id: string;
    analysisId: string;
    recIndex: number;
    recTitle: string;
    status: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    payload: string;
    feedback: string | null;
    parentDraftId: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  version: number,
  versionCount: number,
): DraftRow {
  return {
    id: row.id,
    analysisId: row.analysisId,
    recIndex: row.recIndex,
    recTitle: row.recTitle,
    status: row.status,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    feedback: row.feedback,
    parentDraftId: row.parentDraftId,
    version,
    versionCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    payload: JSON.parse(row.payload) as CampaignDraftPayload,
  };
}
