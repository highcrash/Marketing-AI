'use client';

import { useEffect, useState } from 'react';
import { GitCompare, Plus, Minus, TrendingUp, TrendingDown } from 'lucide-react';

import type { AuditComparison } from '@/lib/audit-compare';

const CATEGORY_LABEL: Record<string, string> = {
  acquisition: 'Acquisition',
  retention: 'Retention',
  pricing: 'Pricing',
  'product-mix': 'Product mix',
  'channel-strategy': 'Channel strategy',
  content: 'Content',
  operations: 'Operations',
  brand: 'Brand',
};

export function AuditComparisonPanel({ analysisId }: { analysisId: string }) {
  const [comparison, setComparison] = useState<AuditComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analyses/${encodeURIComponent(analysisId)}/comparison`)
      .then(async (res) => {
        const body = (await res.json()) as
          | { comparison: AuditComparison | null }
          | { error: string; message: string };
        if (cancelled) return;
        if (!res.ok || 'error' in body) {
          setError('message' in body ? body.message : `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        setComparison(body.comparison);
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
  }, [analysisId]);

  if (loading) return null;
  if (error) return null; // Comparison is bonus — silent fail rather than scary banner.
  if (!comparison) return null; // First audit — nothing to compare to.

  const noChanges =
    comparison.newRecommendationTitles.length === 0 &&
    comparison.removedRecommendationTitles.length === 0 &&
    comparison.categoryShifts.length === 0;

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 inline-flex items-center gap-2">
          <GitCompare size={14} />
          vs previous audit
        </h3>
        <p className="text-[11px] text-zinc-500">
          {comparison.daysBetween} day{comparison.daysBetween === 1 ? '' : 's'} ago ·{' '}
          {new Date(comparison.previousGeneratedAt).toLocaleString()}
        </p>
      </div>

      {noChanges && (
        <p className="text-xs text-zinc-500 italic">
          Same recommendations and same category mix as the previous audit. The data hasn&apos;t
          shifted enough for the AI to change its mind.
        </p>
      )}

      {comparison.newRecommendationTitles.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-2 inline-flex items-center gap-1">
            <Plus size={11} /> New this run · {comparison.newRecommendationTitles.length}
          </p>
          <ul className="space-y-1 text-[12px] text-zinc-700 dark:text-zinc-300">
            {comparison.newRecommendationTitles.map((title, i) => (
              <li key={i} className="border-l-2 border-emerald-500 pl-3 py-0.5">
                {title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {comparison.removedRecommendationTitles.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-2 inline-flex items-center gap-1">
            <Minus size={11} /> No longer suggested · {comparison.removedRecommendationTitles.length}
          </p>
          <ul className="space-y-1 text-[12px] text-zinc-600 dark:text-zinc-400">
            {comparison.removedRecommendationTitles.map((title, i) => (
              <li key={i} className="border-l-2 border-amber-500 pl-3 py-0.5 line-through opacity-80">
                {title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {comparison.categoryShifts.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Category shifts
          </p>
          <ul className="space-y-1 text-[11px] text-zinc-700 dark:text-zinc-300">
            {comparison.categoryShifts.map((s) => (
              <li key={s.category} className="flex items-center justify-between">
                <span>{CATEGORY_LABEL[s.category] ?? s.category}</span>
                <span className="font-mono inline-flex items-center gap-1">
                  {s.previousCount} → {s.currentCount}{' '}
                  <span
                    className={
                      s.delta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {s.delta > 0 ? <TrendingUp size={10} className="inline" /> : <TrendingDown size={10} className="inline" />}
                    {s.delta > 0 ? '+' : ''}{s.delta}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
