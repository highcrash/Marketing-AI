'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Pause, Play, Repeat, Send, SkipForward, Trash2, Users, X } from 'lucide-react';

import type {
  ScheduledBlastConfig,
  ScheduledConfig,
  ScheduledSendRow,
  ScheduledSingleConfig,
} from '@/lib/scheduled-sends';
import type { RecurringScheduleRow } from '@/lib/recurring-schedules';

type RecurrenceMode = 'once' | 'weekly';
type SendMode = 'single' | 'blast';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/// Tomorrow 10:00 in browser-local time, formatted for <input type="datetime-local">.
function tomorrowAtTenLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/// Compute the next future moment that is (dayOfWeek, hour:minute) in
/// the browser's local timezone. Used as the first fire for a weekly
/// recurring schedule.
function nextWeeklyFireLocal(dayOfWeek: number, hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  const currentDow = target.getDay();
  let daysAhead = (dayOfWeek - currentDow + 7) % 7;
  if (daysAhead === 0 && target.getTime() <= now.getTime()) daysAhead = 7;
  target.setDate(target.getDate() + daysAhead);
  return target;
}

export function SchedulePanel({
  draftId,
  pieceIndex,
  onClose,
}: {
  draftId: string;
  pieceIndex: number;
  onClose: () => void;
}) {
  const [onceItems, setOnceItems] = useState<ScheduledSendRow[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recurrence, setRecurrence] = useState<RecurrenceMode>('once');
  const [sendMode, setSendMode] = useState<SendMode>('single');

  // Once-mode inputs
  const [scheduledAtLocal, setScheduledAtLocal] = useState(tomorrowAtTenLocal());

  // Weekly-mode inputs — default to next Thursday 10:00, the BD-market
  // marketing default we keep mentioning.
  const [dayOfWeek, setDayOfWeek] = useState(4);
  const [timeOfDay, setTimeOfDay] = useState('10:00');

  // Shared recipient inputs
  const [phone, setPhone] = useState('');
  const [minSpent, setMinSpent] = useState('');
  const [minVisits, setMinVisits] = useState('');
  const [maxLastVisitDays, setMaxLastVisitDays] = useState('');
  const [minLoyaltyPoints, setMinLoyaltyPoints] = useState('');
  const [campaignTag, setCampaignTag] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const onceForThisPiece = onceItems.filter((i) => i.pieceIndex === pieceIndex);
  const recurringForThisPiece = recurringItems.filter((i) => i.pieceIndex === pieceIndex);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [onceRes, recurringRes] = await Promise.all([
        fetch(`/api/drafts/${encodeURIComponent(draftId)}/schedule`),
        fetch(`/api/drafts/${encodeURIComponent(draftId)}/recurring`),
      ]);
      const onceBody = (await onceRes.json()) as
        | { items: ScheduledSendRow[] }
        | { error: string; message: string };
      const recurringBody = (await recurringRes.json()) as
        | { items: RecurringScheduleRow[] }
        | { error: string; message: string };
      if (!onceRes.ok || 'error' in onceBody) {
        throw new Error('message' in onceBody ? onceBody.message : `HTTP ${onceRes.status}`);
      }
      if (!recurringRes.ok || 'error' in recurringBody) {
        throw new Error(
          'message' in recurringBody ? recurringBody.message : `HTTP ${recurringRes.status}`,
        );
      }
      setOnceItems(onceBody.items);
      setRecurringItems(recurringBody.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function buildConfig(): ScheduledConfig {
    if (sendMode === 'single') {
      if (phone.trim().length < 6) throw new Error('Phone number required');
      return { phone: phone.trim(), campaignTag: campaignTag.trim() || null };
    }
    const segment: ScheduledBlastConfig['segment'] = {};
    if (minSpent.trim()) segment.minSpent = Number(minSpent);
    if (minVisits.trim()) segment.minVisits = Number(minVisits);
    if (maxLastVisitDays.trim()) segment.maxLastVisitDays = Number(maxLastVisitDays);
    if (minLoyaltyPoints.trim()) segment.minLoyaltyPoints = Number(minLoyaltyPoints);
    return { segment, campaignTag: campaignTag.trim() || null };
  }

  function resetForm() {
    setPhone('');
    setMinSpent('');
    setMinVisits('');
    setMaxLastVisitDays('');
    setMinLoyaltyPoints('');
    setCampaignTag('');
    setScheduledAtLocal(tomorrowAtTenLocal());
  }

  async function submitOnce() {
    setSubmitting(true);
    setError(null);
    try {
      const config = buildConfig();
      const scheduledAt = new Date(scheduledAtLocal).toISOString();
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIndex, kind: sendMode, config, scheduledAt }),
      });
      const body = (await res.json()) as
        | { scheduled: ScheduledSendRow }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      resetForm();
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitWeekly() {
    setSubmitting(true);
    setError(null);
    try {
      const [hh, mm] = timeOfDay.split(':');
      const hour = Number(hh);
      const minute = Number(mm);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        throw new Error('Time must be HH:mm');
      }
      const config = buildConfig();
      const firstFireAt = nextWeeklyFireLocal(dayOfWeek, hour, minute);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          kind: sendMode,
          config,
          dayOfWeek,
          hour,
          minute,
          timezone,
          firstFireAt: firstFireAt.toISOString(),
        }),
      });
      const body = (await res.json()) as
        | { recurring: RecurringScheduleRow }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      resetForm();
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelOnce(id: string) {
    try {
      const res = await fetch(`/api/scheduled-sends/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }

  async function toggleRecurringActive(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/recurring-schedules/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }

  async function skipNextOccurrence(id: string) {
    try {
      const res = await fetch(`/api/recurring-schedules/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipNext: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }

  async function deleteRecurring(id: string) {
    try {
      const res = await fetch(`/api/recurring-schedules/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    }
  }

  const totalQueued = onceForThisPiece.length + recurringForThisPiece.length;

  return (
    <div className="border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 inline-flex items-center gap-1.5">
          <Clock size={12} />
          Schedule a send
        </p>
        <button
          onClick={onClose}
          disabled={submitting}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 disabled:opacity-50"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-2 text-[10px]">
        <TabButton active={recurrence === 'once'} onClick={() => setRecurrence('once')}>
          <Clock size={11} /> Once
        </TabButton>
        <TabButton active={recurrence === 'weekly'} onClick={() => setRecurrence('weekly')}>
          <Repeat size={11} /> Weekly
        </TabButton>
      </div>

      <div className="flex gap-2 text-[10px]">
        <TabButton
          active={sendMode === 'single'}
          onClick={() => setSendMode('single')}
          variant="ghost"
        >
          <Send size={11} /> Single phone
        </TabButton>
        <TabButton
          active={sendMode === 'blast'}
          onClick={() => setSendMode('blast')}
          variant="ghost"
        >
          <Users size={11} /> Segment
        </TabButton>
      </div>

      {recurrence === 'once' ? (
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">When</span>
          <input
            type="datetime-local"
            value={scheduledAtLocal}
            onChange={(e) => setScheduledAtLocal(e.target.value)}
            disabled={submitting}
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-blue-600 font-mono text-[12px]"
          />
        </label>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Day of week</span>
            <div className="flex flex-wrap gap-1">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setDayOfWeek(i)}
                  disabled={submitting}
                  className={`px-2 py-1 text-[11px] uppercase tracking-widest ${
                    dayOfWeek === i
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-blue-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Time of day</span>
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              disabled={submitting}
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-blue-600 font-mono text-[12px] w-32"
            />
          </label>
          <p className="text-[10px] text-zinc-500">
            First fire:{' '}
            {(() => {
              const [hh, mm] = timeOfDay.split(':');
              const fire = nextWeeklyFireLocal(dayOfWeek, Number(hh), Number(mm));
              return fire.toLocaleString();
            })()}
          </p>
        </div>
      )}

      {sendMode === 'single' ? (
        <FilterInput
          label="Phone"
          value={phone}
          onChange={setPhone}
          placeholder="+8801710330040"
          disabled={submitting}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <FilterInput
            label="Min spend (BDT)"
            value={minSpent}
            onChange={setMinSpent}
            placeholder="e.g. 500"
            disabled={submitting}
          />
          <FilterInput
            label="Min visits"
            value={minVisits}
            onChange={setMinVisits}
            placeholder="e.g. 2"
            disabled={submitting}
          />
          <FilterInput
            label="Visited within (days)"
            value={maxLastVisitDays}
            onChange={setMaxLastVisitDays}
            placeholder="e.g. 60"
            disabled={submitting}
          />
          <FilterInput
            label="Min loyalty points"
            value={minLoyaltyPoints}
            onChange={setMinLoyaltyPoints}
            placeholder="e.g. 1"
            disabled={submitting}
          />
        </div>
      )}

      <FilterInput
        label="Campaign tag (optional)"
        value={campaignTag}
        onChange={setCampaignTag}
        placeholder="e.g. mai-2026-reactivation"
        disabled={submitting}
      />

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-zinc-500">
          {recurrence === 'weekly'
            ? 'Fires every week while active. The draft must still be APPROVED at each fire time.'
            : 'Fires once. The draft must still be APPROVED at fire time.'}
        </p>
        <button
          onClick={() => (recurrence === 'once' ? void submitOnce() : void submitWeekly())}
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
        >
          {recurrence === 'weekly' ? <Repeat size={11} /> : <Clock size={11} />}
          {submitting ? 'Scheduling…' : recurrence === 'weekly' ? 'Schedule weekly' : 'Schedule once'}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
      )}

      {totalQueued > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          {recurringForThisPiece.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                Recurring · {recurringForThisPiece.length}
              </p>
              <ul className="space-y-1.5">
                {recurringForThisPiece.map((item) => (
                  <RecurringRow
                    key={item.id}
                    item={item}
                    onToggle={() => toggleRecurringActive(item.id, !item.active)}
                    onSkipNext={() => skipNextOccurrence(item.id)}
                    onDelete={() => deleteRecurring(item.id)}
                  />
                ))}
              </ul>
            </div>
          )}
          {onceForThisPiece.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                One-off · {onceForThisPiece.length}
              </p>
              <ul className="space-y-1.5">
                {onceForThisPiece.map((item) => (
                  <ScheduledRow key={item.id} item={item} onCancel={() => cancelOnce(item.id)} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {loading && totalQueued === 0 && <p className="text-[11px] text-zinc-500">Loading queue…</p>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  variant = 'solid',
  children,
}: {
  active: boolean;
  onClick: () => void;
  variant?: 'solid' | 'ghost';
  children: React.ReactNode;
}) {
  const activeClass =
    variant === 'solid'
      ? 'bg-blue-600 text-white'
      : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-600';
  const inactiveClass =
    'bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-blue-600';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 tracking-widest uppercase ${
        active ? activeClass : inactiveClass
      }`}
    >
      {children}
    </button>
  );
}

function ScheduledRow({ item, onCancel }: { item: ScheduledSendRow; onCancel: () => void }) {
  const when = new Date(item.scheduledAt).toLocaleString();
  const summary =
    item.kind === 'single'
      ? `→ ${(item.config as ScheduledSingleConfig).phone}`
      : `→ segment${
          Object.keys((item.config as ScheduledBlastConfig).segment).length === 0
            ? ' (all)'
            : ''
        }`;
  const statusTone =
    item.status === 'PENDING'
      ? 'text-zinc-600 dark:text-zinc-400'
      : item.status === 'COMPLETED'
      ? 'text-emerald-600 dark:text-emerald-400'
      : item.status === 'RUNNING'
      ? 'text-blue-600 dark:text-blue-400'
      : item.status === 'CANCELED'
      ? 'text-zinc-500'
      : 'text-red-600 dark:text-red-400';
  return (
    <li className="flex items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-300">
      <span className={`uppercase tracking-widest text-[9px] ${statusTone} min-w-[60px]`}>
        {item.status}
      </span>
      <span className="font-mono text-zinc-500">{when}</span>
      <span className="text-zinc-500">{summary}</span>
      {item.lastError && (
        <span className="text-amber-600 dark:text-amber-400 truncate" title={item.lastError}>
          · {item.lastError.slice(0, 40)}
        </span>
      )}
      {item.status === 'PENDING' && (
        <button
          onClick={onCancel}
          className="ml-auto text-zinc-400 hover:text-red-600"
          aria-label="Cancel"
        >
          <Trash2 size={11} />
        </button>
      )}
    </li>
  );
}

function RecurringRow({
  item,
  onToggle,
  onSkipNext,
  onDelete,
}: {
  item: RecurringScheduleRow;
  onToggle: () => void;
  onSkipNext: () => void;
  onDelete: () => void;
}) {
  const next = new Date(item.nextFireAt).toLocaleString();
  const dayLabel = DAY_LABELS[item.dayOfWeek];
  const timeLabel = `${String(item.hour).padStart(2, '0')}:${String(item.minute).padStart(2, '0')}`;
  const cadence = `Every ${dayLabel} at ${timeLabel}`;
  const summary =
    item.kind === 'single'
      ? `→ ${(item.config as ScheduledSingleConfig).phone}`
      : `→ segment${
          Object.keys((item.config as ScheduledBlastConfig).segment).length === 0
            ? ' (all)'
            : ''
        }`;
  const statusTone = item.active
    ? 'text-blue-600 dark:text-blue-400'
    : 'text-zinc-500';
  return (
    <li className="flex items-center gap-2 text-[11px] text-zinc-700 dark:text-zinc-300">
      <span className={`uppercase tracking-widest text-[9px] ${statusTone} min-w-[60px]`}>
        {item.active ? 'ACTIVE' : 'PAUSED'}
      </span>
      <span className="font-mono">{cadence}</span>
      <span className="text-zinc-500">{summary}</span>
      <span className="text-[10px] text-zinc-500">
        · next {next} · {item.runCount} run{item.runCount === 1 ? '' : 's'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {item.active && (
          <button
            onClick={onSkipNext}
            className="text-zinc-400 hover:text-amber-600"
            aria-label="Skip next occurrence"
            title="Skip next occurrence (push nextFireAt forward by one cadence)"
          >
            <SkipForward size={11} />
          </button>
        )}
        <button
          onClick={onToggle}
          className="text-zinc-400 hover:text-blue-600"
          aria-label={item.active ? 'Pause' : 'Resume'}
          title={item.active ? 'Pause' : 'Resume'}
        >
          {item.active ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <button
          onClick={onDelete}
          className="text-zinc-400 hover:text-red-600"
          aria-label="Delete"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </li>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px]">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-2 py-1.5 placeholder:text-zinc-400 focus:outline-none focus:border-blue-600 font-mono text-[12px]"
      />
    </label>
  );
}
