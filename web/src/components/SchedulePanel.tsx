'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Send, Trash2, Users, X } from 'lucide-react';

import type {
  ScheduledBlastConfig,
  ScheduledSendRow,
  ScheduledSingleConfig,
} from '@/lib/scheduled-sends';

type ScheduleMode = 'single' | 'blast';

/// Local datetime-input string for "tomorrow 10:00 (browser local)".
/// We default the picker here because most BD-market marketing sends go
/// out at 10am the next morning — it's the friendly first-guess time.
function tomorrowAtTenLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  // Strip the seconds + offset for the <input type="datetime-local">.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [items, setItems] = useState<ScheduledSendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ScheduleMode>('single');
  const [scheduledAtLocal, setScheduledAtLocal] = useState(tomorrowAtTenLocal());
  const [phone, setPhone] = useState('');
  const [minSpent, setMinSpent] = useState('');
  const [minVisits, setMinVisits] = useState('');
  const [maxLastVisitDays, setMaxLastVisitDays] = useState('');
  const [minLoyaltyPoints, setMinLoyaltyPoints] = useState('');
  const [campaignTag, setCampaignTag] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const itemsForThisPiece = items.filter((i) => i.pieceIndex === pieceIndex);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/schedule`);
      const body = (await res.json()) as
        | { items: ScheduledSendRow[] }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setItems(body.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      let config: ScheduledSingleConfig | ScheduledBlastConfig;
      if (mode === 'single') {
        if (phone.trim().length < 6) throw new Error('Phone number required');
        config = { phone: phone.trim(), campaignTag: campaignTag.trim() || null };
      } else {
        const segment: ScheduledBlastConfig['segment'] = {};
        if (minSpent.trim()) segment.minSpent = Number(minSpent);
        if (minVisits.trim()) segment.minVisits = Number(minVisits);
        if (maxLastVisitDays.trim()) segment.maxLastVisitDays = Number(maxLastVisitDays);
        if (minLoyaltyPoints.trim()) segment.minLoyaltyPoints = Number(minLoyaltyPoints);
        config = { segment, campaignTag: campaignTag.trim() || null };
      }
      // Convert local datetime-input back to ISO. The browser interprets
      // datetime-local as local time, which is what we want — the
      // resulting Date is the absolute moment the user picked.
      const scheduledAt = new Date(scheduledAtLocal).toISOString();
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIndex, kind: mode, config, scheduledAt }),
      });
      const body = (await res.json()) as
        | { scheduled: ScheduledSendRow }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      // Reset the form back to fresh defaults, leave panel open so the
      // user can schedule another.
      setPhone('');
      setMinSpent('');
      setMinVisits('');
      setMaxLastVisitDays('');
      setMinLoyaltyPoints('');
      setCampaignTag('');
      setScheduledAtLocal(tomorrowAtTenLocal());
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
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

  return (
    <div className="border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 inline-flex items-center gap-1.5">
          <Clock size={12} />
          Schedule a send for later
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
        <ModeTab active={mode === 'single'} onClick={() => setMode('single')}>
          <Send size={11} /> Single phone
        </ModeTab>
        <ModeTab active={mode === 'blast'} onClick={() => setMode('blast')}>
          <Users size={11} /> Segment
        </ModeTab>
      </div>

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

      {mode === 'single' ? (
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
          Fires automatically while this dev server is running. The draft must still be APPROVED at
          fire time.
        </p>
        <button
          onClick={submit}
          disabled={submitting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
        >
          <Clock size={11} />
          {submitting ? 'Scheduling…' : 'Schedule'}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
      )}

      {itemsForThisPiece.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Queued for this piece · {itemsForThisPiece.length}
          </p>
          <ul className="space-y-1.5">
            {itemsForThisPiece.map((item) => (
              <ScheduledRow key={item.id} item={item} onCancel={() => cancel(item.id)} />
            ))}
          </ul>
        </div>
      )}

      {loading && itemsForThisPiece.length === 0 && (
        <p className="text-[11px] text-zinc-500">Loading queue…</p>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 tracking-widest uppercase ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-blue-600'
      }`}
    >
      {children}
    </button>
  );
}

function ScheduledRow({
  item,
  onCancel,
}: {
  item: ScheduledSendRow;
  onCancel: () => void;
}) {
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
