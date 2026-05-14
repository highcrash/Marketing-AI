'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { HealthStatus } from '@/lib/health';

interface SummaryResponse {
  status: HealthStatus;
  generatedAt: string;
  issues: Array<{ component: string; message: string }>;
}

const STATUS_DOT: Record<HealthStatus, { color: string; label: string }> = {
  ok: { color: 'bg-emerald-500', label: 'All systems OK' },
  degraded: { color: 'bg-amber-500', label: 'Degraded' },
  down: { color: 'bg-red-600', label: 'Issue detected' },
  unknown: { color: 'bg-zinc-400', label: 'Unknown' },
};

/// Five-minute client poll. The server caches the underlying report
/// for 60s so multiple tabs share a single Anthropic ping every minute
/// (~$0.0001 each); 5min × 12 tabs/hr = ~$0.014/hr worst case.
const POLL_MS = 5 * 60 * 1000;

export function HealthBadge() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [hasFailedOnce, setHasFailedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const res = await fetch('/api/health/summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as SummaryResponse;
        if (!cancelled) setSummary(body);
      } catch {
        if (!cancelled) setHasFailedOnce(true);
      }
    }
    void fetchOnce();
    const handle = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  // First render: small grey dot until we have data.
  const status: HealthStatus = summary?.status ?? (hasFailedOnce ? 'unknown' : 'unknown');
  const style = STATUS_DOT[status];
  const tooltip =
    summary === null
      ? 'Checking health…'
      : summary.issues.length === 0
      ? `${style.label} · checked ${new Date(summary.generatedAt).toLocaleTimeString()}`
      : summary.issues.map((i) => `${i.component}: ${i.message}`).join('\n');

  return (
    <Link
      href="/health"
      title={tooltip}
      className="inline-flex items-center gap-1.5 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600"
    >
      <span className={`inline-block w-2 h-2 ${style.color}`} aria-hidden />
      <span className="text-[10px] uppercase tracking-widest">
        {status === 'ok' ? 'OK' : status === 'down' ? 'Issue' : status === 'degraded' ? 'Degraded' : '…'}
      </span>
      {summary && summary.issues.length > 0 && (
        <span className="text-[10px] text-zinc-500">· {summary.issues.length}</span>
      )}
    </Link>
  );
}
