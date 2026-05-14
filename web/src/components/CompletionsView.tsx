'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Filter, Send, Users } from 'lucide-react';

import type { CompletionListItem } from '@/lib/all-completions';

type SourceFilter = 'all' | 'manual' | 'integrated';

const SOURCE_BADGE: Record<string, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  manual: {
    label: 'Manual',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
  'integrated-sms-send': {
    label: 'SMS test',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    Icon: Send,
  },
  'integrated-sms-blast': {
    label: 'SMS blast',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    Icon: Users,
  },
};

const ASSET_TYPE_LABEL: Record<string, string> = {
  sms: 'SMS',
  'social-post': 'Social post',
  'paid-ad-copy': 'Ad copy',
  'email-body': 'Email',
  'in-store-card': 'In-store',
  'visual-brief': 'Visual brief',
  'video-brief': 'Video brief',
  'menu-change': 'Menu change',
  'process-change': 'Process change',
};

function assetLabel(t: string): string {
  return ASSET_TYPE_LABEL[t] ?? t;
}

export function CompletionsView() {
  const [items, setItems] = useState<CompletionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/all-completions');
      const body = (await res.json()) as
        | { items: CompletionListItem[] }
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    let manual = 0;
    let integrated = 0;
    let withNotes = 0;
    for (const c of items) {
      if (c.source === 'manual') manual += 1;
      else integrated += 1;
      if (c.notes) withNotes += 1;
    }
    return { total: items.length, manual, integrated, withNotes };
  }, [items]);

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return items;
    if (sourceFilter === 'manual') return items.filter((c) => c.source === 'manual');
    return items.filter((c) => c.source !== 'manual');
  }, [items, sourceFilter]);

  return (
    <div className="space-y-5">
      <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Total" value={counts.total} />
          <Stat label="Marked manually" value={counts.manual} hint="done outside the platform" />
          <Stat label="Via Restora" value={counts.integrated} hint="auto-marked after send" />
          <Stat label="With notes" value={counts.withNotes} />
        </div>
      </section>

      <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
            Completed pieces
          </h2>
          <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest">
            <Filter size={11} className="text-zinc-400" />
            {(['all', 'manual', 'integrated'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSourceFilter(f)}
                className={`px-2 py-1 ${
                  sourceFilter === f
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <p className="px-4 py-6 text-xs text-zinc-500">Loading…</p>
        ) : error ? (
          <p className="px-4 py-6 text-xs text-red-600 dark:text-red-400 font-mono break-all">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-xs text-zinc-500">
            {items.length === 0
              ? 'Nothing marked done yet. Tick the checkbox on any draft piece — or send an SMS through the platform — and it shows up here.'
              : 'No completions match that filter.'}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {filtered.map((c) => {
              const badge = SOURCE_BADGE[c.source] ?? SOURCE_BADGE.manual;
              const Icon = badge.Icon;
              return (
                <li key={c.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Icon size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {c.pieceTitle}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900 uppercase tracking-wider text-[10px] text-zinc-600 dark:text-zinc-400">
                            {assetLabel(c.pieceAssetType)}
                          </span>
                          {c.pieceChannel && <span>· {c.pieceChannel}</span>}
                          <span>·</span>
                          <Link
                            href={`/?analysis=${encodeURIComponent(c.analysisId)}#rec-${c.recIndex}`}
                            className="text-zinc-600 dark:text-zinc-300 hover:text-red-600 italic"
                          >
                            {c.recTitle}
                          </Link>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {new Date(c.completedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {c.notes && (
                    <p className="mt-2 pl-6 text-[12px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words border-l-2 border-emerald-200 dark:border-emerald-900 ml-1 pl-3 py-0.5">
                      {c.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{value}</div>
      {hint && <div className="text-[10px] text-zinc-400">{hint}</div>}
    </div>
  );
}
