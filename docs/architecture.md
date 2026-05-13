# Architecture (Phase 1)

## Goal

Read-only AI marketing audit. Given a business that exposes the Restora `/v1/external/*` contract, fetch a comprehensive data snapshot, send it to Claude with curated marketing skills as system context, and produce structured recommendations the user can review and act on.

## Stack

- **Framework:** Next.js 16 (App Router, src/ dir)
- **Runtime:** Node.js 20+
- **AI:** Anthropic Messages API (`@anthropic-ai/sdk`) with prompt caching on skills + system prompt
- **Skills:** `coreyhaines31/marketingskills` as a git submodule at `../skills/`, loaded as system context per analysis run
- **Styling:** Tailwind CSS 4
- **No DB yet** in Phase 1.A — CLI script runs ad-hoc. Persistence (recommendations, drafts, business connections) is Phase 1.B.

## Phase 1.A — CLI analysis loop (no UI, no DB)

```
┌─ scripts/analyze.ts ─────────────────────────────────────────┐
│                                                              │
│  1. Load env (RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC)  │
│  2. RestoraClient → fetch business snapshot (parallel):      │
│       profile, sales/daily(90), top-items, by-category,      │
│       performance, customers, loyalty/summary,               │
│       finance/expenses, reviews                              │
│  3. SkillLoader → read SKILL.md files from ../skills/skills/ │
│       Pick a subset by name (paid-ads, copywriting,          │
│       email-sequence, customer-research, marketing-          │
│       psychology) — full skill text goes into system msg     │
│  4. Anthropic.messages.create()                              │
│       - system: [prompt + skills (cached)]                   │
│       - user: structured JSON business snapshot              │
│       - max_tokens: ~8000                                    │
│       - tool_use: optional structured output schema          │
│  5. Parse → print Recommendation[] grouped by category       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The CLI exists to validate the AI pipeline before any UI work. It is callable as `pnpm tsx scripts/analyze.ts` from `web/`.

## Phase 1.B — UI + persistence (next)

- Prisma + SQLite (or Postgres later) for `Business`, `Analysis`, `Recommendation`, `CampaignDraft`
- NextAuth (single-tenant, email/password)
- Routes:
  - `/businesses` — list + onboarding (URL + API key)
  - `/businesses/[id]` — dashboard with latest analysis + run button
  - `/businesses/[id]/recommendations/[recId]` — detail + draft generation
- API routes:
  - `POST /api/businesses/[id]/analyze` — kicks off an analysis run
  - `POST /api/businesses/[id]/drafts` — Claude generates content for a recommendation

## Phase 2+ (deferred)

- Facebook Pages connector (Meta App Review required)
- Calendar / scheduling
- Multi-tenant (if going SaaS)
- Ad-spend automation with budget caps
- Migration to Claude Agent SDK when manual approval becomes the bottleneck

## Data contract

We consume Restora's contract exactly as documented in `restora-pos/docs/external-api/`. Money fields are in minor units (paisa for BDT) — read `meta.currency` before formatting. Branch scoping is bound to the API key; we never pass `branchId` on the wire.

If we add a second consumer source later (a non-Restora business), it must conform to the same contract — same endpoints, same envelope shape, same scope vocabulary. That's the whole point of the contract.
