'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Filter, Send, Users } from 'lucide-react';

import type { CompletionListItem } from '@/lib/all-completions';
import { FacebookIcon } from './icons/FacebookIcon';

type SourceFilter = 'all' | 'manual' | 'integrated';

// Lucide icons and our local FacebookIcon both render an SVG, but lucide
// uses forwardRef so the shape doesn't quite match a plain function
// component. ComponentType<any> sidesteps the friction without losing
// type safety at the call site (we always pass `size`/`className`).
type IconComp = React.ComponentType<{ size?: number; className?: string }>;

const SOURCE_BADGE: Record<string, { label: string; className: string; Icon: IconComp }> = {
  manual: {
    label: 'Manual',
    className: 'bg-emerald-950/40 text-emerald-300',
    Icon: CheckCircle2,
  },
  'integrated-sms-send': {
    label: 'SMS test',
    className: 'bg-primary/15 text-primary',
    Icon: Send,
  },
  'integrated-sms-blast': {
    label: 'SMS blast',
    className: 'bg-primary/15 text-primary',
    Icon: Users,
  },
  'integrated-facebook-post': {
    label: 'FB post',
    className: 'bg-primary/15 text-primary',
    Icon: FacebookIcon,
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
      <section className="border border-border bg-card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat label="Total" value={counts.total} />
          <Stat label="Marked manually" value={counts.manual} hint="done outside the platform" />
          <Stat label="Via Restora" value={counts.integrated} hint="auto-marked after send" />
          <Stat label="With notes" value={counts.withNotes} />
        </div>
      </section>

      <section className="border border-border bg-card">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Completed pieces
          </h2>
          <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest">
            <Filter size={11} className="text-muted-foreground/70" />
            {(['all', 'manual', 'integrated'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSourceFilter(f)}
                className={`px-2 py-1 ${
                  sourceFilter === f
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="px-4 py-6 text-xs text-destructive font-mono break-all">
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            {items.length === 0
              ? 'Nothing marked done yet. Tick the checkbox on any draft piece — or send an SMS through the platform — and it shows up here.'
              : 'No completions match that filter.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((c) => {
              const badge = SOURCE_BADGE[c.source] ?? SOURCE_BADGE.manual;
              const Icon = badge.Icon;
              return (
                <li key={c.id} className="px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <Icon size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">
                          {c.pieceTitle}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1">
                          <span className="px-1.5 py-0.5 bg-muted uppercase tracking-wider text-[10px] text-muted-foreground">
                            {assetLabel(c.pieceAssetType)}
                          </span>
                          {c.pieceChannel && <span>· {c.pieceChannel}</span>}
                          <span>·</span>
                          <Link
                            href={`/?analysis=${encodeURIComponent(c.analysisId)}#rec-${c.recIndex}`}
                            className="text-foreground/80 hover:text-primary italic"
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
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(c.completedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {c.notes && (
                    <p className="mt-2 pl-6 text-[12px] text-foreground/90 whitespace-pre-wrap break-words border-l-2 border-emerald-900/60 ml-1 pl-3 py-0.5">
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
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground/70">{hint}</div>}
    </div>
  );
}
