'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, RefreshCw, XCircle, Zap } from 'lucide-react';

import type { CheckResult, HealthReport, HealthStatus } from '@/lib/health';
import { FacebookIcon } from './icons/FacebookIcon';

const STATUS_STYLES: Record<HealthStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ok: {
    label: 'OK',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    Icon: AlertTriangle,
  },
  down: {
    label: 'Down',
    className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    Icon: XCircle,
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
    Icon: AlertTriangle,
  },
};

type AnyIcon = React.ComponentType<{ size?: number; className?: string }>;

export function HealthView() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      const body = (await res.json()) as HealthReport | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setReport(body);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        {report && (
          <p className="text-[11px] text-zinc-500">
            Last checked {new Date(report.generatedAt).toLocaleString()}
          </p>
        )}
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-zinc-600 dark:text-zinc-400 hover:text-red-600 disabled:opacity-50 px-2 py-1 border border-zinc-200 dark:border-zinc-800"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </header>

      {error && (
        <div className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-xs text-red-700 dark:text-red-300 font-mono break-all">
          {error}
        </div>
      )}

      {report && (
        <>
          <Row title="Database (SQLite)" Icon={Database} result={report.db} />
          <Row title="Restora API" Icon={Zap} result={report.restora} />
          <Row title="Anthropic API" Icon={Activity} result={report.anthropic} />

          {report.facebook.length > 0 && (
            <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
              <header className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-900">
                <FacebookIcon size={14} className="text-blue-600" />
                <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
                  Facebook pages
                </h2>
              </header>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {report.facebook.map((f) => (
                  <FbRow key={f.connectionId} title={f.pageName} subtitle={f.pageId} result={f} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  title,
  Icon,
  result,
}: {
  title: string;
  Icon: AnyIcon;
  result: CheckResult;
}) {
  const style = STATUS_STYLES[result.status];
  const StatusIcon = style.Icon;
  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Icon size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</div>
            <div className="text-[11px] text-zinc-500 mt-0.5 break-words">{result.message}</div>
            {result.detail && (
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono break-all whitespace-pre-wrap">
                {result.detail}
              </p>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${style.className}`}
          >
            <StatusIcon size={10} />
            {style.label}
          </span>
          {result.latencyMs != null && (
            <div className="text-[10px] text-zinc-500 mt-1 font-mono">{result.latencyMs}ms</div>
          )}
        </div>
      </div>
    </section>
  );
}

function FbRow({
  title,
  subtitle,
  result,
}: {
  title: string;
  subtitle: string;
  result: CheckResult;
}) {
  const style = STATUS_STYLES[result.status];
  const StatusIcon = style.Icon;
  return (
    <li className="px-4 py-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{title}</div>
        <div className="text-[10px] text-zinc-500 font-mono">page {subtitle}</div>
        <p className="text-[11px] text-zinc-500 mt-1 break-words">{result.message}</p>
        {result.detail && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 font-mono break-all whitespace-pre-wrap">
            {result.detail}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${style.className}`}
        >
          <StatusIcon size={10} />
          {style.label}
        </span>
        {result.latencyMs != null && (
          <div className="text-[10px] text-zinc-500 mt-1 font-mono">{result.latencyMs}ms</div>
        )}
      </div>
    </li>
  );
}
