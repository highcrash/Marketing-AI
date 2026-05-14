/**
 * Marketing analysis pipeline.
 *
 * 1. Pulls a comprehensive business snapshot from the Restora external API.
 * 2. Loads relevant marketing skills as cached system context.
 * 3. Calls Claude with a strict tool-use schema so the output is structured.
 * 4. Returns a typed Recommendation[] grouped by category.
 *
 * Prompt caching pinned on the long static parts (skills + system prompt).
 * Fresh data goes into the user message so each run pays only for the
 * variable bit.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RestoraClient } from '../restora-client';
import { DEFAULT_AUDIT_SKILLS, loadSkillsBySlug, type Skill } from './skills';

export interface AnalysisOptions {
  model?: string;
  /** Override the default skill set. */
  skills?: readonly string[];
  /** Limit the days of sales history pulled. Default 90. */
  salesWindowDays?: number;
  /// Owner-set marketing goals. When `tags` is non-empty Claude is told
  /// to bias recommendations toward those goals; when both are empty the
  /// model falls back to inferring goals from the data (current
  /// behaviour). Free-text `notes` lets the owner attach context the
  /// audit data alone can't surface (planned launches, seasonal context,
  /// "we're price-sensitive about ad spend", etc.).
  goalTags?: readonly string[];
  goalNotes?: string | null;
}

export interface Recommendation {
  category:
    | 'acquisition'
    | 'retention'
    | 'pricing'
    | 'product-mix'
    | 'channel-strategy'
    | 'content'
    | 'operations'
    | 'brand';
  title: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  expectedImpact: string;
  firstActionsThisWeek: string[];
  requiresHumanForExecution: boolean;
  estimatedBudgetBdt: number | null;
  relatedSkills: string[];
}

export interface AnalysisResult {
  business: {
    name: string;
    currency: string;
    timezone: string;
  };
  generatedAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Tokens read from the prompt cache on this run (warm hits). 0 on first run. */
  cacheReadTokens: number;
  /** Tokens this run WROTE into the cache for future runs (cold). 0 if no caching this turn. */
  cacheWriteTokens: number;
  recommendations: Recommendation[];
  /** Free-text exec summary the model writes before listing recommendations. */
  summary: string;
  /** What the model judged about the business when no goals were specified. */
  inferredGoals: string[];
}

const RECOMMENDATION_TOOL = {
  name: 'submit_marketing_audit',
  description:
    'Submit the final marketing audit. Call this exactly once with a concise summary, the goals you inferred from the data, and a prioritized list of recommendations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description:
          '2-4 sentence executive summary of what the data tells you about this business right now.',
      },
      inferredGoals: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Goals you inferred from the data (e.g. "increase repeat-visit rate among the 700+ inactive customer base"). 1-4 items.',
      },
      recommendations: {
        type: 'array',
        minItems: 3,
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [
                'acquisition',
                'retention',
                'pricing',
                'product-mix',
                'channel-strategy',
                'content',
                'operations',
                'brand',
              ],
            },
            title: { type: 'string', description: 'Imperative-mood headline, under 80 chars.' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            rationale: {
              type: 'string',
              description:
                'Why this matters. MUST cite specific numbers from the provided snapshot.',
            },
            expectedImpact: {
              type: 'string',
              description:
                'What outcome you expect if this is executed well. Be concrete (e.g. "+15% repeat-visit rate within 60 days") not vague ("more sales").',
            },
            firstActionsThisWeek: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 6,
              description:
                'Concrete actions the user can start this week. Phrased as imperatives.',
            },
            requiresHumanForExecution: {
              type: 'boolean',
              description:
                'True if execution needs human creative work (photography, video, in-store ops) that the AI cannot do alone.',
            },
            estimatedBudgetBdt: {
              type: ['number', 'null'],
              description:
                'Rough monthly budget in BDT (taka, whole number). Null if not a budget-driven action.',
            },
            relatedSkills: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Slugs from the loaded skill library that are most relevant to executing this recommendation.',
            },
          },
          required: [
            'category',
            'title',
            'priority',
            'rationale',
            'expectedImpact',
            'firstActionsThisWeek',
            'requiresHumanForExecution',
            'relatedSkills',
          ],
        },
      },
    },
    required: ['summary', 'inferredGoals', 'recommendations'],
  },
};

const SYSTEM_PROMPT = `You are a senior marketing strategist with 15 years running performance marketing for restaurants and food businesses. You are auditing a real business based on JSON data pulled from its point-of-sale system.

Your job: produce a brutally honest, numerically grounded marketing audit. Every recommendation must cite specific numbers from the data the user provides. No generic "you should run ads" — say what numbers in the data led you to that recommendation, and what concrete outcome to expect.

Constraints on every recommendation:
1. Cite at least one specific number from the data in the rationale.
2. Expected impact must be concrete (a metric, a delta, a timeframe), not vague.
3. First actions this week must be doable by a single owner-operator in a normal work week.
4. If executing the recommendation requires human creative production (video shoots, photography, in-store campaigns, influencer coordination), set requiresHumanForExecution: true.
5. If the business is in Bangladesh (timezone Asia/Dhaka, currency BDT), prioritize channels that work in that market: Facebook Pages, SMS, in-store loyalty, WhatsApp. Lower priority on email and TikTok in BD market.

The following marketing skill playbooks are attached as your reference library. Each contains specific tactics, frameworks, and questions for its domain. Use them as the basis for your recommendations — when a recommendation falls into a skill's domain, cite the skill in relatedSkills and let its frameworks shape your advice.

When you have completed the audit, call the submit_marketing_audit tool. Call it exactly once. Do not output any text outside the tool call.`;

function skillSystemBlock(skill: Skill): string {
  return `--- SKILL: ${skill.slug} (${skill.frontmatter.name}) ---
${skill.frontmatter.description}

${skill.body}
--- END SKILL: ${skill.slug} ---`;
}

interface BusinessSnapshot {
  profile: unknown;
  salesDaily: unknown;
  salesSummary: unknown;
  topItems: unknown;
  revenueByCategory: unknown;
  performance: unknown;
  customers: unknown;
  loyalty: unknown;
  reviews: unknown;
  marketingCampaigns: unknown;
  expensesRecent: unknown;
}

async function fetchSnapshot(
  client: RestoraClient,
  salesWindowDays: number,
): Promise<{ snapshot: BusinessSnapshot; profileMeta: { currency: string; timezone: string; name: string } }> {
  const [
    profile,
    salesDaily,
    salesSummary,
    topItems,
    revenueByCategory,
    performance,
    customers,
    loyalty,
    reviews,
    marketingCampaigns,
    expensesRecent,
  ] = await Promise.all([
    client.getProfile(),
    client.getDailySales(salesWindowDays),
    client.getSalesSummary('month'),
    client.getTopItems('month', 10),
    client.getRevenueByCategory('month'),
    client.getPerformance(),
    client.getCustomers(),
    client.getLoyaltySummary(),
    client.getReviews(),
    client.getMarketingCampaigns(),
    client.getExpenses(),
  ]);

  return {
    snapshot: {
      profile: profile.data,
      salesDaily: salesDaily.data,
      salesSummary: salesSummary.data,
      topItems: topItems.data,
      revenueByCategory: revenueByCategory.data,
      performance: performance.data,
      customers: customers.data,
      loyalty: loyalty.data,
      reviews: reviews.data,
      marketingCampaigns: marketingCampaigns.data,
      expensesRecent: expensesRecent.data,
    },
    profileMeta: {
      currency: profile.meta.currency,
      timezone: profile.meta.timezone,
      name: profile.data.name,
    },
  };
}

export async function runAnalysis(
  restora: RestoraClient,
  anthropic: Anthropic,
  options: AnalysisOptions = {},
): Promise<AnalysisResult> {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';
  const salesWindowDays = options.salesWindowDays ?? 90;
  const skillSlugs = options.skills ?? DEFAULT_AUDIT_SKILLS;

  const [{ snapshot, profileMeta }, skills] = await Promise.all([
    fetchSnapshot(restora, salesWindowDays),
    loadSkillsBySlug(skillSlugs),
  ]);

  const skillsText = skills.map(skillSystemBlock).join('\n\n');

  const goalTags = (options.goalTags ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0);
  const goalNotes = options.goalNotes?.trim() ?? '';
  const ownerGoalsBlock =
    goalTags.length > 0 || goalNotes.length > 0
      ? `
OWNER-SET GOALS — bias your recommendations toward these. inferredGoals in your output should reflect these (you may rewrite them more specifically), not invent unrelated ones.
${goalTags.length > 0 ? `Selected goal tags: ${goalTags.join(', ')}` : ''}${
          goalNotes.length > 0 ? `\nOwner notes: ${goalNotes}` : ''
        }
`
      : '';

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    tools: [RECOMMENDATION_TOOL],
    tool_choice: { type: 'tool', name: RECOMMENDATION_TOOL.name },
    system: [
      { type: 'text', text: SYSTEM_PROMPT },
      // Skills block goes second so cache_control on it covers most of the
      // static system context. The prompt above is small enough that we
      // don't need a separate cache control for it.
      {
        type: 'text',
        text: skillsText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Audit this business's marketing position. The JSON below is the full data snapshot from their POS. Money fields are in MINOR UNITS (paisa for BDT — divide by 100 for taka).

Sales window: last ${salesWindowDays} days.
${ownerGoalsBlock}
\`\`\`json
${JSON.stringify(snapshot, null, 2)}
\`\`\`

Produce the audit by calling the submit_marketing_audit tool. Cite specific numbers from this snapshot in every recommendation rationale.`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(
      `Claude did not call the audit tool. Response content: ${JSON.stringify(response.content).slice(0, 400)}`,
    );
  }

  const input = toolUse.input as {
    summary: string;
    inferredGoals: string[];
    recommendations: Recommendation[];
  };

  return {
    business: profileMeta,
    generatedAt: new Date().toISOString(),
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens:
      (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    cacheWriteTokens:
      (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
    recommendations: input.recommendations,
    summary: input.summary,
    inferredGoals: input.inferredGoals,
  };
}
