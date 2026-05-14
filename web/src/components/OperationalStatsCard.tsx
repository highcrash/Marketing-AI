'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, DollarSign } from 'lucide-react';

import type { OperationalStats } from '@/lib/stats';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function OperationalStatsCard({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<OperationalStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats/monthly')
      .then(async (res) => {
        const body = (await res.json()) as
          | { stats: OperationalStats }
          | { error: string; message: string };
        if (cancelled) return;
        if (!res.ok || 'error' in body) {
          setError('message' in body ? body.message : `HTTP ${res.status}`);
          return;
        }
        setStats(body.stats);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Stats failed</AlertTitle>
        <AlertDescription className="font-mono break-all">{error}</AlertDescription>
      </Alert>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            This month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const since = new Date(stats.since).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card>
      <CardHeader className="py-4">
        <CardTitle className="flex items-center justify-between gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Since {since}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <Row label="Audits" value={stats.audits} />
          <Row label="Drafts" value={stats.drafts} />
          <Row label="Refines" value={stats.refines} />
          <Row label="Approved" value={stats.draftsApproved} tone="success" />
          <Row label="Single sends" value={`${stats.singleSendsSuccess}/${stats.singleSends}`} />
          <Row label="Blasts" value={stats.blasts} />
          <Row label="Blast recipients" value={stats.blastRecipients} />
          <Row label="Recipients sent" value={stats.blastSent} />
          <Row
            label="Scheduled pending"
            value={stats.scheduledPending}
            tone={stats.scheduledPending > 0 ? 'info' : undefined}
          />
          <Row
            label="Recurring active"
            value={stats.recurringActive}
            tone={stats.recurringActive > 0 ? 'info' : undefined}
          />
          <Row
            label="Pieces done"
            value={stats.piecesCompleted}
            tone={stats.piecesCompleted > 0 ? 'success' : undefined}
          />
        </div>

        <Separator />

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground inline-flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Estimated AI spend
            </span>
            <span className="font-mono font-medium text-foreground tabular-nums">
              ${stats.estimatedAiSpendUsd.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Approximate. Override rates with ANTHROPIC_INPUT_USD_PER_M etc. in .env.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'success' | 'info';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono font-medium tabular-nums',
          tone === 'success' && 'text-emerald-400',
          tone === 'info' && 'text-primary',
          !tone && 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}
