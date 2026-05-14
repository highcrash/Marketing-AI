'use client';

import { useMemo, useState } from 'react';
import type { AnalysisResult, Recommendation } from '@/lib/ai/analyze';
import type { CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { SmsSendRow } from '@/lib/sms-sends';
import { computeRecStatus, type RecStatus } from '@/lib/rec-status';
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
  type Filter = 'all' | 'open' | RecStatus;
  const [filter, setFilter] = useState<Filter>('all');

  /// Compute status per rec once so both the chip-counts and the
  /// per-card filter use the same numbers.
  const recsWithStatus = useMemo(() => {
    return result.recommendations.map((rec, recIndex) => {
      const draft = drafts[recIndex];
      const perPieceCompletions: Record<number, PieceCompletionRow | null> = {};
      if (draft) {
        for (const [key, val] of Object.entries(completions)) {
          if (key.startsWith(`${draft.id}:`)) {
            const idx = Number(key.slice(draft.id.length + 1));
            if (!Number.isNaN(idx)) perPieceCompletions[idx] = val;
          }
        }
      }
      const info = computeRecStatus(draft, perPieceCompletions);
      return { rec, recIndex, status: info.status };
    });
  }, [result.recommendations, drafts, completions]);

  const counts = useMemo(() => {
    const c: Record<RecStatus, number> = {
      'not-drafted': 0,
      drafted: 0,
      rejected: 0,
      approved: 0,
      'in-progress': 0,
      done: 0,
    };
    for (const r of recsWithStatus) c[r.status] += 1;
    return c;
  }, [recsWithStatus]);

  const openCount =
    counts['not-drafted'] + counts.drafted + counts.approved + counts['in-progress'];

  /// Filter: 'open' means anything still needing work (not done, not
  /// rejected). Status-specific filters match exactly.
  function passesFilter(status: RecStatus): boolean {
    if (filter === 'all') return true;
    if (filter === 'open')
      return status === 'not-drafted' || status === 'drafted' || status === 'approved' || status === 'in-progress';
    return status === filter;
  }

  // Keep recommendations in their original order so recIndex matches the
  // canonical position on the saved Analysis row (drafts reference recs by
  // index). We group visually within that ordering — but only after the
  // filter is applied so empty categories collapse.
  const filteredOrdered = recsWithStatus.filter((r) => passesFilter(r.status));
  const grouped: Record<string, Array<{ rec: Recommendation; recIndex: number }>> = {};
  for (const item of filteredOrdered) {
    (grouped[item.rec.category] ??= []).push({ rec: item.rec, recIndex: item.recIndex });
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

      <section className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Recommendations · {result.recommendations.length}
          </h3>
          <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-widest">
            <FilterChip label={`All · ${result.recommendations.length}`} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterChip label={`Open · ${openCount}`} active={filter === 'open'} onClick={() => setFilter('open')} tone="open" />
            <FilterChip label={`Not drafted · ${counts['not-drafted']}`} active={filter === 'not-drafted'} onClick={() => setFilter('not-drafted')} tone="muted" />
            <FilterChip label={`Drafted · ${counts.drafted}`} active={filter === 'drafted'} onClick={() => setFilter('drafted')} tone="muted" />
            <FilterChip label={`Approved · ${counts.approved}`} active={filter === 'approved'} onClick={() => setFilter('approved')} tone="success" />
            <FilterChip label={`In progress · ${counts['in-progress']}`} active={filter === 'in-progress'} onClick={() => setFilter('in-progress')} tone="info" />
            <FilterChip label={`Done · ${counts.done}`} active={filter === 'done'} onClick={() => setFilter('done')} tone="success" />
            {counts.rejected > 0 && (
              <FilterChip label={`Rejected · ${counts.rejected}`} active={filter === 'rejected'} onClick={() => setFilter('rejected')} tone="warning" />
            )}
          </div>
        </div>
        {filteredOrdered.length === 0 && (
          <p className="text-xs text-zinc-500 italic">
            No recommendations match this filter.{' '}
            <button onClick={() => setFilter('all')} className="text-red-600 hover:underline not-italic">
              Clear filter
            </button>
          </p>
        )}
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

type ChipTone = 'muted' | 'success' | 'info' | 'warning' | 'open';

function FilterChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: ChipTone;
}) {
  const inactive =
    tone === 'success'
      ? 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
      : tone === 'info'
      ? 'text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900 hover:bg-blue-50 dark:hover:bg-blue-950/40'
      : tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900 hover:bg-amber-50 dark:hover:bg-amber-950/40'
      : tone === 'open'
      ? 'text-red-700 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40'
      : 'text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900';
  const activeCls =
    tone === 'success'
      ? 'bg-emerald-600 text-white border-emerald-600'
      : tone === 'info'
      ? 'bg-blue-600 text-white border-blue-600'
      : tone === 'warning'
      ? 'bg-amber-600 text-white border-amber-600'
      : tone === 'open'
      ? 'bg-red-600 text-white border-red-600'
      : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100';
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 border ${active ? activeCls : inactive}`}
    >
      {label}
    </button>
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
