'use client';

import { useEffect, useMemo, useState } from 'react';
import {
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
  info: 'border-l-zinc-400 dark:border-l-zinc-600',
  danger: 'border-l-red-500',
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
  /// Bumped by the parent whenever a state-changing action completes,
  /// triggering a re-fetch.
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
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">
          Status
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <Stat label="Recommendations" value={stats.totalRecs} />
          <Stat
            label="Drafted"
            value={`${stats.draftedRecs} / ${stats.totalRecs}`}
            hint={
              stats.draftedRecs === stats.totalRecs
                ? 'all'
                : stats.draftedRecs === 0
                ? ' '
                : ''
            }
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
          <p className="mt-3 text-[11px] text-zinc-500">
            {stats.approvedDrafts} approved draft{stats.approvedDrafts === 1 ? '' : 's'} hasn&apos;t
            been sent yet. Scroll to find them and use the Send buttons on SMS pieces.
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Recent activity
          </h3>
          {items.length > 6 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] tracking-widest uppercase text-zinc-500 hover:text-red-600"
            >
              {expanded ? 'Show recent' : `Show all (${items.length})`}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : error ? (
          <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-zinc-500">
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
                  className={`flex items-start gap-2 border-l-2 ${border} pl-3 py-1 text-[12px]`}
                >
                  <Icon size={12} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium">#{item.recIndex + 1}</span>{' '}
                      <span className="text-zinc-500">·</span>{' '}
                      <span className="break-words">{item.summary}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                      {new Date(item.at).toLocaleString()} ·{' '}
                      <span className="italic">{item.recTitle}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const valueColor =
    tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : 'text-zinc-800 dark:text-zinc-200';
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold ${valueColor}`}>{value}</div>
      {hint && <div className="text-[10px] text-zinc-400">{hint}</div>}
    </div>
  );
}
