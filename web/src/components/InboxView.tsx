'use client';

/**
 * Work-queue home screen.
 *
 * Replaces the old "stats + Up Next" overview as the dashboard's first
 * surface. Renders a single scrollable list of action cards derived from
 * the analysis state (see lib/inbox.ts). Each card has exactly one
 * primary CTA. Cards without a self-contained action (Approve, Send,
 * Execute) jump the user to the existing rec / draft detail in the
 * Recommendations section — the inbox is a navigation/triage layer, not
 * a parallel execution surface.
 */

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
} from 'lucide-react';

import type { AnalysisResult } from '@/lib/ai/analyze';
import type { CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { CampaignPlan } from '@/lib/plan-types';
import {
  INBOX_FILTERS,
  applyFilter,
  buildInbox,
  type InboxFilterId,
  type InboxItem,
  type PieceChannel,
} from '@/lib/inbox';
import { formatDateShort } from '@/lib/format-tz';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';

interface InboxViewProps {
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  completions: CompletionsByKey;
  latestPlan: CampaignPlan | null;
  draftingIndex: number | null;
  onDraft: (recIndex: number) => void;
  onOpenRec: (recIndex: number) => void;
}

export function InboxView({
  result,
  drafts,
  completions,
  latestPlan,
  draftingIndex,
  onDraft,
  onOpenRec,
}: InboxViewProps) {
  const [filter, setFilter] = useState<InboxFilterId>('all');

  const allItems = useMemo(
    () => buildInbox({ result, drafts, completions, latestPlan }),
    [result, drafts, completions, latestPlan],
  );

  const items = useMemo(() => applyFilter(allItems, filter), [allItems, filter]);

  const tz = result.business.timezone;

  // Per-filter counts so each chip shows the live number.
  const counts = useMemo(() => {
    const c: Record<InboxFilterId, number> = {
      all: allItems.length,
      approve: 0,
      send: 0,
      execute: 0,
      draft: 0,
      plan: 0,
    };
    for (const i of allItems) {
      if (i.kind === 'approve-draft') c.approve++;
      else if (i.kind === 'send-piece') c.send++;
      else if (i.kind === 'execute-piece') c.execute++;
      else if (i.kind === 'draft-rec' || i.kind === 'plan-overdue-draft') c.draft++;
      else if (i.kind === 'plan-upcoming') c.plan++;
    }
    return c;
  }, [allItems]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
          Your queue
        </p>
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            {allItems.length === 0
              ? 'All caught up'
              : `${allItems.length} thing${allItems.length === 1 ? '' : 's'} to do`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {result.business.name} · audit from {formatDateShort(result.generatedAt, tz)}
          </p>
        </div>
      </div>

      <FilterRow filter={filter} setFilter={setFilter} counts={counts} />

      {items.length === 0 ? (
        <EmptyState filter={filter} hasAnyItems={allItems.length > 0} />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <InboxCard
                item={item}
                isDrafting={draftingIndex === item.recIndex}
                onDraft={() => onDraft(item.recIndex)}
                onOpen={() => onOpenRec(item.recIndex)}
                timezone={tz}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Filter row

function FilterRow({
  filter,
  setFilter,
  counts,
}: {
  filter: InboxFilterId;
  setFilter: (f: InboxFilterId) => void;
  counts: Record<InboxFilterId, number>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INBOX_FILTERS.map((f) => {
        const active = filter === f.id;
        const count = counts[f.id];
        return (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-widest border transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : count === 0
                ? 'border-border text-muted-foreground/50 hover:border-muted-foreground/40'
                : 'border-border text-muted-foreground hover:border-primary hover:text-foreground',
            )}
          >
            {f.label}
            <span
              className={cn(
                'tabular-nums text-[10px] font-mono',
                active ? 'text-primary-foreground/80' : 'text-muted-foreground/70',
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// One card

const URGENCY_STYLE: Record<
  InboxItem['urgency'],
  { label: string | null; pillClass: string; borderClass: string }
> = {
  now: {
    label: 'Now',
    pillClass: 'bg-destructive text-destructive-foreground',
    borderClass: 'border-l-destructive',
  },
  soon: {
    label: 'This week',
    pillClass: 'bg-amber-600 text-white',
    borderClass: 'border-l-amber-500',
  },
  later: {
    label: null,
    pillClass: '',
    borderClass: 'border-l-muted',
  },
  none: {
    label: null,
    pillClass: '',
    borderClass: 'border-l-muted',
  },
};

const PRIORITY_PILL: Record<
  'high' | 'medium' | 'low',
  { label: string; className: string }
> = {
  high: { label: 'High', className: 'bg-destructive/15 text-destructive border border-destructive/30' },
  medium: { label: 'Med', className: 'bg-amber-600/15 text-amber-300 border border-amber-600/30' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground border border-border' },
};

function InboxCard({
  item,
  isDrafting,
  onDraft,
  onOpen,
  timezone,
}: {
  item: InboxItem;
  isDrafting: boolean;
  onDraft: () => void;
  onOpen: () => void;
  timezone: string;
}) {
  const urg = URGENCY_STYLE[item.urgency];
  const prio = PRIORITY_PILL[item.priority];

  // Only "draft-rec" and "plan-overdue-draft" have a self-contained
  // action (kick off the draft generation). Everything else opens the
  // rec detail so the user can read the content / piece before acting.
  const isDirectAction = item.kind === 'draft-rec' || item.kind === 'plan-overdue-draft';

  return (
    <Card
      className={cn(
        'border-l-2 transition-colors hover:border-primary/40 cursor-pointer',
        urg.borderClass,
      )}
      onClick={onOpen}
    >
      <CardContent className="p-3 flex items-start gap-3">
        <ItemIcon kind={item.kind} channel={item.channel} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] uppercase tracking-widest px-1.5 py-0.5', prio.className)}>
              {prio.label}
            </span>
            {urg.label && (
              <span className={cn('text-[10px] uppercase tracking-widest px-1.5 py-0.5', urg.pillClass)}>
                {urg.label}
              </span>
            )}
            {item.dueAt && (
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatDateShort(item.dueAt, timezone)}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-auto">
              Rec #{item.recIndex + 1}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-tight">{item.title}</p>
          <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2">
            {item.subtitle}
          </p>
          <p className="text-[11px] text-muted-foreground/80 italic line-clamp-1">
            {item.recTitle}
          </p>
        </div>

        <div
          className="flex-shrink-0 self-center"
          onClick={(e) => e.stopPropagation()}
        >
          {isDirectAction ? (
            <Button size="sm" onClick={onDraft} disabled={isDrafting} className="gap-1.5">
              {isDrafting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Drafting…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Draft
                </>
              )}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onOpen} className="gap-1.5">
              {primaryActionLabel(item)}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function primaryActionLabel(item: InboxItem): string {
  if (item.kind === 'approve-draft') return 'Review';
  if (item.kind === 'send-piece') return 'Send';
  if (item.kind === 'execute-piece') return 'Mark done';
  if (item.kind === 'plan-upcoming') return 'Open';
  return 'Open';
}

function ItemIcon({
  kind,
  channel,
}: {
  kind: InboxItem['kind'];
  channel: PieceChannel | null;
}) {
  const accent =
    kind === 'approve-draft'
      ? 'text-primary bg-primary/10'
      : kind === 'send-piece'
      ? 'text-primary bg-primary/10'
      : kind === 'execute-piece'
      ? 'text-amber-300 bg-amber-950/30'
      : kind === 'plan-overdue-draft'
      ? 'text-destructive bg-destructive/10'
      : kind === 'plan-upcoming'
      ? 'text-muted-foreground bg-muted'
      : 'text-primary bg-primary/10';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-8 h-8 flex-shrink-0 mt-0.5',
        accent,
      )}
    >
      {renderIcon(kind, channel)}
    </span>
  );
}

function renderIcon(kind: InboxItem['kind'], channel: PieceChannel | null) {
  if (kind === 'send-piece') {
    if (channel === 'sms') return <MessageSquare className="h-4 w-4" />;
    if (channel === 'facebook') return <FacebookIcon size={16} />;
    if (channel === 'instagram') return <InstagramIcon size={16} />;
    if (channel === 'email') return <Mail className="h-4 w-4" />;
    return <Send className="h-4 w-4" />;
  }
  if (kind === 'execute-piece') return <Wrench className="h-4 w-4" />;
  if (kind === 'approve-draft') return <CheckCircle2 className="h-4 w-4" />;
  if (kind === 'plan-upcoming' || kind === 'plan-overdue-draft')
    return <CalendarClock className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

// ─────────────────────────────────────────────────────────────────────
// Empty state

function EmptyState({
  filter,
  hasAnyItems,
}: {
  filter: InboxFilterId;
  hasAnyItems: boolean;
}) {
  if (!hasAnyItems) {
    return (
      <Card>
        <CardHeader className="py-6">
          <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
            <Inbox className="h-4 w-4" />
            All caught up
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Every recommendation has a draft, every draft is approved, and every piece has been
            sent or marked done. Run a fresh audit to surface new opportunities.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="py-6">
        <p className="text-sm text-muted-foreground italic">
          Nothing matches the {filter.toUpperCase()} filter. Pick another filter above.
        </p>
      </CardContent>
    </Card>
  );
}
