/**
 * Campaign draft pipeline. Given a recommendation from a saved Analysis,
 * load the skills mentioned in rec.relatedSkills and ask Claude to turn
 * the recommendation into a concrete, ready-to-execute campaign — actual
 * copy, schedule, budget, KPIs.
 *
 * Cheaper than the audit (no full snapshot, narrower skill set, shorter
 * output). Budgets at ~$0.30–0.50 per draft on Opus 4.7.
 */

import Anthropic from '@anthropic-ai/sdk';

import type { AnalysisResult, Recommendation } from './analyze';
import { loadSkillsBySlug, type Skill } from './skills';

export interface DraftOptions {
  model?: string;
  /// When refining an existing draft, the previous draft's payload + the
  /// user's free-text feedback. The system prompt switches into "iterate
  /// on this prior draft" mode.
  refinement?: {
    previous: CampaignDraftPayload;
    feedback: string;
  };
}

export type AssetType =
  | 'sms'
  | 'social-post'
  | 'paid-ad-copy'
  | 'email-body'
  | 'in-store-card'
  | 'visual-brief'
  | 'video-brief'
  | 'menu-change'
  | 'process-change';

export type CampaignType =
  | 'sms-blast'
  | 'paid-ads'
  | 'organic-social'
  | 'email-sequence'
  | 'in-store-promo'
  | 'referral-program'
  | 'loyalty-change'
  | 'menu-or-pricing'
  | 'operations'
  | 'other';

export interface DraftPiece {
  channel: string;
  assetType: AssetType;
  title: string;
  content: string;
  notes: string | null;
}

export interface BudgetLine {
  item: string;
  amountBdt: number;
}

export interface CampaignDraftPayload {
  title: string;
  campaignType: CampaignType;
  channels: string[];
  launchTimeline: string;
  pieces: DraftPiece[];
  budgetBdt: number | null;
  budgetBreakdown: BudgetLine[] | null;
  kpis: string[];
  executionChecklist: string[];
  warnings: string[];
}

export interface DraftResult {
  payload: CampaignDraftPayload;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const DRAFT_TOOL = {
  name: 'submit_campaign_draft',
  description:
    'Submit the executable campaign draft for the recommendation. Call exactly once. The user will copy-paste your `pieces[].content` directly into Facebook / SMS / Foodpanda / etc., so write the literal copy, not a summary of what to write.',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Campaign name. Under 60 chars.' },
      campaignType: {
        type: 'string',
        enum: [
          'sms-blast',
          'paid-ads',
          'organic-social',
          'email-sequence',
          'in-store-promo',
          'referral-program',
          'loyalty-change',
          'menu-or-pricing',
          'operations',
          'other',
        ],
      },
      channels: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Platforms / channels this campaign runs on. Lowercase tokens like 'sms', 'facebook', 'instagram', 'foodpanda', 'in-store'.",
      },
      launchTimeline: {
        type: 'string',
        description:
          "Free-text 'when'. Examples: 'Launch Monday, run 14 days', 'Soft-launch Wed for 1 week then full launch the following Mon', 'Ongoing'.",
      },
      pieces: {
        type: 'array',
        minItems: 1,
        maxItems: 12,
        description:
          'Each piece is one ready-to-use deliverable: a literal SMS body, a literal FB post, a literal ad-copy variant, an email body, an in-store card, or a brief for human creative (visual-brief, video-brief).',
        items: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Which channel this piece is for.' },
            assetType: {
              type: 'string',
              enum: [
                'sms',
                'social-post',
                'paid-ad-copy',
                'email-body',
                'in-store-card',
                'visual-brief',
                'video-brief',
                'menu-change',
                'process-change',
              ],
            },
            title: {
              type: 'string',
              description:
                'Short label for this piece, e.g. "SMS to inactive customers (variant A)" or "FB feed post — opening week".',
            },
            content: {
              type: 'string',
              description:
                'The LITERAL deliverable. For SMS / social posts / emails / ad copy: the exact text to paste. For visual/video briefs: a tight production brief (shots, format, vibe, length, deliverable size). Be specific.',
            },
            notes: {
              type: ['string', 'null'],
              description:
                'Optional notes for the human (character limits, A/B variant role, regulatory/brand notes). Null if not needed.',
            },
          },
          required: ['channel', 'assetType', 'title', 'content'],
        },
      },
      budgetBdt: {
        type: ['number', 'null'],
        description: 'Total recommended budget in BDT taka (whole number). Null if not budget-driven.',
      },
      budgetBreakdown: {
        type: ['array', 'null'],
        description: 'Optional line-item breakdown summing to budgetBdt. Null if no spending or trivial.',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string' },
            amountBdt: { type: 'number' },
          },
          required: ['item', 'amountBdt'],
        },
      },
      kpis: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 6,
        description:
          'Metrics to watch with a concrete target and where to read it. Example: "Coupon redemption rate ≥ 12% — read from /reports/coupons after week 1".',
      },
      executionChecklist: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 12,
        description:
          'Ordered tasks the operator does THIS WEEK to launch. Imperative, specific, time-boxed where possible.',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Things to watch for: brand/regulatory issues, cannibalisation risk, dependency on creative work the AI can't produce, etc. Empty array if none.",
      },
    },
    required: [
      'title',
      'campaignType',
      'channels',
      'launchTimeline',
      'pieces',
      'kpis',
      'executionChecklist',
      'warnings',
    ],
  },
};

const SYSTEM_PROMPT_REFINE_SUFFIX = `\n\nIMPORTANT — this call is a REFINEMENT of a previous draft you wrote. The user is iterating, not starting over. The previous draft and the user's feedback are in the user message. You MUST:
- Keep what the user implicitly endorsed by not commenting on it.
- Apply the feedback literally — if the user asks for a Bengali variant, produce a Bengali piece; if they want a shorter SMS, shorten it.
- Output a COMPLETE draft, not a diff. Every piece the user is keeping must reappear in your output (you can tweak it if the feedback implies it should change).
- Don't dilute earlier strong choices "just to look like you changed things" — only change what the feedback (or its clear implications) demands.`;

const SYSTEM_PROMPT = `You are the same marketing strategist who wrote the audit being shown to you. The user has picked ONE of your recommendations and asked you to turn it into a real campaign they can launch this week.

Your output will be copy-pasted into Facebook, SMS, Foodpanda, in-store cards, and email tools. So:

- Write the LITERAL copy, not "draft an SMS that says…". The user will copy your text verbatim.
- RESOLVE EVERY TEMPLATE PLACEHOLDER. The user message states today's date. When you reference a future expiry, validity window, or deadline, write the actual ISO date or human-readable date — never write [DATE+14], {{date}}, [EXPIRES], or any other unresolved token. These ship as literal text and embarrass the brand.
- Match the local context: this is a Bangladesh business. Use BDT, taka symbol where appropriate. SMS is the highest-ROI channel — produce SMS variants when the rec touches retention or reactivation. Facebook works well; TikTok and email less so in BD market.
- Multiple variants per channel are good — A/B variants for SMS, two FB post angles, three ad-copy hooks.
- If the rec requires human creative (photo / video / in-store production), produce a tight production brief as a piece with assetType: visual-brief or video-brief. Brief should list shots, vibe, format, deliverable spec.
- Numbers in the audit are the source of truth. If you cite an audience size or current metric, it must match the audit.
- Don't pad. Don't add a "Conclusion" or "Disclaimer". Every piece earns its place.

The following marketing skill playbooks are attached as your reference library — the ones most relevant to this recommendation. Use them as the basis for tactics, copy patterns, and KPI choices.

When the draft is ready, call submit_campaign_draft exactly once. Do not output text outside the tool call.`;

function skillSystemBlock(skill: Skill): string {
  return `--- SKILL: ${skill.slug} (${skill.frontmatter.name}) ---
${skill.frontmatter.description}

${skill.body}
--- END SKILL: ${skill.slug} ---`;
}

/// Default skill set to load when a recommendation has no relatedSkills.
/// These cover the most common drafting needs (copy + CRO basics).
const FALLBACK_DRAFT_SKILLS = ['copywriting', 'marketing-psychology'] as const;

export async function runDraftGeneration(
  anthropic: Anthropic,
  audit: AnalysisResult,
  rec: Recommendation,
  options: DraftOptions = {},
): Promise<DraftResult> {
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';

  const slugs = rec.relatedSkills.length > 0 ? rec.relatedSkills : FALLBACK_DRAFT_SKILLS;
  const skills = await loadSkillsBySlug(slugs);
  const skillsText = skills.map(skillSystemBlock).join('\n\n');

  // Minimal business context — enough to ground the copy without paying
  // for the full snapshot a second time. The audit summary captures the
  // numerical state already. Today's date is included so the model can
  // resolve "expires in 14 days" / "valid till X" into absolute dates
  // rather than emitting [DATE+14] template placeholders.
  const today = new Date().toISOString().slice(0, 10);
  const baseContext = `Business: ${audit.business.name}
Currency: ${audit.business.currency}  ·  Timezone: ${audit.business.timezone}
Today: ${today}  (use this when resolving expiry / validity dates into absolute dates)

Audit summary (your earlier work):
"""
${audit.summary}
"""

Inferred goals from the audit:
${audit.inferredGoals.map((g) => `- ${g}`).join('\n')}

Recommendation to draft (you wrote this — priority: ${rec.priority}):
"""
${rec.title}

Why: ${rec.rationale}

Expected impact: ${rec.expectedImpact}
${rec.estimatedBudgetBdt != null ? `Suggested budget: ৳${rec.estimatedBudgetBdt.toLocaleString()}/month` : ''}

First actions this week (your own list):
${rec.firstActionsThisWeek.map((a) => `- ${a}`).join('\n')}

Requires human creative: ${rec.requiresHumanForExecution ? 'yes' : 'no'}
"""`;

  const userMessage = options.refinement
    ? `${baseContext}

You previously drafted this campaign:
\`\`\`json
${JSON.stringify(options.refinement.previous, null, 2)}
\`\`\`

The user reviewed it and gave you this feedback:
"""
${options.refinement.feedback}
"""

Produce the REFINED draft by calling submit_campaign_draft. Apply the feedback literally. Preserve what wasn't called out unless the feedback's clear implication is that it should change. Output the COMPLETE draft, not a diff.`
    : `${baseContext}

Turn this into an executable campaign by calling submit_campaign_draft. Every piece must be literal, ready-to-paste content (or a tight brief for human creative). Match the timeline and tactics to your audit's data points.`;

  const systemText = options.refinement
    ? `${SYSTEM_PROMPT}${SYSTEM_PROMPT_REFINE_SUFFIX}`
    : SYSTEM_PROMPT;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 5000,
    tools: [DRAFT_TOOL],
    tool_choice: { type: 'tool', name: DRAFT_TOOL.name },
    system: [
      { type: 'text', text: systemText },
      // Skills are the long-static part — cache them so repeat drafts
      // against the same skill set are cheap.
      {
        type: 'text',
        text: skillsText,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(
      `Claude did not call the draft tool. Response content: ${JSON.stringify(response.content).slice(0, 400)}`,
    );
  }

  const payload = toolUse.input as CampaignDraftPayload;

  // Defensive defaults — tool_use validation can't enforce optional fields
  // existing as arrays vs undefined.
  payload.warnings = payload.warnings ?? [];

  return {
    payload,
    model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens:
      (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
    cacheWriteTokens:
      (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
  };
}
