'use client';

import { useEffect, useState } from 'react';
import { Activity, DollarSign } from 'lucide-react';

import type { OperationalStats } from '@/lib/stats';

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
      <div className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
        <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Stats failed</p>
        <p className="text-[10px] text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="border border-zinc-200 dark:border-zinc-800 p-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 inline-flex items-center gap-1.5">
          <Activity size={11} />
          This month
        </p>
        <p className="text-[11px] text-zinc-500 mt-2">Loading…</p>
      </div>
    );
  }

  const since = new Date(stats.since).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 inline-flex items-center gap-1.5">
          <Activity size={11} />
          Since {since}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <Row label="Audits" value={stats.audits} />
        <Row label="Drafts" value={stats.drafts} />
        <Row label="Refines" value={stats.refines} />
        <Row label="Approved" value={stats.draftsApproved} tone="success" />
        <Row label="Single sends" value={`${stats.singleSendsSuccess}/${stats.singleSends}`} />
        <Row label="Blasts" value={stats.blasts} />
        <Row label="Blast recipients" value={stats.blastRecipients} />
        <Row label="Recipients sent" value={stats.blastSent} />
        <Row label="Scheduled pending" value={stats.scheduledPending} tone={stats.scheduledPending > 0 ? 'info' : undefined} />
        <Row label="Recurring active" value={stats.recurringActive} tone={stats.recurringActive > 0 ? 'info' : undefined} />
      </div>

      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-900">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500 inline-flex items-center gap-1">
            <DollarSign size={11} />
            Estimated AI spend
          </span>
          <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
            ${stats.estimatedAiSpendUsd.toFixed(2)}
          </span>
        </div>
        <p className="text-[9px] text-zinc-400 mt-1">
          Approximate. Override rates with ANTHROPIC_INPUT_USD_PER_M etc. in .env.
        </p>
      </div>
    </div>
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
  const valueClass =
    tone === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'info'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-zinc-800 dark:text-zinc-200';
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}
