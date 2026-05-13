import { prisma } from './db';

export interface PieceCompletionRow {
  id: string;
  draftId: string;
  pieceIndex: number;
  notes: string | null;
  source: string;
  completedAt: string;
}

function rowToCompletion(row: {
  id: string;
  draftId: string;
  pieceIndex: number;
  notes: string | null;
  source: string;
  completedAt: Date;
}): PieceCompletionRow {
  return {
    id: row.id,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    notes: row.notes,
    source: row.source,
    completedAt: row.completedAt.toISOString(),
  };
}

/// Mark a piece complete. Idempotent — calling on an already-complete
/// piece updates `notes` + `source` but doesn't duplicate the row.
export async function markPieceComplete(params: {
  draftId: string;
  pieceIndex: number;
  notes?: string | null;
  source?: string;
}): Promise<PieceCompletionRow> {
  const row = await prisma.pieceCompletion.upsert({
    where: {
      draftId_pieceIndex: { draftId: params.draftId, pieceIndex: params.pieceIndex },
    },
    create: {
      draftId: params.draftId,
      pieceIndex: params.pieceIndex,
      notes: params.notes ?? null,
      source: params.source ?? 'manual',
    },
    update: {
      notes: params.notes ?? null,
      source: params.source ?? 'manual',
    },
  });
  return rowToCompletion(row);
}

/// Uncheck. Removes the completion row entirely. Idempotent.
export async function unmarkPieceComplete(
  draftId: string,
  pieceIndex: number,
): Promise<void> {
  await prisma.pieceCompletion
    .delete({
      where: { draftId_pieceIndex: { draftId, pieceIndex } },
    })
    .catch(() => undefined);
}

/// All completions for a draft, keyed by pieceIndex for fast lookup.
export async function listCompletionsForDraft(
  draftId: string,
): Promise<Record<number, PieceCompletionRow>> {
  const rows = await prisma.pieceCompletion.findMany({
    where: { draftId },
  });
  const out: Record<number, PieceCompletionRow> = {};
  for (const row of rows) out[row.pieceIndex] = rowToCompletion(row);
  return out;
}
