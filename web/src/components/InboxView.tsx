'use client';

/**
 * Work-queue home screen.
 *
 * Single scrollable list of action cards derived from the analysis
 * state (see lib/inbox.ts). Each card expands inline into a focused
 * action panel (approve / send SMS / mark done) so the user never
 * leaves the queue for the common path. Channels that need the full
 * post UI (Facebook/Instagram media uploads) fall through to the
 * existing rec detail via onOpenRec.
 */

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';

import type { AnalysisResult } from '@/lib/ai/analyze';
import type { CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { CampaignPlan } from '@/lib/plan-types';
import type { DraftRow } from '@/lib/drafts';
import type { SmsSendRow } from '@/lib/sms-sends';
import type { DraftPiece } from '@/lib/ai/draft';
import {
  INBOX_FILTERS,
  applyFilter,
  buildInbox,
  type InboxFilterId,
  type InboxItem,
  type PieceChannel,
} from '@/lib/inbox';
import { formatDateShort, formatTime } from '@/lib/format-tz';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';

export interface InboxViewProps {
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  completions: CompletionsByKey;
  latestPlan: CampaignPlan | null;
  /// Loading slots — passed straight through to inline panels so they
  /// can disable their buttons while a request is in flight.
  draftingIndex: number | null;
  updatingStatusDraftId: string | null;
  refiningDraftId: string | null;
  sendingPieceKey: string | null;
  togglingCompletionKey: string | null;
  /// Last send result per `${draftId}:${pieceIndex}` so the send panel
  /// can show "✓ Sent" / "✗ provider error" right under the input.
  lastSendResultsByPiece: Record<string, SmsSendRow | null>;
  /// Actions wired up at AnalysisDashboard scope.
  onDraft: (recIndex: number) => void;
  onSetStatus: (draftId: string, status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onRefine: (draftId: string, feedback: string) => void;
  onSendSms: (draftId: string, pieceIndex: number, phone: string, bodyOverride: string | null) => void;
  onToggleCompletion: (
    draftId: string,
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
  ) => void;
  /// Fallback navigation for kinds the inbox can't handle inline (FB/IG
  /// post UI, complex multi-piece review). Jumps the user to the
  /// matching rec card in the Recommendations section.
  onOpenRec: (recIndex: number) => void;
}

export function InboxView(props: InboxViewProps) {
  const { result, drafts, completions, latestPlan } = props;
  const [filter, setFilter] = useState<InboxFilterId>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allItems = useMemo(
    () => buildInbox({ result, drafts, completions, latestPlan }),
    [result, drafts, completions, latestPlan],
  );

  const items = useMemo(() => applyFilter(allItems, filter), [allItems, filter]);

  const tz = result.business.timezone;

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
          {items.map((item) => {
            const draft = item.draftId
              ? Object.values(drafts).find((d) => d.id === item.draftId) ?? null
              : null;
            return (
              <li key={item.id}>
                <InboxCard
                  item={item}
                  draft={draft}
                  isExpanded={expandedId === item.id}
                  onToggleExpand={() =>
                    setExpandedId((cur) => (cur === item.id ? null : item.id))
                  }
                  timezone={tz}
                  {...props}
                />
              </li>
            );
          })}
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
// One card (header row + optional expanded action panel)

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
  later: { label: null, pillClass: '', borderClass: 'border-l-muted' },
  none: { label: null, pillClass: '', borderClass: 'border-l-muted' },
};

const PRIORITY_PILL: Record<
  'high' | 'medium' | 'low',
  { label: string; className: string }
> = {
  high: { label: 'High', className: 'bg-destructive/15 text-destructive border border-destructive/30' },
  medium: { label: 'Med', className: 'bg-amber-600/15 text-amber-300 border border-amber-600/30' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground border border-border' },
};

type InboxCardProps = InboxViewProps & {
  item: InboxItem;
  draft: DraftRow | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  timezone: string;
};

function InboxCard(props: InboxCardProps) {
  const { item, draft, isExpanded, onToggleExpand, timezone, onDraft, onOpenRec, draftingIndex } = props;
  const urg = URGENCY_STYLE[item.urgency];
  const prio = PRIORITY_PILL[item.priority];

  // draft-rec / plan-overdue-draft are direct actions (no expansion;
  // clicking Draft kicks off generation). Everything else either has
  // an inline panel or jumps to the rec.
  const isDirectDraft = item.kind === 'draft-rec' || item.kind === 'plan-overdue-draft';
  const isFallthrough = isFallthroughKind(item);
  const isExpandable = !isDirectDraft && !isFallthrough;

  return (
    <Card className={cn('border-l-2 transition-colors', urg.borderClass)}>
      <CardContent
        className={cn(
          'p-3 flex items-start gap-3',
          isExpandable && 'cursor-pointer hover:bg-muted/30',
        )}
        onClick={isExpandable ? onToggleExpand : undefined}
      >
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

        <div className="flex-shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
          {isDirectDraft ? (
            <Button
              size="sm"
              onClick={() => onDraft(item.recIndex)}
              disabled={draftingIndex === item.recIndex}
              className="gap-1.5"
            >
              {draftingIndex === item.recIndex ? (
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
          ) : isFallthrough ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenRec(item.recIndex)}
              className="gap-1.5"
            >
              {primaryActionLabel(item)}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant={isExpanded ? 'default' : 'outline'}
              onClick={onToggleExpand}
              className="gap-1.5"
            >
              {primaryActionLabel(item)}
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </CardContent>

      {isExpandable && isExpanded && (
        <ExpandedPanel {...props} draft={draft} />
      )}
    </Card>
  );
}

/// Pieces the inbox can't approve/send inline today — Facebook +
/// Instagram posts need the FacebookPostPanel UI (image upload, scheduling,
/// crosspost toggle), and approve cards for huge drafts are better viewed
/// in the rec card. These fall through to the rec detail.
function isFallthroughKind(item: InboxItem): boolean {
  if (item.kind === 'plan-upcoming') return true;
  if (item.kind === 'send-piece') {
    return item.channel === 'facebook' || item.channel === 'instagram' || item.channel === 'email';
  }
  return false;
}

function primaryActionLabel(item: InboxItem): string {
  if (item.kind === 'approve-draft') return 'Review';
  if (item.kind === 'send-piece') return 'Send';
  if (item.kind === 'execute-piece') return 'Mark done';
  if (item.kind === 'plan-upcoming') return 'Open';
  return 'Open';
}

// ─────────────────────────────────────────────────────────────────────
// Expanded action panels

function ExpandedPanel(props: InboxCardProps) {
  const { item, draft } = props;
  if (item.kind === 'approve-draft' && draft) {
    return (
      <div className="border-t border-border bg-muted/20 p-3">
        <ApprovePanel {...props} draft={draft} />
      </div>
    );
  }
  if (item.kind === 'send-piece' && draft && item.pieceIndex !== null && item.channel === 'sms') {
    return (
      <div className="border-t border-border bg-muted/20 p-3">
        <SendSmsPanel {...props} draft={draft} pieceIndex={item.pieceIndex} />
      </div>
    );
  }
  if (item.kind === 'execute-piece' && draft && item.pieceIndex !== null) {
    return (
      <div className="border-t border-border bg-muted/20 p-3">
        <ExecutePanel {...props} draft={draft} pieceIndex={item.pieceIndex} />
      </div>
    );
  }
  return null;
}

// ─── Approve / refine ─────────────────────────────────────────────────

function ApprovePanel({
  draft,
  updatingStatusDraftId,
  refiningDraftId,
  onSetStatus,
  onRefine,
  onOpenRec,
  item,
}: InboxCardProps & { draft: DraftRow }) {
  const [showRefine, setShowRefine] = useState(false);
  const [feedback, setFeedback] = useState('');
  const isUpdating = updatingStatusDraftId === draft.id;
  const isRefining = refiningDraftId === draft.id;
  const pieces = draft.payload.pieces ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span className="px-1.5 py-0.5 bg-muted uppercase tracking-wider text-[10px] text-foreground">
          {draft.payload.campaignType.replace(/-/g, ' ')}
        </span>
        {(draft.payload.channels ?? []).map((c, i) => (
          <span key={i} className="text-foreground/80">
            · {c}
          </span>
        ))}
        <span className="ml-auto">{pieces.length} piece{pieces.length === 1 ? '' : 's'}</span>
      </div>

      <ul className="space-y-2">
        {pieces.slice(0, 4).map((p, i) => (
          <PiecePreview key={i} piece={p} />
        ))}
        {pieces.length > 4 && (
          <li className="text-[11px] text-muted-foreground italic px-2">
            + {pieces.length - 4} more piece{pieces.length - 4 === 1 ? '' : 's'} —
            <button
              onClick={() => onOpenRec(item.recIndex)}
              className="text-primary hover:text-accent ml-1 underline-offset-2 hover:underline"
            >
              open full rec
            </button>
          </li>
        )}
      </ul>

      {!showRefine ? (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <button
            onClick={() => setShowRefine(true)}
            disabled={isRefining || isUpdating}
            className="text-[10px] tracking-widest uppercase text-primary hover:text-accent disabled:text-muted-foreground/70 inline-flex items-center gap-1"
          >
            <Sparkles size={11} />
            Refine
          </button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSetStatus(draft.id, 'REJECTED')}
              disabled={isUpdating || isRefining}
              className="gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => onSetStatus(draft.id, 'APPROVED')}
              disabled={isUpdating || isRefining}
              className="gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Check className="h-3.5 w-3.5" />
              {isUpdating ? 'Approving…' : 'Approve'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-border space-y-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
              What should change?
            </span>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Shorter SMS body. Bilingual Bengali + English. Offer Free delivery instead of 20% off."
              disabled={isRefining}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary font-sans resize-y"
            />
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowRefine(false);
                setFeedback('');
              }}
              disabled={isRefining}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (feedback.trim().length === 0) return;
                onRefine(draft.id, feedback.trim());
                setShowRefine(false);
                setFeedback('');
              }}
              disabled={isRefining || feedback.trim().length === 0}
              className="gap-1.5"
            >
              {isRefining ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Refining…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Refine draft
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PiecePreview({ piece }: { piece: DraftPiece }) {
  return (
    <li className="bg-card border border-border px-3 py-2 space-y-1">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="text-foreground/90 font-medium">{piece.title}</span>
        <span>·</span>
        <span>{piece.channel}</span>
      </div>
      <p className="text-[12px] text-foreground/90 whitespace-pre-wrap leading-snug line-clamp-3 font-sans">
        {piece.content}
      </p>
    </li>
  );
}

// ─── Send SMS inline ──────────────────────────────────────────────────

function SendSmsPanel({
  draft,
  pieceIndex,
  sendingPieceKey,
  lastSendResultsByPiece,
  onSendSms,
  onOpenRec,
  timezone,
  item,
}: InboxCardProps & { draft: DraftRow; pieceIndex: number }) {
  const piece = draft.payload.pieces?.[pieceIndex];
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState(piece?.content ?? '');
  const key = `${draft.id}:${pieceIndex}`;
  const isSending = sendingPieceKey === key;
  const lastResult = lastSendResultsByPiece[key] ?? null;
  if (!piece) return null;
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
          SMS body (edit before sending — fix any [DATE+X] / placeholders)
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={Math.min(6, Math.max(2, body.split('\n').length))}
          maxLength={1000}
          disabled={isSending}
          className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary font-sans resize-y"
        />
        <div className="text-[10px] text-muted-foreground mt-1">{body.length} chars</div>
      </label>

      <div className="grid grid-cols-[1fr,auto] gap-2 items-end">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
            Test phone
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+8801710330040"
            disabled={isSending}
            className="w-full bg-card border border-border text-sm text-foreground px-3 py-1.5 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary font-mono"
          />
        </label>
        <Button
          size="sm"
          onClick={() => {
            if (phone.trim().length < 6) return;
            const override = body.trim() !== piece.content.trim() ? body.trim() : null;
            onSendSms(draft.id, pieceIndex, phone.trim(), override);
          }}
          disabled={isSending || phone.trim().length < 6}
          className="gap-1.5"
        >
          {isSending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Send
            </>
          )}
        </Button>
      </div>

      {lastResult && <SendResultLine result={lastResult} timezone={timezone} />}

      <button
        onClick={() => onOpenRec(item.recIndex)}
        className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <RotateCcw size={11} />
        Send to a segment, schedule, or attach a code — open full rec
        <ArrowUpRight size={11} />
      </button>
    </div>
  );
}

function SendResultLine({ result, timezone }: { result: SmsSendRow; timezone: string }) {
  const ok = result.status === 'SENT';
  return (
    <div
      className={cn(
        'border px-3 py-2 text-[11px] font-mono',
        ok
          ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/60'
          : 'text-amber-300 bg-amber-950/30 border-amber-900/60',
      )}
    >
      <span className="font-medium">{ok ? '✓ Sent' : `✗ ${result.status}`}</span> to{' '}
      <span>{result.toPhone}</span>
      <span className="text-muted-foreground ml-2">{formatTime(result.createdAt, timezone)}</span>
      {result.error && <div className="mt-1 break-all whitespace-pre-wrap">{result.error}</div>}
    </div>
  );
}

// ─── Mark done (brief / visual / process change) ─────────────────────

function ExecutePanel({
  draft,
  pieceIndex,
  togglingCompletionKey,
  onToggleCompletion,
  onOpenRec,
  item,
}: InboxCardProps & { draft: DraftRow; pieceIndex: number }) {
  const piece = draft.payload.pieces?.[pieceIndex];
  const [notes, setNotes] = useState('');
  const key = `${draft.id}:${pieceIndex}`;
  const isToggling = togglingCompletionKey === key;
  if (!piece) return null;
  return (
    <div className="space-y-3">
      <div className="bg-card border border-border px-3 py-2 space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {piece.title} · {piece.channel}
        </div>
        <p className="text-[12px] text-foreground/90 whitespace-pre-wrap leading-snug font-sans">
          {piece.content}
        </p>
        {piece.notes && (
          <p className="text-[11px] text-muted-foreground italic mt-1 pt-1 border-t border-border">
            {piece.notes}
          </p>
        )}
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
          Add a note (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Posted in-store, photographed and added to FB album."
          disabled={isToggling}
          className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary font-sans resize-y"
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onOpenRec(item.recIndex)}
          className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          Attach a file — open full rec
          <ArrowUpRight size={11} />
        </button>
        <Button
          size="sm"
          onClick={() => onToggleCompletion(draft.id, pieceIndex, false, notes.trim() || null)}
          disabled={isToggling}
          className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {isToggling ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark done
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Icon + empty state (unchanged from previous version)

function ItemIcon({ kind, channel }: { kind: InboxItem['kind']; channel: PieceChannel | null }) {
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
