'use client';

/**
 * One recommendation card.
 *
 * Heavy by nature — it has to host rationale, plan placement, budget
 * suggestion, first actions, AND the full DraftView when a draft
 * exists. To keep that from being a single 15-section skyscraper, the
 * card now uses a 2-tab layout once a draft is generated: Overview
 * (rationale / why / first actions / plan placement) and Draft (the
 * full draft + send / approve / completion UI). Before a draft exists
 * there's only one tab, so we render the body without the tab strip.
 */

import { useState } from 'react';
import { ArrowRight, Calendar, FileText, LayoutGrid, Sparkles, Wrench } from 'lucide-react';

import type { Recommendation } from '@/lib/ai/analyze';
import type { DraftRow } from '@/lib/drafts';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { PlanTask } from '@/lib/plan-types';
import type { SmsSendRow } from '@/lib/sms-sends';
import { computeRecStatus } from '@/lib/rec-status';
import { formatDateShort, formatHourOfDay } from '@/lib/format-tz';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { DraftView } from './DraftView';

const PRIORITY_VARIANT: Record<
  Recommendation['priority'],
  { label: string; className: string }
> = {
  high: { label: 'High', className: 'bg-destructive text-destructive-foreground' },
  medium: { label: 'Medium', className: 'bg-amber-600 text-white' },
  low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
};

type Tab = 'overview' | 'draft';

interface Props {
  rec: Recommendation;
  draft: DraftRow | undefined;
  /// Plan tasks that target this rec (from the latest plan). Empty
  /// array when there's no plan or this rec isn't in it.
  planTasks?: PlanTask[];
  /// IANA timezone for plan-task date rendering.
  timezone: string;
  isDrafting: boolean;
  isRefining: boolean;
  isUpdatingStatus: boolean;
  sendingPieceIndex: number | null;
  lastSendResultByPiece: Record<number, SmsSendRow | null>;
  completionsByPiece: Record<number, PieceCompletionRow | null>;
  togglingPieceIndex: number | null;
  onDraft: () => void;
  onRefine: (feedback: string) => void;
  onSetStatus: (status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (pieceIndex: number, phone: string, bodyOverride: string | null) => void;
  onSegmentBlastSent: () => void;
  onToggleCompletion: (
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
    attachment?: { path: string; name: string; mime: string; size: number } | null,
  ) => void;
}

export function RecommendationCard(props: Props) {
  const { rec, draft, completionsByPiece } = props;
  const progress = computeRecStatus(draft, completionsByPiece);
  const priority = PRIORITY_VARIANT[rec.priority];

  /// Default to the Draft tab once a draft exists — that's where the
  /// owner does most of the work. New recs start on Overview.
  const [tab, setTab] = useState<Tab>(draft ? 'draft' : 'overview');
  // If a draft appears later (after user clicks Draft from Overview),
  // jump them into it automatically.
  if (draft && tab === 'overview' && progress.label === 'Drafted') {
    // no-op — let the user decide; switching tab on every re-render
    // would steal focus mid-interaction.
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-widest font-medium whitespace-nowrap mt-0.5',
              priority.className,
            )}
          >
            {priority.label}
          </span>
          <h5 className="font-semibold text-foreground leading-snug min-w-0">{rec.title}</h5>
        </div>
        <span
          className={cn(
            'text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 whitespace-nowrap',
            progress.badgeClass,
          )}
          title="Progress on this recommendation"
        >
          {progress.label}
        </span>
      </CardHeader>

      {/* Tabs only when there's a draft to switch to. Pre-draft we
          skip the strip entirely so a single rec doesn't look gated. */}
      {draft && <TabStrip tab={tab} setTab={setTab} pieceCount={draft.payload.pieces?.length ?? 0} />}

      {tab === 'overview' || !draft ? (
        <OverviewBody {...props} />
      ) : (
        <DraftBody {...props} draft={draft} />
      )}
    </Card>
  );
}

function TabStrip({
  tab,
  setTab,
  pieceCount,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  pieceCount: number;
}) {
  return (
    <div className="flex border-b border-border">
      <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
        <LayoutGrid className="h-3.5 w-3.5" />
        Overview
      </TabButton>
      <TabButton active={tab === 'draft'} onClick={() => setTab('draft')}>
        <FileText className="h-3.5 w-3.5" />
        Draft
        <span className="text-[10px] text-muted-foreground font-mono">{pieceCount}</span>
      </TabButton>
    </div>
  );
}

function TabButton({
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
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-[11px] uppercase tracking-widest transition-colors border-b-2 -mb-px',
        active
          ? 'border-primary text-foreground bg-primary/5'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
      )}
    >
      {children}
    </button>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────

function OverviewBody({
  rec,
  draft,
  planTasks,
  timezone,
  isDrafting,
  onDraft,
}: Props) {
  return (
    <CardContent className="space-y-4">
      <div className="grid gap-3 text-sm">
        <Block label="Why">{rec.rationale}</Block>
        <Block label="Expected impact">{rec.expectedImpact}</Block>
        {rec.estimatedBudgetBdt != null && (
          <Block label="Suggested budget">
            <span className="font-mono">৳{rec.estimatedBudgetBdt.toLocaleString()}</span>
            <span className="text-muted-foreground"> / month</span>
          </Block>
        )}
      </div>

      {planTasks && planTasks.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 inline-flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-primary" />
            Scheduled in plan · {planTasks.length}
          </p>
          <ul className="space-y-1 text-[12px]">
            {planTasks
              .slice()
              .sort((a, b) => (a.date < b.date ? -1 : 1))
              .map((t, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 bg-primary/5 border border-primary/30 text-foreground"
                >
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {formatDateShort(t.date, timezone)}
                    {t.hour !== null && ` · ${formatHourOfDay(t.hour)}`}
                  </span>
                  <span className="text-foreground/90 truncate flex-1">{t.title}</span>
                  <span className="font-mono text-muted-foreground flex-shrink-0">
                    ৳{(t.budgetMinor / 100).toLocaleString()}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          First actions this week
        </p>
        <ul className="space-y-1.5 text-sm text-foreground">
          {rec.firstActionsThisWeek.map((a, i) => (
            <li key={i} className="flex gap-2">
              <ArrowRight className="h-3.5 w-3.5 mt-1 text-primary flex-shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
        {rec.requiresHumanForExecution && (
          <Badge variant="warning" className="gap-1">
            <Wrench className="h-3 w-3" />
            Needs human creative
          </Badge>
        )}
        {rec.relatedSkills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rec.relatedSkills.map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 bg-muted text-muted-foreground font-mono text-[10px]"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {!draft && (
          <Button onClick={onDraft} disabled={isDrafting} size="sm" className="ml-auto gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {isDrafting ? 'Drafting…' : 'Draft this campaign'}
          </Button>
        )}
      </div>
    </CardContent>
  );
}

// ─── Draft tab ────────────────────────────────────────────────────────

function DraftBody({
  draft,
  timezone,
  isRefining,
  isUpdatingStatus,
  sendingPieceIndex,
  lastSendResultByPiece,
  completionsByPiece,
  togglingPieceIndex,
  onRefine,
  onSetStatus,
  onSendSms,
  onSegmentBlastSent,
  onToggleCompletion,
}: Props & { draft: DraftRow }) {
  return (
    <div className="bg-secondary/30">
      <DraftView
        draft={draft}
        timezone={timezone}
        isRefining={isRefining}
        isUpdatingStatus={isUpdatingStatus}
        sendingPieceIndex={sendingPieceIndex}
        lastSendResultByPiece={lastSendResultByPiece}
        completionsByPiece={completionsByPiece}
        togglingPieceIndex={togglingPieceIndex}
        onRefine={onRefine}
        onSetStatus={onSetStatus}
        onSendSms={onSendSms}
        onSegmentBlastSent={onSegmentBlastSent}
        onToggleCompletion={onToggleCompletion}
      />
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-foreground leading-relaxed">{children}</p>
    </div>
  );
}
