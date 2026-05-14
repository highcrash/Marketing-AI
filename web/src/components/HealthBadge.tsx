'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import type { HealthStatus } from '@/lib/health';
import { cn } from '@/lib/utils';

interface SummaryResponse {
  status: HealthStatus;
  generatedAt: string;
  issues: Array<{ component: string; message: string }>;
}

const STATUS_STYLES: Record<
  HealthStatus,
  {
    label: string;
    dot: string;
    text: string;
    icon: typeof CheckCircle2;
  }
> = {
  ok: {
    label: 'OK',
    dot: 'bg-emerald-500 shadow-[0_0_8px_oklch(0.7_0.2_150/0.5)]',
    text: 'text-emerald-400',
    icon: CheckCircle2,
  },
  degraded: {
    label: 'Degraded',
    dot: 'bg-amber-500 shadow-[0_0_8px_oklch(0.75_0.15_85/0.5)]',
    text: 'text-amber-400',
    icon: AlertTriangle,
  },
  down: {
    label: 'Issue',
    dot: 'bg-destructive shadow-[0_0_8px_oklch(0.65_0.25_25/0.5)]',
    text: 'text-destructive',
    icon: XCircle,
  },
  unknown: {
    label: '…',
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    icon: Activity,
  },
};

const POLL_MS = 5 * 60 * 1000;

export function HealthBadge() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const res = await fetch('/api/health/summary');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as SummaryResponse;
        if (!cancelled) setSummary(body);
      } catch {
        if (!cancelled) setSummary(null);
      }
    }
    void fetchOnce();
    const handle = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  const status: HealthStatus = summary?.status ?? 'unknown';
  const style = STATUS_STYLES[status];
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
      className={cn(
        'inline-flex items-center gap-2 px-2 py-1 border border-border hover:border-primary transition-colors',
        'text-[10px] uppercase tracking-widest',
      )}
    >
      <span className={cn('inline-block w-1.5 h-1.5', style.dot)} aria-hidden />
      <span className={style.text}>{style.label}</span>
      {summary && summary.issues.length > 0 && (
        <span className="text-muted-foreground">· {summary.issues.length}</span>
      )}
    </Link>
  );
}
