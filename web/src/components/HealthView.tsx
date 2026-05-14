'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Archive, CheckCircle2, Database, RefreshCw, ScrollText, XCircle, Zap } from 'lucide-react';

import type { CheckResult, HealthReport, HealthStatus, RecentLogEntry } from '@/lib/health';
import { FacebookIcon } from './icons/FacebookIcon';

const STATUS_STYLES: Record<HealthStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  ok: {
    label: 'OK',
    className: 'bg-emerald-950/40 text-emerald-300',
    Icon: CheckCircle2,
  },
  degraded: {
    label: 'Degraded',
    className: 'bg-amber-950/40 text-amber-300',
    Icon: AlertTriangle,
  },
  down: {
    label: 'Down',
    className: 'bg-destructive/15 text-destructive',
    Icon: XCircle,
  },
  unknown: {
    label: 'Unknown',
    className: 'bg-muted text-foreground',
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
          <p className="text-[11px] text-muted-foreground">
            Last checked {new Date(report.generatedAt).toLocaleString()}
          </p>
        )}
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-muted-foreground hover:text-primary disabled:opacity-50 px-2 py-1 border border-border"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking…' : 'Re-check'}
        </button>
      </header>

      {error && (
        <div className="border border-primary/40 bg-destructive/10 p-3 text-xs text-destructive font-mono break-all">
          {error}
        </div>
      )}

      {report && (
        <>
          <Row title="Database (SQLite)" Icon={Database} result={report.db} />
          <Row title="Restora API" Icon={Zap} result={report.restora} />
          <Row title="Anthropic API" Icon={Activity} result={report.anthropic} />

          {report.facebook.length > 0 && (
            <section className="border border-border bg-card">
              <header className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
                <FacebookIcon size={14} className="text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  Facebook pages
                </h2>
              </header>
              <ul className="divide-y divide-border">
                {report.facebook.map((f) => (
                  <FbRow key={f.connectionId} title={f.pageName} subtitle={f.pageId} result={f} />
                ))}
              </ul>
            </section>
          )}

          <BackupRow backups={report.backups} />

          {report.recentLogs.length > 0 && <LogsBlock logs={report.recentLogs} />}
        </>
      )}
    </div>
  );
}

function BackupRow({ backups }: { backups: HealthReport['backups'] }) {
  const status: HealthStatus =
    backups.count === 0
      ? 'down'
      : backups.newestAgeHours == null
      ? 'unknown'
      : backups.newestAgeHours > 36
      ? 'degraded'
      : 'ok';
  const style = STATUS_STYLES[status];
  const StatusIcon = style.Icon;
  const message =
    backups.count === 0
      ? 'No SQLite backups on disk — cron may not be installed'
      : `${backups.count} snapshot${backups.count === 1 ? '' : 's'} kept · newest ${
          backups.newestAt ? new Date(backups.newestAt).toLocaleString() : 'unknown'
        }${backups.newestAgeHours != null ? ` (${backups.newestAgeHours}h ago)` : ''}`;
  return (
    <section className="border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Archive size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              SQLite backups
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 break-words">{message}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 flex-shrink-0 ${style.className}`}
        >
          <StatusIcon size={10} />
          {style.label}
        </span>
      </div>
    </section>
  );
}

function LogsBlock({ logs }: { logs: RecentLogEntry[] }) {
  return (
    <section className="border border-border bg-card">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <ScrollText size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Recent service logs
        </h2>
        <span className="text-[10px] text-muted-foreground ml-auto">
          last {logs.length} lines · journalctl -u marketing-ai.service
        </span>
      </header>
      <ol className="max-h-72 overflow-y-auto divide-y divide-border font-mono text-[11px]">
        {logs.map((l, i) => (
          <li
            key={`${l.at}-${i}`}
            className={`px-4 py-1.5 flex items-start gap-3 ${
              l.level === 'error'
                ? 'text-destructive bg-primary/5'
                : 'text-foreground/90'
            }`}
          >
            <span className="text-muted-foreground/70 flex-shrink-0">
              {new Date(l.at).toLocaleTimeString()}
            </span>
            <span className="break-all whitespace-pre-wrap">{l.message}</span>
          </li>
        ))}
      </ol>
    </section>
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
    <section className="border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Icon size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 break-words">{result.message}</div>
            {result.detail && (
              <p className="mt-1 text-[11px] text-muted-foreground dark:text-muted-foreground/70 font-mono break-all whitespace-pre-wrap">
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
            <div className="text-[10px] text-muted-foreground mt-1 font-mono">{result.latencyMs}ms</div>
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
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground font-mono">page {subtitle}</div>
        <p className="text-[11px] text-muted-foreground mt-1 break-words">{result.message}</p>
        {result.detail && (
          <p className="text-[11px] text-muted-foreground dark:text-muted-foreground/70 mt-1 font-mono break-all whitespace-pre-wrap">
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
          <div className="text-[10px] text-muted-foreground mt-1 font-mono">{result.latencyMs}ms</div>
        )}
      </div>
    </li>
  );
}
