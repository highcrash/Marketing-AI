'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Target, Users } from 'lucide-react';

import type { AnalysisResult, Recommendation } from '@/lib/ai/analyze';
import type { CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { SmsSendRow } from '@/lib/sms-sends';
import { computeRecStatus, type RecStatus } from '@/lib/rec-status';
import { cn } from '@/lib/utils';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  sendingPieceKey: string | null;
  lastSendResultsByPiece: Record<string, SmsSendRow | null>;
  completions: CompletionsByKey;
  togglingCompletionKey: string | null;
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
    attachment?: { path: string; name: string; mime: string; size: number } | null,
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

  function passesFilter(status: RecStatus): boolean {
    if (filter === 'all') return true;
    if (filter === 'open')
      return (
        status === 'not-drafted' ||
        status === 'drafted' ||
        status === 'approved' ||
        status === 'in-progress'
      );
    return status === filter;
  }

  const filteredOrdered = recsWithStatus.filter((r) => passesFilter(r.status));
  const grouped: Record<string, Array<{ rec: Recommendation; recIndex: number }>> = {};
  for (const item of filteredOrdered) {
    (grouped[item.rec.category] ??= []).push({ rec: item.rec, recIndex: item.recIndex });
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => priorityRank(a.rec.priority) - priorityRank(b.rec.priority));
  }

  return (
    <div className="space-y-6">
      {/* Audit summary */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-2xl">{result.business.name}</CardTitle>
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">
              {new Date(result.generatedAt).toLocaleString()} · {result.model}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-foreground/90 leading-relaxed">{result.summary}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
            <TokenStat label="Input" value={result.inputTokens} />
            <TokenStat
              label="Cache read"
              value={result.cacheReadTokens}
              hint={result.cacheReadTokens > 0 ? 'warm hit' : 'first run'}
            />
            <TokenStat label="Cache write" value={result.cacheWriteTokens} />
            <TokenStat label="Output" value={result.outputTokens} />
          </div>
        </CardContent>
      </Card>

      {/* Audience confidence fail-safe banner */}
      {result.audience && result.audience.confidence === 'low' && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Confirm the audience before acting on segment-specific recs</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>The AI&apos;s confidence in the inferred audience is low. Sanity-check:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.audience.needsConfirmation.map((n, i) => (
                <li key={i} className="text-sm">{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <ActivityPanel
        analysisId={analysisId}
        result={result}
        drafts={drafts}
        refreshKey={activityRefreshKey}
      />

      <AuditComparisonPanel analysisId={analysisId} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inferred goals */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Inferred goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.inferredGoals.map((g, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground/90 leading-relaxed">
                  <span className="text-primary mt-1">●</span>
                  {g}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Audience profile */}
        {result.audience && (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="flex items-center justify-between gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Audience
                </span>
                <Badge
                  variant={
                    result.audience.confidence === 'high'
                      ? 'success'
                      : result.audience.confidence === 'medium'
                      ? 'warning'
                      : 'destructive'
                  }
                >
                  {result.audience.confidence} confidence
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap text-foreground/90">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{result.audience.region}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{result.audience.country}</span>
              </div>
              {result.audience.highValueSegments.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    High-value segments
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {result.audience.highValueSegments.map((s, i) => (
                      <Badge key={i} variant="muted">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {result.audience.demographics.length > 0 && (
                <ul className="text-foreground/90 space-y-1 text-[12px]">
                  {result.audience.demographics.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground mt-1">·</span>
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recommendations + filter chips */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recommendations · {result.recommendations.length}
          </h3>
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip label="All" count={result.recommendations.length} active={filter === 'all'} onClick={() => setFilter('all')} />
            <FilterChip label="Open" count={openCount} active={filter === 'open'} onClick={() => setFilter('open')} tone="primary" />
            <FilterChip label="Not drafted" count={counts['not-drafted']} active={filter === 'not-drafted'} onClick={() => setFilter('not-drafted')} />
            <FilterChip label="Drafted" count={counts.drafted} active={filter === 'drafted'} onClick={() => setFilter('drafted')} />
            <FilterChip label="Approved" count={counts.approved} active={filter === 'approved'} onClick={() => setFilter('approved')} tone="success" />
            <FilterChip label="In progress" count={counts['in-progress']} active={filter === 'in-progress'} onClick={() => setFilter('in-progress')} tone="info" />
            <FilterChip label="Done" count={counts.done} active={filter === 'done'} onClick={() => setFilter('done')} tone="success" />
            {counts.rejected > 0 && (
              <FilterChip label="Rejected" count={counts.rejected} active={filter === 'rejected'} onClick={() => setFilter('rejected')} tone="warning" />
            )}
          </div>
        </div>
        {filteredOrdered.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No recommendations match this filter.{' '}
            <button
              onClick={() => setFilter('all')}
              className="text-primary hover:text-accent underline-offset-4 hover:underline not-italic"
            >
              Clear filter
            </button>
          </p>
        )}
        {Object.entries(grouped).map(([category, recs]) => (
          <div key={category} className="space-y-3">
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
              {CATEGORY_LABEL[category as Recommendation['category']] ?? category} · {recs.length}
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
                    onToggleCompletion={(pieceIndex, currentlyComplete, notes, attachment) =>
                      draft &&
                      onToggleCompletion(
                        draft.id,
                        pieceIndex,
                        currentlyComplete,
                        notes,
                        attachment,
                      )
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

type ChipTone = 'primary' | 'success' | 'info' | 'warning';

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: ChipTone;
}) {
  const activeBg =
    tone === 'success'
      ? 'bg-emerald-600 text-white border-emerald-600'
      : tone === 'info'
      ? 'bg-blue-600 text-white border-blue-600'
      : tone === 'warning'
      ? 'bg-amber-600 text-white border-amber-600'
      : tone === 'primary'
      ? 'bg-primary text-primary-foreground border-primary'
      : 'bg-foreground text-background border-foreground';
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-1 text-[10px] uppercase tracking-widest border transition-colors gap-1.5 inline-flex items-center',
        active ? activeBg : 'text-muted-foreground border-border hover:border-primary hover:text-primary',
      )}
    >
      {label}
      <span className="font-mono opacity-80">{count}</span>
    </button>
  );
}

function TokenStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground tabular-nums">
        {value.toLocaleString()}
        {hint && <span className="ml-2 text-[10px] text-muted-foreground">({hint})</span>}
      </div>
    </div>
  );
}
