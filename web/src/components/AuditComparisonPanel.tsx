'use client';

import { useEffect, useState } from 'react';
import { GitCompare, Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react';

import type { AuditComparison } from '@/lib/audit-compare';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analyses/${encodeURIComponent(analysisId)}/comparison`)
      .then(async (res) => {
        const body = (await res.json()) as
          | { comparison: AuditComparison | null }
          | { error: string; message: string };
        if (cancelled) return;
        if (!res.ok || 'error' in body) {
          setLoading(false);
          return;
        }
        setComparison(body.comparison);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  if (loading || !comparison) return null;

  const noChanges =
    comparison.newRecommendationTitles.length === 0 &&
    comparison.removedRecommendationTitles.length === 0 &&
    comparison.categoryShifts.length === 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 py-4">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
          <GitCompare className="h-4 w-4 text-primary" />
          vs previous audit
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          {comparison.daysBetween} day{comparison.daysBetween === 1 ? '' : 's'} ago ·{' '}
          {new Date(comparison.previousGeneratedAt).toLocaleString()}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {noChanges && (
          <p className="text-sm text-muted-foreground italic">
            Same recommendations and same category mix as the previous audit. The data hasn&apos;t
            shifted enough for the AI to change its mind.
          </p>
        )}

        {comparison.newRecommendationTitles.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-2 inline-flex items-center gap-1">
              <Plus className="h-3 w-3" /> New this run · {comparison.newRecommendationTitles.length}
            </p>
            <ul className="space-y-1 text-[12px] text-foreground">
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
            <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-2 inline-flex items-center gap-1">
              <Minus className="h-3 w-3" /> No longer suggested ·{' '}
              {comparison.removedRecommendationTitles.length}
            </p>
            <ul className="space-y-1 text-[12px] text-muted-foreground">
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
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Category shifts
            </p>
            <ul className="space-y-1 text-[11px]">
              {comparison.categoryShifts.map((s) => (
                <li key={s.category} className="flex items-center justify-between">
                  <span className="text-foreground">
                    {CATEGORY_LABEL[s.category] ?? s.category}
                  </span>
                  <span className="font-mono inline-flex items-center gap-1 tabular-nums">
                    <span className="text-muted-foreground">
                      {s.previousCount} → {s.currentCount}
                    </span>
                    <span className={cn(s.delta > 0 ? 'text-emerald-400' : 'text-amber-400')}>
                      {s.delta > 0 ? (
                        <TrendingUp className="h-3 w-3 inline" />
                      ) : (
                        <TrendingDown className="h-3 w-3 inline" />
                      )}
                      {s.delta > 0 ? '+' : ''}
                      {s.delta}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
