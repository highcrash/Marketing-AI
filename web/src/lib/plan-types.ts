/// Client-side mirrors of the CampaignPlan + PlanTask shapes the API
/// returns. Lives here (not in lib/ai/plan.ts) so client components can
/// import the types without dragging the @anthropic-ai/sdk dependency
/// chain into the browser bundle.

export type DisabledCategory =
  | 'video-production'
  | 'photography'
  | 'physical-campaigns'
  | 'influencer-coordination'
  | 'creative-asset-production'
  | 'offline-promotions';

export type PlanTaskCategory =
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

export interface PlanWeekSummary {
  weekIndex: number;
  startDate: string;
  theme: string;
  kpiToCheck: string;
}

export interface PlanTask {
  recIndex: number;
  title: string;
  date: string;
  hour: number | null;
  budgetMinor: number;
  category: PlanTaskCategory;
  requiresHuman: boolean;
  rationale: string;
}

export interface CampaignPlan {
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
