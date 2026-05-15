'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  MessageSquare,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

import type { AnalysisResult } from '@/lib/ai/analyze';
import type { DraftsByRecIndex } from '@/lib/analyses';
import type { ActivityItem } from '@/lib/activity';
import { formatDateTime } from '@/lib/format-tz';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Stats {
  totalRecs: number;
  draftedRecs: number;
  pendingDrafts: number;
  approvedDrafts: number;
  rejectedDrafts: number;
}

function computeStats(result: AnalysisResult, drafts: DraftsByRecIndex): Stats {
  let pending = 0;
  let approved = 0;
  let rejected = 0;
  for (const d of Object.values(drafts)) {
    if (d.status === 'APPROVED') approved += 1;
    else if (d.status === 'REJECTED') rejected += 1;
    else pending += 1;
  }
  return {
    totalRecs: result.recommendations.length,
    draftedRecs: Object.keys(drafts).length,
    pendingDrafts: pending,
    approvedDrafts: approved,
    rejectedDrafts: rejected,
  };
}

const TONE_BORDER: Record<NonNullable<ActivityItem['tone']>, string> = {
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  info: 'border-l-primary',
  danger: 'border-l-destructive',
};

const KIND_ICON = {
  draft: FileText,
  refine: Sparkles,
  status: Check,
  send: Send,
  blast: Users,
  completion: CheckCircle2,
};

export function ActivityPanel({
  analysisId,
  result,
  drafts,
  refreshKey,
}: {
  analysisId: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  refreshKey: number;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => computeStats(result, drafts), [result, drafts]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analyses/${encodeURIComponent(analysisId)}/activity`)
      .then(async (res) => {
        const body = (await res.json()) as
          | { items: ActivityItem[] }
          | { error: string; message: string };
        if (cancelled) return;
        if (!res.ok || 'error' in body) {
          setError('message' in body ? body.message : `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        setItems(body.items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'unknown error');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, refreshKey]);

  const showItems = expanded ? items : items.slice(0, 6);
  const sentSomething = items.some((i) => i.kind === 'send' || i.kind === 'blast');

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
          Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Recommendations" value={stats.totalRecs} />
          <Stat
            label="Drafted"
            value={`${stats.draftedRecs} / ${stats.totalRecs}`}
            tone={stats.draftedRecs === stats.totalRecs ? 'success' : undefined}
          />
          <Stat
            label="Pending review"
            value={stats.pendingDrafts}
            tone={stats.pendingDrafts > 0 ? 'warning' : undefined}
          />
          <Stat
            label="Approved"
            value={stats.approvedDrafts}
            tone={stats.approvedDrafts > 0 ? 'success' : undefined}
          />
          <Stat
            label="Rejected"
            value={stats.rejectedDrafts}
            tone={stats.rejectedDrafts > 0 ? 'danger' : undefined}
          />
        </div>
        {!sentSomething && stats.approvedDrafts > 0 && !loading && (
          <p className="text-[11px] text-muted-foreground">
            {stats.approvedDrafts} approved draft{stats.approvedDrafts === 1 ? '' : 's'} hasn&apos;t
            been sent yet. Scroll to find them and use the Send buttons on SMS pieces.
          </p>
        )}

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">
              Recent activity
            </h3>
            {items.length > 6 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                className="h-7"
              >
                {expanded ? 'Show recent' : `Show all (${items.length})`}
              </Button>
            )}
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-xs text-destructive font-mono break-all">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing has happened in this analysis yet. Draft a recommendation to get started.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {showItems.map((item, i) => {
                const Icon = KIND_ICON[item.kind] ?? MessageSquare;
                const border = TONE_BORDER[item.tone ?? 'info'];
                return (
                  <li
                    key={`${item.at}-${i}`}
                    className={cn('flex items-start gap-2 border-l-2 pl-3 py-1 text-[12px]', border)}
                  >
                    <Icon className="h-3 w-3 text-muted-foreground mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground">
                        <span className="font-medium text-primary">#{item.recIndex + 1}</span>{' '}
                        <span className="text-muted-foreground">·</span>{' '}
                        <span className="break-words">{item.summary}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {formatDateTime(item.at, result.business.timezone)} ·{' '}
                        <span className="italic">{item.recTitle}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'success' && 'text-emerald-400',
          tone === 'warning' && 'text-amber-400',
          tone === 'danger' && 'text-destructive',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </div>
    </div>
  );
}
