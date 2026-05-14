import { prisma } from './db';

/// One row in the global completions view. Joins enough draft + analysis
/// info that the user can scan the audit trail without clicking through.
export interface CompletionListItem {
  id: string;
  draftId: string;
  analysisId: string;
  recIndex: number;
  recTitle: string;
  pieceIndex: number;
  pieceTitle: string;
  pieceAssetType: string;
  pieceChannel: string;
  /// Free-text optional note captured at mark-done time. Null when the
  /// user just clicked the checkbox without typing anything.
  notes: string | null;
  /// Where the completion came from. 'manual' means the user clicked the
  /// circle; 'integrated-sms-send' / 'integrated-sms-blast' mean the
  /// platform sent the SMS and auto-marked it.
  source: string;
  completedAt: string;
}

interface DraftPiece {
  title?: unknown;
  assetType?: unknown;
  channel?: unknown;
}

function pieceField(payload: unknown, pieceIndex: number, field: keyof DraftPiece): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as { pieces?: unknown };
  if (!Array.isArray(root.pieces)) return '';
  const piece = root.pieces[pieceIndex] as DraftPiece | undefined;
  if (!piece) return '';
  const v = piece[field];
  return typeof v === 'string' ? v : '';
}

/// All completions for one business, newest first. Capped at 200 so the
/// page renders fast even for power users; old completions stay in the
/// per-analysis activity feed.
export async function listAllCompletions(businessId: string): Promise<CompletionListItem[]> {
  const rows = await prisma.pieceCompletion.findMany({
    where: { draft: { analysis: { businessId } } },
    orderBy: { completedAt: 'desc' },
    take: 200,
    include: {
      draft: {
        select: {
          id: true,
          analysisId: true,
          recIndex: true,
          recTitle: true,
          payload: true,
        },
      },
    },
  });

  return rows.map((r) => {
    const payload = (() => {
      try {
        return JSON.parse(r.draft.payload) as unknown;
      } catch {
        return null;
      }
    })();
    return {
      id: r.id,
      draftId: r.draftId,
      analysisId: r.draft.analysisId,
      recIndex: r.draft.recIndex,
      recTitle: r.draft.recTitle,
      pieceIndex: r.pieceIndex,
      pieceTitle: pieceField(payload, r.pieceIndex, 'title') || `Piece #${r.pieceIndex + 1}`,
      pieceAssetType: pieceField(payload, r.pieceIndex, 'assetType') || 'unknown',
      pieceChannel: pieceField(payload, r.pieceIndex, 'channel') || '',
      notes: r.notes,
      source: r.source,
      completedAt: r.completedAt.toISOString(),
    };
  });
}
