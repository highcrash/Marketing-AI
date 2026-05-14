'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  History,
  LayoutGrid,
  ListTodo,
  Loader2,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { AnalysisView } from './AnalysisView';
import { GoalsCard } from './GoalsCard';
import { OperationalStatsCard } from './OperationalStatsCard';
import type { AnalysisResult, Recommendation } from '@/lib/ai/analyze';
import type { AnalysisListItem, CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { DraftRow } from '@/lib/drafts';
import type { SmsSendRow } from '@/lib/sms-sends';
import type { CampaignPlan } from '@/lib/plan-types';

export type DashboardSection = 'overview' | 'audience' | 'plan' | 'recs' | 'activity';

const REC_CATEGORIES: Array<{ id: Recommendation['category']; label: string }> = [
  { id: 'acquisition', label: 'Acquisition' },
  { id: 'retention', label: 'Retention' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'product-mix', label: 'Product mix' },
  { id: 'channel-strategy', label: 'Channel strategy' },
  { id: 'content', label: 'Content' },
  { id: 'operations', label: 'Operations' },
  { id: 'brand', label: 'Brand' },
];

type Status = 'idle' | 'running' | 'error';

interface Current {
  id: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  completions: CompletionsByKey;
}

export function AnalysisDashboard({
  initialLatest,
  initialList,
}: {
  initialLatest: Current | null;
  initialList: AnalysisListItem[];
}) {
  const [current, setCurrent] = useState<Current | null>(initialLatest);
  const [list, setList] = useState<AnalysisListItem[]>(initialList);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [draftingIndex, setDraftingIndex] = useState<number | null>(null);
  const [draftError, setDraftError] = useState<{ recIndex: number; message: string } | null>(null);
  const [refiningDraftId, setRefiningDraftId] = useState<string | null>(null);
  const [updatingStatusDraftId, setUpdatingStatusDraftId] = useState<string | null>(null);
  const [sendingPieceKey, setSendingPieceKey] = useState<string | null>(null);
  const [lastSendResultsByPiece, setLastSendResultsByPiece] = useState<
    Record<string, SmsSendRow | null>
  >({});
  const [smsError, setSmsError] = useState<string | null>(null);
  const [togglingCompletionKey, setTogglingCompletionKey] = useState<string | null>(null);
  /// Bumped after every state-changing action so the ActivityPanel
  /// re-fetches its timeline. Stats are derived client-side from
  /// `current.drafts` so they update instantly without waiting.
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const bumpActivity = () => setActivityRefreshKey((k) => k + 1);

  /// Which dashboard section the user is looking at. Sidebar nav
  /// drives this; defaults to 'overview' on fresh load and on every
  /// analysis switch.
  const [section, setSection] = useState<DashboardSection>('overview');
  /// Within the Recommendations section, which category the user is
  /// filtering to. 'all' shows every rec.
  const [recCategory, setRecCategory] = useState<'all' | Recommendation['category']>('all');
  /// When a plan task asks to jump to its rec, we set this so the
  /// content area can scroll to the matching #rec-N element after the
  /// section switches. Cleared once the scroll fires.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /// Campaign plan lifted up to dashboard scope so both the Plan
  /// section and the Recommendations section can read it. The Plan
  /// section drives mutations; Rec cards use it read-only to surface
  /// 'In plan · Week N · …' badges + a click-to-jump link.
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const latestPlan = plans[0] ?? null;

  const loadPlans = useCallback(
    async (analysisId: string) => {
      setPlanLoading(true);
      try {
        const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}/plan`);
        const body = (await res.json()) as { plans?: CampaignPlan[] };
        setPlans(body.plans ?? []);
      } catch {
        setPlans([]);
      } finally {
        setPlanLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (current) void loadPlans(current.id);
    else setPlans([]);
  }, [current, loadPlans]);

  /// Counts per rec category for the sidebar sub-nav.
  const categoryCounts = useMemo(() => {
    if (!current) return {} as Record<Recommendation['category'], number>;
    const out: Partial<Record<Recommendation['category'], number>> = {};
    for (const r of current.result.recommendations) {
      out[r.category] = (out[r.category] ?? 0) + 1;
    }
    return out as Record<Recommendation['category'], number>;
  }, [current]);

  /// Called by Plan tasks: jump to the rec, highlight it after scroll.
  function jumpToRec(recIndex: number) {
    setSection('recs');
    setRecCategory('all');
    setScrollTarget(`rec-${recIndex}`);
  }

  /// After section change OR scrollTarget change, attempt to scroll.
  useEffect(() => {
    if (!scrollTarget) return;
    // requestAnimationFrame so the freshly-rendered section's DOM
    // exists before we look for the anchor.
    const handle = requestAnimationFrame(() => {
      const el = document.getElementById(scrollTarget);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Pulse the rec for a moment so the user's eye finds it.
        el.classList.add('ring-2', 'ring-primary');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary');
        }, 2000);
      }
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(handle);
  }, [scrollTarget, section]);

  // Reset section when switching analyses so the user doesn't land on
  // a deep page they weren't expecting.
  useEffect(() => {
    setSection('overview');
    setRecCategory('all');
  }, [current?.id]);

  async function runAnalysis() {
    setStatus('running');
    setError(null);
    setElapsedMs(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - t0), 500);

    try {
      const res = await fetch('/api/analyze', { method: 'POST' });
      const body = (await res.json()) as
        | { id: string; result: AnalysisResult }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }

      // Fresh analysis means no drafts (and therefore no completions).
      setCurrent({ id: body.id, result: body.result, drafts: {}, completions: {} });
      setStatus('idle');
      bumpActivity();

      const listRes = await fetch('/api/analyses');
      if (listRes.ok) {
        const listBody = (await listRes.json()) as { items: AnalysisListItem[] };
        setList(listBody.items);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setStatus('error');
    } finally {
      clearInterval(tick);
    }
  }

  async function loadAnalysis(id: string) {
    if (current?.id === id) return;
    try {
      const res = await fetch(`/api/analyses/${id}`);
      const body = (await res.json()) as
        | {
            id: string;
            result: AnalysisResult;
            drafts: DraftsByRecIndex;
            completions: CompletionsByKey;
          }
        | { error: string };
      if (!res.ok || 'error' in body) return;
      setCurrent({
        id: body.id,
        result: body.result,
        drafts: body.drafts,
        completions: body.completions ?? {},
      });
      bumpActivity();
    } catch {
      // Swallow — list rows that fail just stay un-selected.
    }
  }

  async function draftRec(recIndex: number) {
    if (!current || draftingIndex !== null) return;
    setDraftingIndex(recIndex);
    setDraftError(null);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: current.id, recIndex }),
      });
      const body = (await res.json()) as
        | { draft: DraftRow }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }

      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              drafts: { ...prev.drafts, [recIndex]: body.draft },
            }
          : prev,
      );
      bumpActivity();
    } catch (err: unknown) {
      setDraftError({
        recIndex,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setDraftingIndex(null);
    }
  }

  async function setDraftStatus(
    draftId: string,
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
  ) {
    if (!current || updatingStatusDraftId !== null) return;
    setUpdatingStatusDraftId(draftId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as
        | { draft: DraftRow }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              drafts: { ...prev.drafts, [body.draft.recIndex]: body.draft },
            }
          : prev,
      );
      bumpActivity();
    } catch (err: unknown) {
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setUpdatingStatusDraftId(null);
    }
  }

  async function sendSms(
    draftId: string,
    pieceIndex: number,
    phone: string,
    bodyOverride: string | null,
  ) {
    const key = `${draftId}:${pieceIndex}`;
    if (sendingPieceKey !== null) return;
    setSendingPieceKey(key);
    setSmsError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          phone,
          ...(bodyOverride != null ? { body: bodyOverride } : {}),
        }),
      });
      const body = (await res.json()) as
        | { event: SmsSendRow }
        | { event?: SmsSendRow; error: string; message: string };

      if ('event' in body && body.event) {
        // Whether SENT or PROVIDER_ERROR, persist the result so the user sees it.
        setLastSendResultsByPiece((prev) => ({ ...prev, [key]: body.event! }));
        // Re-fetch completions so the auto-mark from a successful send
        // shows up immediately. Cheap query — one DB read.
        if (body.event.status === 'SENT' && current) {
          void refetchCompletions(current.id);
        }
        bumpActivity();
      }
      if (!res.ok || 'error' in body) {
        const msg = 'message' in body ? body.message : `HTTP ${res.status}`;
        // Errors from the upstream send still get an event row + result line;
        // only surface a banner error if we have nothing at all.
        if (!('event' in body && body.event)) setSmsError(msg);
      }
    } catch (err: unknown) {
      setSmsError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSendingPieceKey(null);
    }
  }

  async function toggleCompletion(
    draftId: string,
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
    attachment?: { path: string; name: string; mime: string; size: number } | null,
  ) {
    const key = `${draftId}:${pieceIndex}`;
    if (togglingCompletionKey !== null) return;
    setTogglingCompletionKey(key);
    try {
      const method = currentlyComplete ? 'DELETE' : 'POST';
      const trimmedNotes =
        typeof notes === 'string' && notes.trim().length > 0 ? notes.trim() : null;
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(draftId)}/pieces/${pieceIndex}/complete`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body:
            method === 'POST'
              ? JSON.stringify({
                  notes: trimmedNotes,
                  attachment: attachment ?? undefined,
                })
              : undefined,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.length > 0 ? text.slice(0, 200) : `HTTP ${res.status}`);
      }
      setCurrent((prev) => {
        if (!prev) return prev;
        const completions = { ...prev.completions };
        if (currentlyComplete) {
          delete completions[key];
        } else {
          completions[key] = {
            id: 'pending',
            draftId,
            pieceIndex,
            notes: trimmedNotes,
            source: 'manual',
            attachment: attachment ?? null,
            completedAt: new Date().toISOString(),
          };
        }
        return { ...prev, completions };
      });
      bumpActivity();
    } catch (err: unknown) {
      // Surface via the existing draftError slot — same UI corner the
      // user already scans for problems.
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setTogglingCompletionKey(null);
    }
  }

  async function refetchCompletions(analysisId: string) {
    try {
      const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        completions?: CompletionsByKey;
      };
      if (!body.completions) return;
      setCurrent((prev) =>
        prev && prev.id === analysisId ? { ...prev, completions: body.completions! } : prev,
      );
    } catch {
      // Best-effort; ignore.
    }
  }

  async function refineDraft(draftId: string, feedback: string) {
    if (!current || refiningDraftId !== null) return;
    setRefiningDraftId(draftId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const body = (await res.json()) as
        | { draft: DraftRow }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }

      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              drafts: { ...prev.drafts, [body.draft.recIndex]: body.draft },
            }
          : prev,
      );
      bumpActivity();
    } catch (err: unknown) {
      // We don't have a stable recIndex here without re-deriving it, so
      // surface the error generically via the same sidebar slot.
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setRefiningDraftId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
      <aside className="lg:sticky lg:top-20 space-y-4">
        <Button
          onClick={runAnalysis}
          disabled={status === 'running'}
          size="lg"
          className="w-full gap-1.5"
        >
          {status === 'running' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {current ? 'Run new audit' : 'Run analysis'}
            </>
          )}
        </Button>

        {status === 'running' && (
          <Card>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 bg-primary animate-pulse shadow-[0_0_8px_oklch(0.76_0.18_235_/_0.6)]" />
                <span className="text-xs text-foreground tabular-nums">
                  {(elapsedMs / 1000).toFixed(0)}s
                </span>
                <span className="text-xs text-muted-foreground">· typical ~75s</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Fetching snapshot, loading skills, calling Claude. Don&apos;t refresh.
              </p>
            </CardContent>
          </Card>
        )}

        {status === 'error' && error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription className="font-mono break-all">{error}</AlertDescription>
          </Alert>
        )}

        {draftError && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {draftError.recIndex >= 0
                ? `Draft failed (rec #${draftError.recIndex + 1})`
                : 'Refine failed'}
            </AlertTitle>
            <AlertDescription className="font-mono break-all">{draftError.message}</AlertDescription>
          </Alert>
        )}

        {smsError && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>SMS send failed</AlertTitle>
            <AlertDescription className="font-mono break-all">{smsError}</AlertDescription>
          </Alert>
        )}

        {current && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-semibold">
                Sections
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 space-y-0.5">
              <SidebarNav
                icon={LayoutGrid}
                label="Overview"
                active={section === 'overview'}
                onClick={() => setSection('overview')}
              />
              <SidebarNav
                icon={Users}
                label="Audience & goals"
                active={section === 'audience'}
                onClick={() => setSection('audience')}
                badge={current.result.audience?.confidence === 'low' ? 'check' : undefined}
              />
              <SidebarNav
                icon={Calendar}
                label="Campaign plan"
                active={section === 'plan'}
                onClick={() => setSection('plan')}
                badge={latestPlan ? `${latestPlan.tasks.length}` : undefined}
              />
              <SidebarNav
                icon={ListTodo}
                label="Recommendations"
                active={section === 'recs' && recCategory === 'all'}
                onClick={() => {
                  setSection('recs');
                  setRecCategory('all');
                }}
                badge={`${current.result.recommendations.length}`}
              />
              {/* Sub-nav: filter by category (only the categories
                  actually present on this audit). Auto-activates the
                  parent 'Recommendations' section. */}
              {section === 'recs' && (
                <div className="pl-6 space-y-0.5 mt-1">
                  {REC_CATEGORIES.filter((c) => (categoryCounts[c.id] ?? 0) > 0).map((c) => (
                    <SidebarNav
                      key={c.id}
                      label={c.label}
                      active={recCategory === c.id}
                      onClick={() => setRecCategory(c.id)}
                      badge={`${categoryCounts[c.id] ?? 0}`}
                      compact
                    />
                  ))}
                </div>
              )}
              <SidebarNav
                icon={Activity}
                label="Activity"
                active={section === 'activity'}
                onClick={() => setSection('activity')}
              />
            </CardContent>
          </Card>
        )}

        <GoalsCard />
        <OperationalStatsCard refreshKey={activityRefreshKey} />

        <Card>
          <CardHeader className="py-3 flex-row items-center gap-2">
            <History className="h-3.5 w-3.5 text-muted-foreground" />
            <CardTitle className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-semibold">
              Past runs · {list.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">No runs yet.</p>
            ) : (
              <ul className="space-y-1">
                {list.slice(0, 5).map((item) => {
                  const isActive = current?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => loadAnalysis(item.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs border transition-colors',
                          isActive
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary hover:text-foreground',
                        )}
                      >
                        <div className="font-medium text-foreground">
                          {new Date(item.generatedAt).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {item.recommendationCount} recs · {item.model.replace('claude-', '')}
                        </div>
                      </button>
                    </li>
                  );
                })}
                {list.length > 5 && (
                  <li className="text-[10px] text-muted-foreground px-3 pt-1">
                    + {list.length - 5} older
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </aside>

      <section ref={contentRef} className="min-w-0">
        {current ? (
          <AnalysisView
            analysisId={current.id}
            result={current.result}
            drafts={current.drafts}
            completions={current.completions}
            section={section}
            recCategory={recCategory}
            plans={plans}
            latestPlan={latestPlan}
            planLoading={planLoading}
            onPlanCreated={(p) => setPlans((prev) => [p, ...prev])}
            onJumpToRec={jumpToRec}
            draftingIndex={draftingIndex}
            refiningDraftId={refiningDraftId}
            updatingStatusDraftId={updatingStatusDraftId}
            sendingPieceKey={sendingPieceKey}
            lastSendResultsByPiece={lastSendResultsByPiece}
            togglingCompletionKey={togglingCompletionKey}
            activityRefreshKey={activityRefreshKey}
            onDraft={draftRec}
            onRefine={refineDraft}
            onSetStatus={setDraftStatus}
            onSendSms={sendSms}
            onSegmentBlastSent={() => {
              bumpActivity();
              if (current) void refetchCompletions(current.id);
            }}
            onToggleCompletion={toggleCompletion}
          />
        ) : status !== 'running' ? (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-primary mb-3" />
              <p className="text-foreground font-medium">No analysis yet.</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Click <span className="text-foreground font-medium">Run analysis</span> in the sidebar to
                fetch business data and generate recommendations. The first run takes ~75s and costs
                ~$1 in Opus tokens.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function SidebarNav({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  compact,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 text-left transition-colors',
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <Badge variant={active ? 'default' : 'muted'} className="px-1 py-0">
          {badge}
        </Badge>
      )}
    </button>
  );
}
