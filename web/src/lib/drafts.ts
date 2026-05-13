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
  createdAt: string;
  updatedAt: string;
  payload: CampaignDraftPayload;
}

export async function saveDraft(
  analysisId: string,
  recIndex: number,
  recTitle: string,
  draft: DraftResult,
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
    },
  });
  return rowToDraft(row);
}

/// Latest draft per recommendation index. We don't dedupe earlier
/// drafts — re-drafting creates new rows, but the UI default shows the
/// most recent. History is accessible later if we add a versions view.
export async function listLatestDraftsByAnalysis(
  analysisId: string,
): Promise<Map<number, DraftRow>> {
  const rows = await prisma.campaignDraft.findMany({
    where: { analysisId },
    orderBy: { createdAt: 'desc' },
  });
  const latest = new Map<number, DraftRow>();
  for (const row of rows) {
    if (!latest.has(row.recIndex)) {
      latest.set(row.recIndex, rowToDraft(row));
    }
  }
  return latest;
}

function rowToDraft(row: {
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
  createdAt: Date;
  updatedAt: Date;
}): DraftRow {
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    payload: JSON.parse(row.payload) as CampaignDraftPayload,
  };
}
