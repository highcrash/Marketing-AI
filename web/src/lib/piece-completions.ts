import { prisma } from './db';

export interface PieceCompletionAttachment {
  /// Public path (e.g. /uploads/<sha>.jpg) the browser can fetch.
  path: string;
  /// Original filename the user uploaded — preserved so the file
  /// renders with a friendly label even though storage is content-
  /// hashed.
  name: string;
  mime: string;
  size: number;
}

export interface PieceCompletionRow {
  id: string;
  draftId: string;
  pieceIndex: number;
  notes: string | null;
  source: string;
  /// Optional proof-of-work file the user attached when marking done
  /// (screenshot of an externally-sent SMS, receipt for printed
  /// materials, photo of the in-store campaign, etc.). Null when
  /// nothing was attached.
  attachment: PieceCompletionAttachment | null;
  completedAt: string;
}

function rowToCompletion(row: {
  id: string;
  draftId: string;
  pieceIndex: number;
  notes: string | null;
  source: string;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  completedAt: Date;
}): PieceCompletionRow {
  return {
    id: row.id,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    notes: row.notes,
    source: row.source,
    attachment:
      row.attachmentPath && row.attachmentName && row.attachmentMime && row.attachmentSize != null
        ? {
            path: row.attachmentPath,
            name: row.attachmentName,
            mime: row.attachmentMime,
            size: row.attachmentSize,
          }
        : null,
    completedAt: row.completedAt.toISOString(),
  };
}

/// Mark a piece complete. Idempotent — calling on an already-complete
/// piece updates notes/source/attachment but doesn't duplicate the
/// row. Pass `attachment: undefined` to leave any prior attachment in
/// place; pass `attachment: null` to explicitly clear it.
export async function markPieceComplete(params: {
  draftId: string;
  pieceIndex: number;
  notes?: string | null;
  source?: string;
  attachment?: PieceCompletionAttachment | null;
}): Promise<PieceCompletionRow> {
  const attachmentFields =
    params.attachment === undefined
      ? {}
      : params.attachment === null
      ? {
          attachmentPath: null,
          attachmentName: null,
          attachmentMime: null,
          attachmentSize: null,
        }
      : {
          attachmentPath: params.attachment.path,
          attachmentName: params.attachment.name,
          attachmentMime: params.attachment.mime,
          attachmentSize: params.attachment.size,
        };
  const row = await prisma.pieceCompletion.upsert({
    where: {
      draftId_pieceIndex: { draftId: params.draftId, pieceIndex: params.pieceIndex },
    },
    create: {
      draftId: params.draftId,
      pieceIndex: params.pieceIndex,
      notes: params.notes ?? null,
      source: params.source ?? 'manual',
      ...(params.attachment != null
        ? {
            attachmentPath: params.attachment.path,
            attachmentName: params.attachment.name,
            attachmentMime: params.attachment.mime,
            attachmentSize: params.attachment.size,
          }
        : {}),
    },
    update: {
      notes: params.notes ?? null,
      source: params.source ?? 'manual',
      ...attachmentFields,
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
