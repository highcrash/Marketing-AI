'use client';

import { useMemo } from 'react';
import { AlertTriangle, Sparkles, Target, Users } from 'lucide-react';

import type { AnalysisResult, Recommendation } from '@/lib/ai/analyze';
import type { CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { SmsSendRow } from '@/lib/sms-sends';
import type { CampaignPlan, PlanTask } from '@/lib/plan-types';
import type { DashboardSection } from './AnalysisDashboard';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateShort, formatDateTime, formatHourOfDay } from '@/lib/format-tz';

import { ActivityPanel } from './ActivityPanel';
import { AuditComparisonPanel } from './AuditComparisonPanel';
import { CampaignPlanCard } from './CampaignPlanCard';
import { RecommendationCard } from './RecommendationCard';

const EMPTY_SENDS: Record<number, SmsSendRow | null> = {};
const EMPTY_COMPLETIONS: Record<number, PieceCompletionRow | null> = {};

const CATEGORY_LABEL: Record<Recommendation['category'], string> = {
  acquisition: 'Acquisition',
  retention: 'Retention',
  pricing: 'Pricing',
  'product-mix': 'Product mix',
  'channel-strategy': 'Channel strategy',
  content: 'Content',
  operations: 'Operations',
  brand: 'Brand',
};

function priorityRank(p: Recommendation['priority']): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2;
}

interface AnalysisViewProps {
  analysisId: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  /// Which dashboard section is active. The component renders only
  /// the corresponding subtree; the sidebar nav lives in
  /// AnalysisDashboard.
  section: DashboardSection;
  recCategory: 'all' | Recommendation['category'];
  plans: CampaignPlan[];
  latestPlan: CampaignPlan | null;
  planLoading: boolean;
  onPlanCreated: (plan: CampaignPlan) => void;
  /// Plan task clicks call this with the recIndex so the dashboard
  /// can switch to the Recommendations section + scroll to the rec.
  onJumpToRec: (recIndex: number) => void;
  draftingIndex: number | null;
  refiningDraftId: string | null;
  updatingStatusDraftId: string | null;
  sendingPieceKey: string | null;
  lastSendResultsByPiece: Record<string, SmsSendRow | null>;
  completions: CompletionsByKey;
  togglingCompletionKey: string | null;
  activityRefreshKey: number;
  onDraft: (recIndex: number) => void;
  onRefine: (draftId: string, feedback: string) => void;
  onSetStatus: (draftId: string, status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (
    draftId: string,
    pieceIndex: number,
    phone: string,
    bodyOverride: string | null,
  ) => void;
  onSegmentBlastSent: () => void;
  onToggleCompletion: (
    draftId: string,
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
    attachment?: { path: string; name: string; mime: string; size: number } | null,
  ) => void;
}

export function AnalysisView(props: AnalysisViewProps) {
  const { result, drafts, completions, section, recCategory, latestPlan } = props;

  /// Map recIndex → tasks scheduled for it in the latest plan. Used
  /// to surface "In plan · Week N" on each rec card.
  const tasksByRec = useMemo(() => {
    const out = new Map<number, PlanTask[]>();
    if (!latestPlan) return out;
    for (const t of latestPlan.tasks) {
      const arr = out.get(t.recIndex) ?? [];
      arr.push(t);
      out.set(t.recIndex, arr);
    }
    return out;
  }, [latestPlan]);

  return (
    <div className="space-y-6">
      {section === 'overview' && <OverviewSection {...props} />}
      {section === 'audience' && <AudienceSection {...props} />}
      {section === 'plan' && <PlanSection {...props} tasksByRec={tasksByRec} />}
      {section === 'recs' && <RecsSection {...props} tasksByRec={tasksByRec} />}
      {section === 'activity' && <ActivitySection {...props} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// OVERVIEW

function OverviewSection({ result, drafts, completions, latestPlan, onJumpToRec }: AnalysisViewProps) {
  const totalRecs = result.recommendations.length;
  const drafted = Object.keys(drafts).length;
  const completed = Object.values(completions).filter(Boolean).length;
  const totalPieces = Object.values(drafts).reduce(
    (s, d) => s + (d?.payload.pieces?.length ?? 0),
    0,
  );
  const tz = result.business.timezone;

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Audit"
        title={result.business.name}
        subtitle={`${formatDateTime(result.generatedAt, tz)} · ${result.model}`}
      />

      <Card>
        <CardContent className="p-6 space-y-5">
          <p className="text-foreground/90 leading-relaxed">{result.summary}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
            <Stat label="Recommendations" value={totalRecs.toString()} />
            <Stat label="Drafted" value={`${drafted} / ${totalRecs}`} />
            <Stat
              label="Completed pieces"
              value={`${completed}${totalPieces > 0 ? ` / ${totalPieces}` : ''}`}
            />
            <Stat
              label="Plan tasks"
              value={latestPlan ? latestPlan.tasks.length.toString() : '—'}
            />
          </div>
        </CardContent>
      </Card>

      {result.audience && result.audience.confidence === 'low' && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Confirm the audience before acting on segment-specific recs</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>The AI&apos;s confidence in the inferred audience is low. Sanity-check:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.audience.needsConfirmation.map((n, i) => (
                <li key={i} className="text-sm">{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {latestPlan && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Up next from the plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UpNext plan={latestPlan} timezone={tz} onJumpToRec={onJumpToRec} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UpNext({
  plan,
  timezone,
  onJumpToRec,
}: {
  plan: CampaignPlan;
  timezone: string;
  onJumpToRec: (i: number) => void;
}) {
  const upcoming = useMemo(
    () =>
      plan.tasks
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .filter((t) => new Date(t.date).getTime() >= Date.now() - 24 * 3600_000)
        .slice(0, 5),
    [plan.tasks],
  );
  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Everything in this plan is in the past. Build a new plan from the Plan section.
      </p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {upcoming.map((t, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border border-border bg-card px-3 py-2 text-sm hover:border-primary transition-colors cursor-pointer"
          onClick={() => onJumpToRec(t.recIndex)}
          role="button"
        >
          <span className="font-mono text-xs text-muted-foreground w-24 flex-shrink-0">
            {formatDateShort(t.date, timezone)}
            {t.hour !== null && ` · ${formatHourOfDay(t.hour)}`}
          </span>
          <span className="flex-1 truncate text-foreground">{t.title}</span>
          <Badge variant="muted" className="flex-shrink-0">
            Rec #{t.recIndex + 1}
          </Badge>
        </li>
      ))}
    </ol>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AUDIENCE & GOALS

function AudienceSection({ result }: AnalysisViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Audience & goals"
        title="Who we're targeting"
        subtitle="What the AI inferred from your POS data and connected Facebook page."
      />

      {result.audience && result.audience.confidence === 'low' && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Confirm before acting on segment-specific recs</AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>The AI&apos;s confidence is <span className="font-medium">low</span>. Sanity-check:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {result.audience.needsConfirmation.map((n, i) => (
                <li key={i} className="text-sm">{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Inferred goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {result.inferredGoals.map((g, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground/90 leading-relaxed">
                  <span className="text-primary mt-1">●</span>
                  {g}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {result.audience && (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="flex items-center justify-between gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Audience
                </span>
                <Badge
                  variant={
                    result.audience.confidence === 'high'
                      ? 'success'
                      : result.audience.confidence === 'medium'
                      ? 'warning'
                      : 'destructive'
                  }
                >
                  {result.audience.confidence} confidence
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap text-foreground/90">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">{result.audience.region}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{result.audience.country}</span>
              </div>
              {result.audience.highValueSegments.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    High-value segments
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {result.audience.highValueSegments.map((s, i) => (
                      <Badge key={i} variant="muted">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {result.audience.demographics.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    Demographics
                  </p>
                  <ul className="text-foreground/90 space-y-1 text-[12px]">
                    {result.audience.demographics.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground mt-1">·</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.audience.behaviour.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                    Behaviour
                  </p>
                  <ul className="text-foreground/90 space-y-1 text-[12px]">
                    {result.audience.behaviour.map((b, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground mt-1">·</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// CAMPAIGN PLAN

function PlanSection({
  analysisId,
  plans,
  latestPlan,
  planLoading,
  onPlanCreated,
  onJumpToRec,
  result,
}: AnalysisViewProps & { tasksByRec: Map<number, PlanTask[]> }) {
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Campaign plan"
        title="Calendar of todos"
        subtitle="Each task is linked to the recommendation it implements — click to jump."
      />
      <CampaignPlanCard
        analysisId={analysisId}
        plans={plans}
        latestPlan={latestPlan}
        loading={planLoading}
        onPlanCreated={onPlanCreated}
        onJumpToRec={onJumpToRec}
        recommendations={result.recommendations}
        timezone={result.business.timezone}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// RECOMMENDATIONS

function RecsSection(
  props: AnalysisViewProps & { tasksByRec: Map<number, PlanTask[]> },
) {
  const {
    result,
    drafts,
    completions,
    recCategory,
    tasksByRec,
    sendingPieceKey,
    lastSendResultsByPiece,
    togglingCompletionKey,
    draftingIndex,
    refiningDraftId,
    updatingStatusDraftId,
    onDraft,
    onRefine,
    onSetStatus,
    onSendSms,
    onSegmentBlastSent,
    onToggleCompletion,
  } = props;
  const tz = result.business.timezone;

  const filtered = useMemo(
    () =>
      result.recommendations
        .map((rec, recIndex) => ({ rec, recIndex }))
        .filter((r) => recCategory === 'all' || r.rec.category === recCategory)
        .sort((a, b) => priorityRank(a.rec.priority) - priorityRank(b.rec.priority)),
    [result.recommendations, recCategory],
  );

  // Group by category only when showing 'all'; otherwise just list flat.
  const grouped: Record<string, Array<{ rec: Recommendation; recIndex: number }>> = {};
  if (recCategory === 'all') {
    for (const item of filtered) {
      (grouped[item.rec.category] ??= []).push(item);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Recommendations"
        title={recCategory === 'all' ? 'All recommendations' : CATEGORY_LABEL[recCategory]}
        subtitle={`${filtered.length} of ${result.recommendations.length} · pick a category in the sidebar to filter.`}
      />

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No recommendations in this category. Pick another in the sidebar.
        </p>
      )}

      {recCategory === 'all'
        ? Object.entries(grouped).map(([category, recs]) => (
            <div key={category} className="space-y-3">
              <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border pb-2">
                {CATEGORY_LABEL[category as Recommendation['category']] ?? category} · {recs.length}
              </h4>
              <div className="space-y-4">
                {recs.map(({ rec, recIndex }) => (
                  <RecCardSlot
                    key={recIndex}
                    rec={rec}
                    recIndex={recIndex}
                    draftRow={drafts[recIndex]}
                    planTasks={tasksByRec.get(recIndex) ?? []}
                    timezone={tz}
                    sendingPieceKey={sendingPieceKey}
                    lastSendResultsByPiece={lastSendResultsByPiece}
                    completions={completions}
                    togglingCompletionKey={togglingCompletionKey}
                    draftingIndex={draftingIndex}
                    refiningDraftId={refiningDraftId}
                    updatingStatusDraftId={updatingStatusDraftId}
                    onDraft={onDraft}
                    onRefine={onRefine}
                    onSetStatus={onSetStatus}
                    onSendSms={onSendSms}
                    onSegmentBlastSent={onSegmentBlastSent}
                    onToggleCompletion={onToggleCompletion}
                  />
                ))}
              </div>
            </div>
          ))
        : (
          <div className="space-y-4">
            {filtered.map(({ rec, recIndex }) => (
              <RecCardSlot
                key={recIndex}
                rec={rec}
                recIndex={recIndex}
                draftRow={drafts[recIndex]}
                planTasks={tasksByRec.get(recIndex) ?? []}
                timezone={tz}
                sendingPieceKey={sendingPieceKey}
                lastSendResultsByPiece={lastSendResultsByPiece}
                completions={completions}
                togglingCompletionKey={togglingCompletionKey}
                draftingIndex={draftingIndex}
                refiningDraftId={refiningDraftId}
                updatingStatusDraftId={updatingStatusDraftId}
                onDraft={onDraft}
                onRefine={onRefine}
                onSetStatus={onSetStatus}
                onSendSms={onSendSms}
                onSegmentBlastSent={onSegmentBlastSent}
                onToggleCompletion={onToggleCompletion}
              />
            ))}
          </div>
        )}
    </div>
  );
}

interface RecCardSlotProps {
  rec: Recommendation;
  recIndex: number;
  draftRow: AnalysisViewProps['drafts'][number] | undefined;
  planTasks: PlanTask[];
  timezone: string;
  sendingPieceKey: string | null;
  lastSendResultsByPiece: Record<string, SmsSendRow | null>;
  completions: CompletionsByKey;
  togglingCompletionKey: string | null;
  draftingIndex: number | null;
  refiningDraftId: string | null;
  updatingStatusDraftId: string | null;
  onDraft: (recIndex: number) => void;
  onRefine: (draftId: string, feedback: string) => void;
  onSetStatus: (draftId: string, status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (
    draftId: string,
    pieceIndex: number,
    phone: string,
    bodyOverride: string | null,
  ) => void;
  onSegmentBlastSent: () => void;
  onToggleCompletion: AnalysisViewProps['onToggleCompletion'];
}

/// Adapts a Recommendation row into the props RecommendationCard
/// expects (per-piece slicing of completion/send maps). Kept here so
/// RecsSection above stays readable.
function RecCardSlot({
  rec,
  recIndex,
  draftRow,
  planTasks,
  timezone,
  sendingPieceKey,
  lastSendResultsByPiece,
  completions,
  togglingCompletionKey,
  draftingIndex,
  refiningDraftId,
  updatingStatusDraftId,
  onDraft,
  onRefine,
  onSetStatus,
  onSendSms,
  onSegmentBlastSent,
  onToggleCompletion,
}: RecCardSlotProps) {
  let sendingPieceIndex: number | null = null;
  let perPieceSends: Record<number, SmsSendRow | null> = EMPTY_SENDS;
  let perPieceCompletions: Record<number, PieceCompletionRow | null> = EMPTY_COMPLETIONS;
  let togglingPieceIndex: number | null = null;
  if (draftRow) {
    if (sendingPieceKey?.startsWith(`${draftRow.id}:`)) {
      const idx = Number(sendingPieceKey.slice(draftRow.id.length + 1));
      if (!Number.isNaN(idx)) sendingPieceIndex = idx;
    }
    if (togglingCompletionKey?.startsWith(`${draftRow.id}:`)) {
      const idx = Number(togglingCompletionKey.slice(draftRow.id.length + 1));
      if (!Number.isNaN(idx)) togglingPieceIndex = idx;
    }
    const sendsFiltered: Record<number, SmsSendRow | null> = {};
    for (const [key, val] of Object.entries(lastSendResultsByPiece)) {
      if (key.startsWith(`${draftRow.id}:`)) {
        const idx = Number(key.slice(draftRow.id.length + 1));
        if (!Number.isNaN(idx)) sendsFiltered[idx] = val;
      }
    }
    perPieceSends = sendsFiltered;
    const compFiltered: Record<number, PieceCompletionRow | null> = {};
    for (const [key, val] of Object.entries(completions)) {
      if (key.startsWith(`${draftRow.id}:`)) {
        const idx = Number(key.slice(draftRow.id.length + 1));
        if (!Number.isNaN(idx)) compFiltered[idx] = val;
      }
    }
    perPieceCompletions = compFiltered;
  }
  return (
    <div id={`rec-${recIndex}`} className="transition-shadow duration-300">
      <RecommendationCard
        rec={rec}
        draft={draftRow}
        planTasks={planTasks}
        timezone={timezone}
        isDrafting={draftingIndex === recIndex}
        isRefining={!!draftRow && refiningDraftId === draftRow.id}
        isUpdatingStatus={!!draftRow && updatingStatusDraftId === draftRow.id}
        sendingPieceIndex={sendingPieceIndex}
        lastSendResultByPiece={perPieceSends}
        completionsByPiece={perPieceCompletions}
        togglingPieceIndex={togglingPieceIndex}
        onDraft={() => onDraft(recIndex)}
        onRefine={(feedback) => draftRow && onRefine(draftRow.id, feedback)}
        onSetStatus={(status) => draftRow && onSetStatus(draftRow.id, status)}
        onSendSms={(pieceIndex, phone, bodyOverride) =>
          draftRow && onSendSms(draftRow.id, pieceIndex, phone, bodyOverride)
        }
        onSegmentBlastSent={onSegmentBlastSent}
        onToggleCompletion={(pieceIndex, currentlyComplete, notes, attachment) =>
          draftRow &&
          onToggleCompletion(
            draftRow.id,
            pieceIndex,
            currentlyComplete,
            notes,
            attachment,
          )
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ACTIVITY

function ActivitySection({ analysisId, result, drafts, activityRefreshKey }: AnalysisViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Activity"
        title="Timeline & changes"
        subtitle="Every draft, refine, send, blast, post, and completion across this audit."
      />
      <ActivityPanel
        analysisId={analysisId}
        result={result}
        drafts={drafts}
        refreshKey={activityRefreshKey}
      />
      <AuditComparisonPanel analysisId={analysisId} timezone={result.business.timezone} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SHARED

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
