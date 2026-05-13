# Marketing AI

AI marketing agent platform. Connects to any business via a documented HTTP endpoint contract and uses Claude + a curated skill library to generate marketing audits, content drafts, and (eventually) automated campaigns.

First consumer: Restora POS via the `/v1/external/*` surface. Future consumers connect by exposing the same JSON contract.

## Layout

```
D:\Marketing AI\
├── web/         # Next.js 16 app (App Router) — UI, API routes, Prisma
├── skills/      # marketingskills (git submodule, pinned)
├── docs/        # Architecture + data contract
└── .env         # RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC_API_KEY
```

## Status

Full Phase 1 + much of Phase 2 shipped: audit → draft → refine → approve → SMS send (single + segment) → scheduled (one-off + weekly recurring) → activity feed → monthly stats → auth gate → Vercel-cron-ready.

See [docs/architecture.md](docs/architecture.md) for the original plan and [docs/deploy.md](docs/deploy.md) for the production deployment walkthrough.

## Local dev

```bash
# 1. Clone with submodules
git clone --recurse-submodules <repo-url>
# (or, in an existing checkout)
git submodule update --init --recursive

# 2. Set up env
cp web/.env.example web/.env
# Fill in: RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC_API_KEY

# 3. Install + run
cd web && pnpm install && pnpm dev
```

## Running the analysis CLI (no UI required)

```bash
cd web
pnpm tsx scripts/analyze.ts
```

This pulls a business-data snapshot from `RESTORA_API_BASE`, loads relevant marketing skills, sends to Claude, and prints structured recommendations. Validates the whole loop before any UI work.
