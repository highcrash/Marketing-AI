'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, Repeat, SkipForward, Trash2 } from 'lucide-react';

import type { ScheduledBlastConfig, ScheduledSendRow, ScheduledSingleConfig } from '@/lib/scheduled-sends';
import type { RecurringScheduleRow } from '@/lib/recurring-schedules';
import type { ScheduleListItem } from '@/lib/all-schedules';

type Once = ScheduledSendRow & ScheduleListItem;
type Recurring = RecurringScheduleRow & ScheduleListItem;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function summarise(cfg: ScheduledSingleConfig | ScheduledBlastConfig, kind: 'single' | 'blast'): string {
  if (kind === 'single') return `→ ${(cfg as ScheduledSingleConfig).phone}`;
  const segCfg = cfg as ScheduledBlastConfig;
  const filterKeys = Object.keys(segCfg.segment).filter((k) => segCfg.segment[k as keyof typeof segCfg.segment] != null);
  if (filterKeys.length === 0) return '→ all customers';
  const parts: string[] = [];
  if (segCfg.segment.minSpent != null) parts.push(`spend≥৳${segCfg.segment.minSpent}`);
  if (segCfg.segment.minVisits != null) parts.push(`visits≥${segCfg.segment.minVisits}`);
  if (segCfg.segment.maxLastVisitDays != null) parts.push(`within ${segCfg.segment.maxLastVisitDays}d`);
  if (segCfg.segment.minLoyaltyPoints != null) parts.push(`pts≥${segCfg.segment.minLoyaltyPoints}`);
  return `→ ${parts.join(' · ')}`;
}

export function SchedulesView() {
  const [pendingOnce, setPendingOnce] = useState<Once[]>([]);
  const [recentOnce, setRecentOnce] = useState<Once[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/all-schedules');
      const body = (await res.json()) as
        | { pendingOnce: Once[]; recentOnce: Once[]; recurring: Recurring[] }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setPendingOnce(body.pendingOnce);
      setRecentOnce(body.recentOnce);
      setRecurring(body.recurring);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function cancelOnce(id: string) {
    await fetch(`/api/scheduled-sends/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }
  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/recurring-schedules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    await refresh();
  }
  async function skipNext(id: string) {
    await fetch(`/api/recurring-schedules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skipNext: true }),
    });
    await refresh();
  }
  async function deleteRecurring(id: string) {
    await fetch(`/api/recurring-schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }

  const activeRecurring = recurring.filter((r) => r.active);
  const pausedRecurring = recurring.filter((r) => !r.active);

  return (
    <div className="space-y-8">
      {error && (
        <div className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-xs text-red-700 dark:text-red-300 font-mono break-all">
          {error}
        </div>
      )}

      <Section title="Recurring · active" count={activeRecurring.length}>
        {activeRecurring.length === 0 ? (
          <Empty hint="No active recurring schedules. Create one from any approved SMS piece via the Schedule button." />
        ) : (
          <Table>
            {activeRecurring.map((r) => (
              <RecurringRow
                key={r.id}
                item={r}
                onPause={() => toggleActive(r.id, false)}
                onSkip={() => skipNext(r.id)}
                onDelete={() => deleteRecurring(r.id)}
              />
            ))}
          </Table>
        )}
      </Section>

      {pausedRecurring.length > 0 && (
        <Section title="Recurring · paused" count={pausedRecurring.length}>
          <Table>
            {pausedRecurring.map((r) => (
              <RecurringRow
                key={r.id}
                item={r}
                onPause={() => toggleActive(r.id, true)}
                onSkip={() => skipNext(r.id)}
                onDelete={() => deleteRecurring(r.id)}
                paused
              />
            ))}
          </Table>
        </Section>
      )}

      <Section title="Queued one-off" count={pendingOnce.length}>
        {pendingOnce.length === 0 ? (
          <Empty hint="No one-off sends queued." />
        ) : (
          <Table>
            {pendingOnce.map((s) => (
              <OnceRow key={s.id} item={s} onCancel={() => cancelOnce(s.id)} />
            ))}
          </Table>
        )}
      </Section>

      {recentOnce.length > 0 && (
        <Section title="Recently fired one-off" count={recentOnce.length}>
          <Table>
            {recentOnce.map((s) => (
              <OnceRow key={s.id} item={s} showStatus />
            ))}
          </Table>
        </Section>
      )}

      {loading && <p className="text-[11px] text-zinc-500">Loading…</p>}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">
        {title} · {count}
      </h2>
      {children}
    </section>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="border border-dashed border-zinc-300 dark:border-zinc-800 p-8 text-center text-[11px] text-zinc-500">
      {hint}
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">{children}</ul>
    </div>
  );
}

function RecurringRow({
  item,
  paused,
  onPause,
  onSkip,
  onDelete,
}: {
  item: Recurring;
  paused?: boolean;
  onPause: () => void;
  onSkip: () => void;
  onDelete: () => void;
}) {
  const cadence = `Every ${DAY_LABELS[item.dayOfWeek]} at ${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`;
  const next = paused ? '—' : new Date(item.nextFireAt).toLocaleString();
  const summary = summarise(item.config, item.kind);
  return (
    <li className="flex items-center gap-3 px-3 py-3 text-[12px]">
      <Repeat size={12} className={paused ? 'text-zinc-400' : 'text-blue-600'} />
      <div className="flex-1 min-w-0">
        <div className="text-zinc-800 dark:text-zinc-200">
          <span className="font-medium">{cadence}</span>{' '}
          <span className="text-zinc-500">· {summary}</span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
          {paused ? 'PAUSED' : `Next ${next}`} · {item.runCount} run{item.runCount === 1 ? '' : 's'} · <span className="italic">{item.recTitle}</span>
        </div>
        {item.lastError && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
            Last error: {item.lastError}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {!paused && (
          <IconButton title="Skip next occurrence" onClick={onSkip} tone="amber">
            <SkipForward size={12} />
          </IconButton>
        )}
        <IconButton title={paused ? 'Resume' : 'Pause'} onClick={onPause} tone="blue">
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </IconButton>
        <IconButton title="Delete" onClick={onDelete} tone="red">
          <Trash2 size={12} />
        </IconButton>
      </div>
    </li>
  );
}

function OnceRow({
  item,
  showStatus,
  onCancel,
}: {
  item: Once;
  showStatus?: boolean;
  onCancel?: () => void;
}) {
  const when = new Date(item.scheduledAt).toLocaleString();
  const summary = summarise(item.config, item.kind);
  const statusTone =
    item.status === 'PENDING'
      ? 'text-zinc-500'
      : item.status === 'COMPLETED'
      ? 'text-emerald-600 dark:text-emerald-400'
      : item.status === 'RUNNING'
      ? 'text-blue-600 dark:text-blue-400'
      : item.status === 'CANCELED'
      ? 'text-zinc-500'
      : 'text-red-600 dark:text-red-400';
  return (
    <li className="flex items-center gap-3 px-3 py-3 text-[12px]">
      {showStatus ? (
        <span className={`uppercase tracking-widest text-[9px] ${statusTone} min-w-[60px]`}>
          {item.status}
        </span>
      ) : (
        <span className="uppercase tracking-widest text-[9px] text-zinc-500 min-w-[60px]">{item.status}</span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-zinc-800 dark:text-zinc-200">
          <span className="font-mono">{when}</span>{' '}
          <span className="text-zinc-500">· {summary}</span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
          <span className="italic">{item.recTitle}</span>
        </div>
        {item.lastError && (
          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
            {item.lastError}
          </div>
        )}
      </div>
      {onCancel && (
        <IconButton title="Cancel" onClick={onCancel} tone="red">
          <Trash2 size={12} />
        </IconButton>
      )}
    </li>
  );
}

function IconButton({
  title,
  onClick,
  tone,
  children,
}: {
  title: string;
  onClick: () => void;
  tone: 'red' | 'blue' | 'amber';
  children: React.ReactNode;
}) {
  const hoverClass =
    tone === 'red'
      ? 'hover:text-red-600'
      : tone === 'blue'
      ? 'hover:text-blue-600'
      : 'hover:text-amber-600';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`text-zinc-400 ${hoverClass} p-1`}
    >
      {children}
    </button>
  );
}
