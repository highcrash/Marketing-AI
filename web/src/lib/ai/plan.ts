/**
 * Build a time-bucketed campaign plan from an Analysis.
 *
 * The audit pipeline produces a flat list of Recommendations + a free-
 * text "first actions this week" per rec. This file takes that list,
 * the owner's total budget + planning horizon, and an optional set of
 * disabled task categories (video, photography, influencer, etc.), and
 * asks Claude to lay it all out on a calendar — which rec fires on
 * which day, how the budget redistributes when a task is disabled,
 * what's expected to happen in week 1 vs week 4 vs week 12.
 *
 * Result is a structured CampaignPlan that drives a future calendar
 * view; it's stored on its own model so multiple plans can coexist
 * (different budgets, different horizons, different what-if scenarios).
 */

import Anthropic from '@anthropic-ai/sdk';

import type { AnalysisResult, Recommendation } from './analyze';

export type DisabledCategory =
  | 'video-production'
  | 'photography'
  | 'physical-campaigns'
  | 'influencer-coordination'
  | 'creative-asset-production'
  | 'offline-promotions';

export interface PlanOptions {
  model?: string;
  /// Total budget the owner is willing to deploy across the planning
  /// horizon, in business currency minor units (paisa for BDT).
  totalBudgetMinor: number;
  /// Calendar horizon in days. 30 / 60 / 90 are the typical picks.
  horizonDays: number;
  /// Task categories the owner wants to handle themselves — the AI
  /// reroutes the budget those would've consumed into other levers.
  /// Empty array = AI plans for everything.
  disabledCategories: DisabledCategory[];
  /// Owner-set start date (ISO YYYY-MM-DD). Defaults to today.
  startDate?: string;
}

export interface PlanTask {
  /// Which Analysis.recommendations index this task implements.
  recIndex: number;
  /// Reference back to one of rec.firstActionsThisWeek when applicable.
  /// Free-text otherwise. Imperative phrasing.
  title: string;
  /// 'YYYY-MM-DD' — local calendar day. The scheduler converts to UTC
  /// at fire-time using the business's IANA timezone.
  date: string;
  /// 0-23 hour-of-day in business local time. Null when the task is a
  /// whole-day activity (creative production, designer brief, etc.).
  hour: number | null;
  /// Budget chunk for THIS task in minor units. Sum across all tasks
  /// in the plan equals totalBudgetMinor (within rounding).
  budgetMinor: number;
  /// Channel/asset bucket the task belongs to so the calendar can
  /// colour-code or filter.
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
  /// Will firing this task require human creative work?
  requiresHuman: boolean;
  /// Free-text 1-2 sentence rationale for slotting this task here.
  rationale: string;
}

export interface PlanWeekSummary {
  /// 1-based week number within the horizon.
  weekIndex: number;
  /// 'YYYY-MM-DD'.
  startDate: string;
  /// Short heading for the week (e.g. "Activate inactive customers").
  theme: string;
  /// Concrete KPI the owner should check at end-of-week.
  kpiToCheck: string;
}

export interface CampaignPlan {
  generatedAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalBudgetMinor: number;
  horizonDays: number;
  startDate: string;
  disabledCategories: DisabledCategory[];
  /// One-paragraph exec summary of the plan.
  summary: string;
  /// How the AI redistributed budget when categories were disabled
  /// (empty when nothing was disabled). E.g. "Skipped ৳15k of video
  /// production; reallocated ৳10k to FB photo-post boosting and ৳5k
  /// to SMS-only retention".
  redistributionNotes: string[];
  weeks: PlanWeekSummary[];
  tasks: PlanTask[];
}

const PLAN_TOOL = {
  name: 'submit_campaign_plan',
  description:
    'Submit a fully time-bucketed campaign plan derived from a marketing audit. Lay every concrete task on a calendar day (and time-of-day where useful), allocate the owner-set budget across the tasks, and explain how disabled categories got redistributed.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description: 'One paragraph: what the plan is doing across the horizon and why.',
      },
      redistributionNotes: {
        type: 'array',
        items: { type: 'string' },
        description:
          'When a task category was disabled, explain the budget reallocation in concrete numbers (e.g. "Skipped ৳15k of video production; reallocated ৳10k to FB photo-post boosting and ৳5k to SMS-only retention"). Empty array when nothing was disabled.',
      },
      weeks: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            weekIndex: { type: 'integer', minimum: 1 },
            startDate: { type: 'string', description: 'ISO YYYY-MM-DD' },
            theme: { type: 'string' },
            kpiToCheck: { type: 'string' },
          },
          required: ['weekIndex', 'startDate', 'theme', 'kpiToCheck'],
        },
      },
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: 80,
        items: {
          type: 'object',
          properties: {
            recIndex: { type: 'integer', minimum: 0 },
            title: { type: 'string' },
            date: { type: 'string', description: 'ISO YYYY-MM-DD (business local time)' },
            hour: { type: ['integer', 'null'], minimum: 0, maximum: 23 },
            budgetMinor: { type: 'integer', minimum: 0 },
            category: {
              type: 'string',
              enum: [
                'sms-blast',
                'social-post',
                'paid-ad',
                'in-store',
                'email',
                'video-production',
                'photography',
                'designer-brief',
                'analysis',
                'other',
              ],
            },
            requiresHuman: { type: 'boolean' },
            rationale: { type: 'string' },
          },
          required: ['recIndex', 'title', 'date', 'hour', 'budgetMinor', 'category', 'requiresHuman', 'rationale'],
        },
      },
    },
    required: ['summary', 'redistributionNotes', 'weeks', 'tasks'],
  },
};

const SYSTEM_PROMPT = `You are a marketing operations planner. The user has just received an audit with a list of recommendations and now wants those recommendations laid out as a concrete calendar — which rec fires which day, how the budget splits across tasks, and what gets dropped or downsized when the owner takes some categories off the AI's plate.

Rules:
1. Every task must reference a recIndex from the audit (0-based).
2. Sum of task budgetMinor across the whole plan must equal totalBudgetMinor (within ±1% rounding error).
3. Skip recs whose only sensible execution is a disabled category, OR replace them with a cheaper alternative; either way explain in redistributionNotes.
4. Spread tasks across the horizon — don't pile everything in week 1.
5. Tag the right category honestly. "designer-brief" is for hand-off-to-designer tasks; "photography" is the actual shoot.
6. Hour-of-day matters for SMS (BD restaurants get the best open rates ~11:00-13:00 and 17:00-20:00 local) and social posts; leave hour:null for whole-day creative work.
7. Call submit_campaign_plan once. No prose outside the tool call.`;

export async function runCampaignPlanning(
  anthropic: Anthropic,
  analysis: AnalysisResult,
  options: PlanOptions,
): Promise<CampaignPlan> {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';
  const startDate = options.startDate ?? new Date().toISOString().slice(0, 10);

  const disabledBlock =
    options.disabledCategories.length > 0
      ? `\nThe owner has DISABLED these task categories — do not put any tasks under them, and reallocate the budget they would have used into other levers (explain how in redistributionNotes):\n- ${options.disabledCategories.join('\n- ')}\n`
      : '\nNo task categories are disabled — plan for everything Claude can dispatch.\n';

  // Strip recommendations down to the fields the planner actually needs
  // so the prompt stays compact + cacheable.
  const compactRecs = analysis.recommendations.map((r: Recommendation, i: number) => ({
    recIndex: i,
    category: r.category,
    title: r.title,
    priority: r.priority,
    expectedImpact: r.expectedImpact,
    firstActionsThisWeek: r.firstActionsThisWeek,
    requiresHumanForExecution: r.requiresHumanForExecution,
    estimatedBudgetBdt: r.estimatedBudgetBdt,
    relatedSkills: r.relatedSkills,
  }));

  const userMessage = `Business: ${analysis.business.name}
Timezone: ${analysis.business.timezone}
Currency: ${analysis.business.currency}
Total budget: ${options.totalBudgetMinor} (minor units of ${analysis.business.currency}; divide by 100 for whole units)
Horizon: ${options.horizonDays} days starting ${startDate}
${disabledBlock}
Audit summary:
${analysis.summary}

Recommendations to schedule:
\`\`\`json
${JSON.stringify(compactRecs, null, 2)}
\`\`\`

Inferred goals:
${analysis.inferredGoals.map((g) => `- ${g}`).join('\n')}

${
  analysis.audience
    ? `Audience profile (confidence: ${analysis.audience.confidence}):
- Region: ${analysis.audience.region}, ${analysis.audience.country}
- High-value segments: ${analysis.audience.highValueSegments.join('; ')}
- Behaviour: ${analysis.audience.behaviour.join('; ')}
`
    : ''
}
Call submit_campaign_plan with a fully laid-out calendar.`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    tools: [PLAN_TOOL],
    tool_choice: { type: 'tool', name: PLAN_TOOL.name },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(
      `Claude did not call submit_campaign_plan. Content: ${JSON.stringify(response.content).slice(0, 400)}`,
    );
  }
  const input = toolUse.input as {
    summary: string;
    redistributionNotes: string[];
    weeks: PlanWeekSummary[];
    tasks: PlanTask[];
  };

  return {
    generatedAt: new Date().toISOString(),
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens:
      (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    cacheWriteTokens:
      (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
    totalBudgetMinor: options.totalBudgetMinor,
    horizonDays: options.horizonDays,
    startDate,
    disabledCategories: options.disabledCategories,
    summary: input.summary,
    redistributionNotes: input.redistributionNotes,
    weeks: input.weeks,
    tasks: input.tasks,
  };
}
