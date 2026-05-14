'use client';

import type { Recommendation } from '@/lib/ai/analyze';
import type { DraftRow } from '@/lib/drafts';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { SmsSendRow } from '@/lib/sms-sends';
import { computeRecStatus } from '@/lib/rec-status';
import { DraftView } from './DraftView';

const PRIORITY_STYLES: Record<Recommendation['priority'], string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-zinc-400 text-white',
};

export function RecommendationCard({
  rec,
  draft,
  isDrafting,
  isRefining,
  isUpdatingStatus,
  sendingPieceIndex,
  lastSendResultByPiece,
  completionsByPiece,
  togglingPieceIndex,
  onDraft,
  onRefine,
  onSetStatus,
  onSendSms,
  onSegmentBlastSent,
  onToggleCompletion,
}: {
  rec: Recommendation;
  draft: DraftRow | undefined;
  isDrafting: boolean;
  isRefining: boolean;
  isUpdatingStatus: boolean;
  sendingPieceIndex: number | null;
  lastSendResultByPiece: Record<number, SmsSendRow | null>;
  completionsByPiece: Record<number, PieceCompletionRow | null>;
  togglingPieceIndex: number | null;
  onDraft: () => void;
  onRefine: (feedback: string) => void;
  onSetStatus: (status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (pieceIndex: number, phone: string, bodyOverride: string | null) => void;
  onSegmentBlastSent: () => void;
  onToggleCompletion: (
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
  ) => void;
}) {
  const progress = computeRecStatus(draft, completionsByPiece);
  return (
    <article className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
      <header className="flex items-start gap-3 mb-3">
        <span
          className={`text-[10px] tracking-widest uppercase font-semibold px-2 py-0.5 ${
            PRIORITY_STYLES[rec.priority]
          }`}
        >
          {rec.priority}
        </span>
        <h5 className="flex-1 font-semibold text-zinc-900 dark:text-zinc-100">{rec.title}</h5>
        <span
          className={`text-[10px] tracking-widest uppercase font-medium px-2 py-0.5 whitespace-nowrap ${progress.badgeClass}`}
          title="Progress on this recommendation"
        >
          {progress.label}
        </span>
      </header>

      <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
        <span className="font-medium text-zinc-500">Why · </span>
        {rec.rationale}
      </p>

      <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
        <span className="font-medium text-zinc-500">Expected impact · </span>
        {rec.expectedImpact}
      </p>

      {rec.estimatedBudgetBdt != null && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
          <span className="font-medium text-zinc-500">Suggested budget · </span>
          ৳{rec.estimatedBudgetBdt.toLocaleString()}/month
        </p>
      )}

      <div className="mt-3">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          First actions this week
        </p>
        <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          {rec.firstActionsThisWeek.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-400">→</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-900 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {rec.requiresHumanForExecution && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
            ⚠ requires human creative
          </span>
        )}
        {rec.relatedSkills.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {rec.relatedSkills.map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-mono text-[10px]"
              >
                {s}
              </span>
            ))}
          </span>
        )}

        <div className="ml-auto">
          {!draft && (
            <button
              onClick={onDraft}
              disabled={isDrafting}
              className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase"
            >
              {isDrafting ? 'Drafting…' : 'Draft this campaign'}
            </button>
          )}
        </div>
      </footer>

      {draft && (
        <DraftView
          draft={draft}
          isRefining={isRefining}
          isUpdatingStatus={isUpdatingStatus}
          sendingPieceIndex={sendingPieceIndex}
          lastSendResultByPiece={lastSendResultByPiece}
          completionsByPiece={completionsByPiece}
          togglingPieceIndex={togglingPieceIndex}
          onRefine={onRefine}
          onSetStatus={onSetStatus}
          onSendSms={onSendSms}
          onSegmentBlastSent={onSegmentBlastSent}
          onToggleCompletion={onToggleCompletion}
        />
      )}
    </article>
  );
}
