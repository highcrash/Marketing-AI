'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  ImageIcon,
  Loader2,
  Megaphone,
  PaintBucket,
  Pencil,
  Plus,
  ShoppingBag,
  Sparkles,
  Store,
  Users,
  Video,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type DisabledCategory =
  | 'video-production'
  | 'photography'
  | 'physical-campaigns'
  | 'influencer-coordination'
  | 'creative-asset-production'
  | 'offline-promotions';

const DISABLED_OPTIONS: Array<{ id: DisabledCategory; label: string }> = [
  { id: 'video-production', label: 'Video production' },
  { id: 'photography', label: 'Photography' },
  { id: 'physical-campaigns', label: 'Physical campaigns' },
  { id: 'influencer-coordination', label: 'Influencer coordination' },
  { id: 'creative-asset-production', label: 'Creative asset production' },
  { id: 'offline-promotions', label: 'Offline promotions' },
];

interface PlanWeekSummary {
  weekIndex: number;
  startDate: string;
  theme: string;
  kpiToCheck: string;
}

interface PlanTask {
  recIndex: number;
  title: string;
  date: string;
  hour: number | null;
  budgetMinor: number;
  category:
    | 'sms-blast'
    | 'social-post'
    | 'paid-ad'
    | 'in-store'
    | 'email'
    | 'video-production'
    | 'photography'
    | 'designer-brief'
    | 'analysis'
    | 'other';
  requiresHuman: boolean;
  rationale: string;
}

interface CampaignPlan {
  id: string;
  analysisId: string;
  generatedAt: string;
  totalBudgetMinor: number;
  horizonDays: number;
  startDate: string;
  disabledCategories: DisabledCategory[];
  summary: string;
  redistributionNotes: string[];
  weeks: PlanWeekSummary[];
  tasks: PlanTask[];
}

const CATEGORY_META: Record<
  PlanTask['category'],
  { label: string; icon: typeof Megaphone; className: string }
> = {
  'sms-blast': { label: 'SMS', icon: Megaphone, className: 'bg-primary/15 text-primary' },
  'social-post': { label: 'Social', icon: Sparkles, className: 'bg-primary/15 text-primary' },
  'paid-ad': { label: 'Paid', icon: DollarSign, className: 'bg-amber-950/40 text-amber-300' },
  'in-store': { label: 'In-store', icon: Store, className: 'bg-muted text-foreground' },
  email: { label: 'Email', icon: Megaphone, className: 'bg-primary/15 text-primary' },
  'video-production': { label: 'Video', icon: Video, className: 'bg-muted text-foreground' },
  photography: { label: 'Photo', icon: ImageIcon, className: 'bg-muted text-foreground' },
  'designer-brief': { label: 'Brief', icon: Pencil, className: 'bg-muted text-foreground' },
  analysis: { label: 'Analysis', icon: PaintBucket, className: 'bg-muted text-foreground' },
  other: { label: 'Other', icon: ShoppingBag, className: 'bg-muted text-foreground' },
};

export function CampaignPlanCard({ analysisId }: { analysisId: string }) {
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}/plan`);
      const body = (await res.json()) as { plans?: CampaignPlan[]; error?: string };
      if (!res.ok || body.error) return;
      setPlans(body.plans ?? []);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const latest = plans[0] ?? null;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 py-4">
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
            <Calendar className="h-4 w-4 text-primary" />
            Campaign plan
            {plans.length > 0 && (
              <Badge variant="muted" className="ml-1">
                {plans.length}
              </Badge>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => setShowBuilder(true)} className="gap-1.5">
            {latest ? (
              <>
                <Plus className="h-3.5 w-3.5" />
                New plan
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Build plan
              </>
            )}
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : latest ? (
            <PlanDisplay plan={latest} />
          ) : (
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              Turn this audit&apos;s recommendations into a time-bucketed calendar with redistributable
              budget. Pick a total budget + horizon; the AI lays every task on a day (and time-of-
              day for sends), and re-routes the budget when you disable categories you handle
              yourself.
            </p>
          )}
        </CardContent>
      </Card>

      <PlanBuilderDialog
        open={showBuilder}
        analysisId={analysisId}
        onOpenChange={setShowBuilder}
        onBuilt={(plan) => {
          setPlans((prev) => [plan, ...prev]);
          setShowBuilder(false);
        }}
      />
    </>
  );
}

function PlanDisplay({ plan }: { plan: CampaignPlan }) {
  const tasksByWeek = new Map<number, PlanTask[]>();
  // Bucket tasks into their week by date. We use the week's startDate
  // + 7 days as the boundary so tasks line up with the weeks the AI
  // emitted.
  const weekStarts = plan.weeks
    .slice()
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
    .map((w) => ({ weekIndex: w.weekIndex, start: new Date(w.startDate).getTime() }));
  for (const t of plan.tasks) {
    const taskTime = new Date(t.date).getTime();
    // Pick the week whose start is the latest one <= taskTime.
    let assigned = weekStarts[0]?.weekIndex ?? 1;
    for (const w of weekStarts) {
      if (w.start <= taskTime) assigned = w.weekIndex;
      else break;
    }
    const arr = tasksByWeek.get(assigned) ?? [];
    arr.push(t);
    tasksByWeek.set(assigned, arr);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground/90 leading-relaxed">{plan.summary}</p>

      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
        <Stat label="Total budget" value={`৳${(plan.totalBudgetMinor / 100).toLocaleString()}`} />
        <Stat label="Horizon" value={`${plan.horizonDays} days`} />
        <Stat label="Tasks" value={plan.tasks.length.toString()} />
      </div>

      {plan.disabledCategories.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            You handle these yourself
          </p>
          <div className="flex flex-wrap gap-1">
            {plan.disabledCategories.map((c) => (
              <Badge key={c} variant="muted">
                {DISABLED_OPTIONS.find((o) => o.id === c)?.label ?? c}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {plan.redistributionNotes.length > 0 && (
        <Alert variant="info">
          <AlertTitle>Budget redistribution</AlertTitle>
          <AlertDescription>
            <ul className="space-y-1 mt-1">
              {plan.redistributionNotes.map((n, i) => (
                <li key={i} className="text-sm">
                  · {n}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Separator />

      <div className="space-y-5">
        {plan.weeks.map((w) => {
          const wTasks = tasksByWeek.get(w.weekIndex) ?? [];
          return (
            <div key={w.weekIndex}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary font-semibold">
                    Week {w.weekIndex} · {new Date(w.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-sm font-medium text-foreground">{w.theme}</p>
                </div>
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Check: {w.kpiToCheck}
                </span>
              </div>
              {wTasks.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic ml-4">Nothing scheduled this week.</p>
              ) : (
                <ol className="space-y-1.5">
                  {wTasks
                    .slice()
                    .sort((a, b) => (a.date < b.date ? -1 : 1))
                    .map((t, i) => {
                      const meta = CATEGORY_META[t.category];
                      const Icon = meta.icon;
                      return (
                        <li
                          key={i}
                          className="flex items-start gap-3 border border-border bg-card px-3 py-2"
                        >
                          <div className="flex flex-col items-center w-14 flex-shrink-0">
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                              {new Date(t.date).toLocaleDateString(undefined, { weekday: 'short' })}
                            </span>
                            <span className="text-sm font-mono font-semibold text-foreground">
                              {new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            {t.hour !== null && (
                              <span className="text-[10px] text-muted-foreground font-mono inline-flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {String(t.hour).padStart(2, '0')}:00
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-wider', meta.className)}>
                                <Icon className="h-3 w-3" />
                                {meta.label}
                              </span>
                              <span className="text-sm font-medium text-foreground">{t.title}</span>
                              {t.requiresHuman && (
                                <Badge variant="warning" className="gap-1">
                                  <Users className="h-3 w-3" />
                                  human
                                </Badge>
                              )}
                              <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                                ৳{(t.budgetMinor / 100).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              <span className="text-foreground/70">Rec #{t.recIndex + 1}</span> · {t.rationale}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function PlanBuilderDialog({
  open,
  analysisId,
  onOpenChange,
  onBuilt,
}: {
  open: boolean;
  analysisId: string;
  onOpenChange: (open: boolean) => void;
  onBuilt: (plan: CampaignPlan) => void;
}) {
  const [budget, setBudget] = useState('50000');
  const [horizon, setHorizon] = useState('30');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [disabled, setDisabled] = useState<Set<DisabledCategory>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: DisabledCategory) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    const budgetMinor = Math.round(Number(budget) * 100);
    const horizonDays = Number(horizon);
    if (!Number.isFinite(budgetMinor) || budgetMinor <= 0) {
      setError('Budget must be a positive number');
      return;
    }
    if (!Number.isInteger(horizonDays) || horizonDays < 7 || horizonDays > 365) {
      setError('Horizon must be 7-365 days');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalBudgetMinor: budgetMinor,
          horizonDays,
          startDate,
          disabledCategories: Array.from(disabled),
        }),
      });
      const body = (await res.json()) as { plan?: CampaignPlan; error?: string; message?: string };
      if (!res.ok || body.error || !body.plan) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      onBuilt(body.plan);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Build campaign plan
          </DialogTitle>
          <DialogDescription>
            The AI lays the audit&apos;s recommendations on a calendar, allocates your budget across
            tasks, and reroutes spend when you disable categories you handle yourself. Takes ~30-60s.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget (৳)</Label>
              <Input
                id="budget"
                type="number"
                min="0"
                step="100"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="horizon">Horizon</Label>
              <Select value={horizon} onValueChange={setHorizon}>
                <SelectTrigger id="horizon" disabled={submitting}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="120">120 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start">Start</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <Label>I handle these myself — redistribute the budget</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {DISABLED_OPTIONS.map((o) => {
                const active = disabled.has(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggle(o.id)}
                    disabled={submitting}
                    className={cn(
                      'px-3 py-2 border text-sm text-left transition-colors',
                      active
                        ? 'bg-primary/15 border-primary text-primary'
                        : 'bg-card border-border text-muted-foreground hover:border-primary hover:text-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="font-mono break-all text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Planning
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Build plan
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
