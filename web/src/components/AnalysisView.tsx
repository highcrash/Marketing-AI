'use client';

import type { AnalysisResult, Recommendation } from '@/lib/ai/analyze';
import type { CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { SmsSendRow } from '@/lib/sms-sends';
import { ActivityPanel } from './ActivityPanel';
import { AuditComparisonPanel } from './AuditComparisonPanel';
import { RecommendationCard } from './RecommendationCard';

const EMPTY_SENDS: Record<number, SmsSendRow | null> = {};
const EMPTY_COMPLETIONS: Record<number, PieceCompletionRow | null> = {};

const CATEGORY_LABEL: Record<Recommendation['category'], string> = {
  acquisition: 'Acquisition',
  retention: 'Retention',
  pricing: 'Pricing',
  'product-mix': 'Product mix',
  'channel-strategy': 'Channel strategy',
  content: 'Content',
  operations: 'Operations',
  brand: 'Brand',
};

function priorityRank(p: Recommendation['priority']): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2;
}

interface AnalysisViewProps {
  analysisId: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  draftingIndex: number | null;
  refiningDraftId: string | null;
  updatingStatusDraftId: string | null;
  /// Active SMS send keyed by `${draftId}:${pieceIndex}`. Null when nothing in flight.
  sendingPieceKey: string | null;
  /// Last send result per `${draftId}:${pieceIndex}` from the current session.
  lastSendResultsByPiece: Record<string, SmsSendRow | null>;
  /// All completions for this analysis, keyed `${draftId}:${pieceIndex}`.
  completions: CompletionsByKey;
  /// Active completion-toggle keyed `${draftId}:${pieceIndex}`. Null when nothing in flight.
  togglingCompletionKey: string | null;
  /// Bumped by the dashboard after any state-changing action; triggers
  /// the ActivityPanel to refetch.
  activityRefreshKey: number;
  onDraft: (recIndex: number) => void;
  onRefine: (draftId: string, feedback: string) => void;
  onSetStatus: (draftId: string, status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (
    draftId: string,
    pieceIndex: number,
    phone: string,
    bodyOverride: string | null,
  ) => void;
  onSegmentBlastSent: () => void;
  onToggleCompletion: (
    draftId: string,
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
  ) => void;
}

export function AnalysisView({
  analysisId,
  result,
  drafts,
  draftingIndex,
  refiningDraftId,
  updatingStatusDraftId,
  sendingPieceKey,
  lastSendResultsByPiece,
  completions,
  togglingCompletionKey,
  activityRefreshKey,
  onDraft,
  onRefine,
  onSetStatus,
  onSendSms,
  onSegmentBlastSent,
  onToggleCompletion,
}: AnalysisViewProps) {
  // Keep recommendations in their original order so recIndex matches the
  // canonical position on the saved Analysis row (drafts reference recs by
  // index). We group visually within that ordering.
  const orderedWithIndex = result.recommendations.map((rec, recIndex) => ({ rec, recIndex }));
  const grouped: Record<string, Array<{ rec: Recommendation; recIndex: number }>> = {};
  for (const item of orderedWithIndex) {
    (grouped[item.rec.category] ??= []).push(item);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => priorityRank(a.rec.priority) - priorityRank(b.rec.priority));
  }

  return (
    <div className="space-y-10">
      <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-xl font-semibold">{result.business.name}</h2>
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            {new Date(result.generatedAt).toLocaleString()} · {result.model}
          </span>
        </div>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{result.summary}</p>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <Stat label="Input tokens" value={result.inputTokens.toLocaleString()} />
          <Stat
            label="Cache read"
            value={result.cacheReadTokens.toLocaleString()}
            hint={result.cacheReadTokens > 0 ? 'warm hit' : 'first run'}
          />
          <Stat label="Cache write" value={result.cacheWriteTokens.toLocaleString()} />
          <Stat label="Output tokens" value={result.outputTokens.toLocaleString()} />
        </div>
      </section>

      <ActivityPanel
        analysisId={analysisId}
        result={result}
        drafts={drafts}
        refreshKey={activityRefreshKey}
      />

      <AuditComparisonPanel analysisId={analysisId} />

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">
          Inferred goals
        </h3>
        <ul className="space-y-2">
          {result.inferredGoals.map((g, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-red-600 mt-1">●</span>
              <span className="text-zinc-700 dark:text-zinc-300">{g}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-8">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Recommendations · {result.recommendations.length}
        </h3>
        {Object.entries(grouped).map(([category, recs]) => (
          <div key={category}>
            <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-4">
              {CATEGORY_LABEL[category as Recommendation['category']] ?? category}
            </h4>
            <div className="space-y-4">
              {recs.map(({ rec, recIndex }) => {
                const draft = drafts[recIndex];
                let sendingPieceIndex: number | null = null;
                let perPieceSends: Record<number, SmsSendRow | null> = EMPTY_SENDS;
                let perPieceCompletions: Record<number, PieceCompletionRow | null> = EMPTY_COMPLETIONS;
                let togglingPieceIndex: number | null = null;
                if (draft) {
                  if (sendingPieceKey?.startsWith(`${draft.id}:`)) {
                    const idx = Number(sendingPieceKey.slice(draft.id.length + 1));
                    if (!Number.isNaN(idx)) sendingPieceIndex = idx;
                  }
                  if (togglingCompletionKey?.startsWith(`${draft.id}:`)) {
                    const idx = Number(togglingCompletionKey.slice(draft.id.length + 1));
                    if (!Number.isNaN(idx)) togglingPieceIndex = idx;
                  }
                  const sendsFiltered: Record<number, SmsSendRow | null> = {};
                  for (const [key, val] of Object.entries(lastSendResultsByPiece)) {
                    if (key.startsWith(`${draft.id}:`)) {
                      const idx = Number(key.slice(draft.id.length + 1));
                      if (!Number.isNaN(idx)) sendsFiltered[idx] = val;
                    }
                  }
                  perPieceSends = sendsFiltered;
                  const compFiltered: Record<number, PieceCompletionRow | null> = {};
                  for (const [key, val] of Object.entries(completions)) {
                    if (key.startsWith(`${draft.id}:`)) {
                      const idx = Number(key.slice(draft.id.length + 1));
                      if (!Number.isNaN(idx)) compFiltered[idx] = val;
                    }
                  }
                  perPieceCompletions = compFiltered;
                }
                return (
                  <RecommendationCard
                    key={recIndex}
                    rec={rec}
                    draft={draft}
                    isDrafting={draftingIndex === recIndex}
                    isRefining={!!draft && refiningDraftId === draft.id}
                    isUpdatingStatus={!!draft && updatingStatusDraftId === draft.id}
                    sendingPieceIndex={sendingPieceIndex}
                    lastSendResultByPiece={perPieceSends}
                    completionsByPiece={perPieceCompletions}
                    togglingPieceIndex={togglingPieceIndex}
                    onDraft={() => onDraft(recIndex)}
                    onRefine={(feedback) => draft && onRefine(draft.id, feedback)}
                    onSetStatus={(status) => draft && onSetStatus(draft.id, status)}
                    onSendSms={(pieceIndex, phone, bodyOverride) =>
                      draft && onSendSms(draft.id, pieceIndex, phone, bodyOverride)
                    }
                    onSegmentBlastSent={onSegmentBlastSent}
                    onToggleCompletion={(pieceIndex, currentlyComplete, notes) =>
                      draft && onToggleCompletion(draft.id, pieceIndex, currentlyComplete, notes)
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {value}
        {hint && (
          <span className="ml-2 text-[10px] text-zinc-400 normal-case tracking-normal">({hint})</span>
        )}
      </div>
    </div>
  );
}
