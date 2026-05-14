import type { DraftRow } from './drafts';
import type { PieceCompletionRow } from './piece-completions';

/// Lifecycle status of one recommendation, derived from its draft state
/// + piece completions. Used both for the per-rec badge in
/// RecommendationCard and for filtering on the dashboard.
export type RecStatus = 'not-drafted' | 'drafted' | 'rejected' | 'approved' | 'in-progress' | 'done';

export interface RecStatusInfo {
  status: RecStatus;
  label: string;
  /// Tailwind classes for the badge. Kept here so the dashboard filter
  /// chips and the per-card badge stay visually in sync.
  badgeClass: string;
  completedPieces: number;
  totalPieces: number;
}

export function computeRecStatus(
  draft: DraftRow | undefined,
  completionsByPiece: Record<number, PieceCompletionRow | null>,
): RecStatusInfo {
  if (!draft) {
    return {
      status: 'not-drafted',
      label: 'Not drafted',
      badgeClass:
        'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800',
      completedPieces: 0,
      totalPieces: 0,
    };
  }
  if (draft.status === 'REJECTED') {
    return {
      status: 'rejected',
      label: 'Rejected',
      badgeClass: 'bg-amber-600 text-white',
      completedPieces: 0,
      totalPieces: draft.payload.pieces?.length ?? 0,
    };
  }
  if (draft.status === 'PENDING_REVIEW') {
    return {
      status: 'drafted',
      label: 'Drafted',
      badgeClass: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      completedPieces: 0,
      totalPieces: draft.payload.pieces?.length ?? 0,
    };
  }
  const totalPieces = draft.payload.pieces?.length ?? 0;
  const completedPieces = Object.values(completionsByPiece ?? {}).filter(Boolean).length;
  if (totalPieces === 0 || completedPieces === 0) {
    return {
      status: 'approved',
      label: 'Approved',
      badgeClass: 'bg-emerald-600 text-white',
      completedPieces,
      totalPieces,
    };
  }
  if (completedPieces < totalPieces) {
    return {
      status: 'in-progress',
      label: `In progress · ${completedPieces}/${totalPieces}`,
      badgeClass: 'bg-blue-600 text-white',
      completedPieces,
      totalPieces,
    };
  }
  return {
    status: 'done',
    label: `Done · ${totalPieces}/${totalPieces}`,
    badgeClass: 'bg-emerald-700 text-white',
    completedPieces,
    totalPieces,
  };
}
