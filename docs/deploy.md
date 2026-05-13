# Deploy Marketing AI to Vercel + Postgres

The platform is single-user, single-tenant, and ready for a real host as of commits `db23c99` (auth) and `0d3a891` (cron). This walkthrough takes a fresh checkout and gets it live.

## Stack

- **Host:** Vercel (Hobby tier is enough for a single user; Pro if you want minute-level cron)
- **DB:** Neon Postgres (free tier is fine for the local-business volumes we see — single Business row, one Analysis row per audit, hundreds of CampaignDraft rows over a year)
- **Cron:** Vercel Cron Jobs (built-in; configured via `vercel.json`)
- **AI:** Anthropic API key
- **External data:** your Restora `/v1/external/*` API key

Total cost: ~$0–5/month before AI usage. AI usage scales with audits ($1 per audit + ~$0.30–0.50 per draft).

## One-time: switch Prisma to Postgres

The repo ships with SQLite migrations for dev simplicity. To deploy you need Postgres-compatible migrations.

```bash
cd web

# 1. Switch the provider
# Edit prisma/schema.prisma — change:
#     provider = "sqlite"
# to:
#     provider = "postgresql"

# 2. Drop the old (SQLite) migrations
rm -rf prisma/migrations

# 3. Set DATABASE_URL to your Neon connection string in .env.local:
#     DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
# Important: use a POOLED url for runtime, and a DIRECT url for migrations.
# Neon provides both — keep them in DATABASE_URL_UNPOOLED if needed.

# 4. Create a fresh init migration against Postgres
pnpm prisma migrate dev --name init

# 5. Commit the new migrations directory
git add prisma/schema.prisma prisma/migrations
git commit -m "chore(prisma): switch to Postgres for production"
git push
```

The schema is provider-agnostic except for the `String[]` array on `User`-less tables (which Postgres handles natively but SQLite serialised differently). After this switch, dev locally also uses Postgres — that's fine, or use two `.env` files and switch.

## Vercel project setup

1. Sign in to [vercel.com](https://vercel.com), click **Add New** → **Project** → import `highcrash/Marketing-AI`.
2. **Root Directory:** `web`
3. **Framework Preset:** Next.js (auto-detected)
4. **Build Command:** leave as `pnpm build` (the `prebuild` script auto-runs `prisma generate`)
5. **Install Command:** `pnpm install`
6. Don't deploy yet — add env vars first.

## Required env vars (Vercel → Project → Settings → Environment Variables)

```
DATABASE_URL              postgresql://...   (Neon pooled URL)
DATABASE_URL_UNPOOLED     postgresql://...   (Neon direct URL, for migrations only — optional)

AUTH_SECRET               (openssl rand -base64 32)
NEXTAUTH_URL              https://your-deploy.vercel.app  (only needed pre-1.0 of Auth.js)

ANTHROPIC_API_KEY         sk-ant-api03-...
ANTHROPIC_MODEL           claude-opus-4-7   (or sonnet to cut cost ~10x)

RESTORA_API_BASE          https://api.eatrobd.com/api/v1/external
RESTORA_API_KEY           rk_<prefix>_<secret>

SCHEDULER_MODE            cron
CRON_SECRET               (openssl rand -base64 32 — Vercel will sign cron requests with this)

# Optional — Anthropic price overrides for the spend estimator:
ANTHROPIC_INPUT_USD_PER_M     15
ANTHROPIC_OUTPUT_USD_PER_M    75
ANTHROPIC_CACHE_WRITE_USD_PER_M  18.75
ANTHROPIC_CACHE_READ_USD_PER_M   1.5
```

## Cron config

`web/vercel.json` is already in the repo:

```json
{
  "crons": [
    { "path": "/api/cron/scheduler-tick", "schedule": "*/1 * * * *" }
  ]
}
```

This fires the scheduler every minute. **On Vercel Hobby**, cron is limited to once per day. Either upgrade to Pro, or relax the schedule to `0 * * * *` (hourly) and accept that scheduled sends can fire up to an hour late.

## Deploy

```bash
git push origin main   # triggers Vercel
```

Or use the dashboard's Deploy button. First build takes 2–3 minutes.

## Post-deploy: create the owner account

Visit `https://your-deploy.vercel.app/register`. Fill in email + password. The first registration succeeds; the route is locked thereafter (single-user lockdown).

After that:
- `/` → dashboard (gated by login)
- `/login` → sign in
- `/register` → 403 closed

## Verifying cron is wired

```bash
# Health probe — no auth required, returns mode + secret presence
curl https://your-deploy.vercel.app/api/cron/scheduler-tick
# → { "ok": true, "mode": "cron", "hasCronSecret": true }

# Real tick — auth required (this is what Vercel Cron does)
curl -X POST https://your-deploy.vercel.app/api/cron/scheduler-tick \
  -H "Authorization: Bearer $CRON_SECRET"
# → { "fired": 0, "failed": 0, "skipped": 0 }
```

Vercel shows cron history under Project → Crons. Failures show up there too.

## Things to know

- **Multi-user is NOT supported.** The first user owns everything. Future Phase 1.F can lift this; for now don't share credentials.
- **The Business row is still env-bootstrapped.** Marketing AI gets its Restora connection from `RESTORA_API_BASE` + `RESTORA_API_KEY`. To connect a second business you'd need Phase 1.D (per-business onboarding form).
- **Restora must be deployed too.** The Marketing AI calls `RESTORA_API_BASE/business/*`; that URL must be reachable from Vercel.
- **Cron timezone.** Vercel Cron runs in UTC. Recurring schedules store their own timezone; the scheduler converts. But the cron heartbeat itself is UTC.
- **Cold starts.** A Vercel function that hasn't been hit in a while takes 1–2s to wake up. The first scheduled send after a quiet period might land 1–2 minutes late. Acceptable for marketing sends.

## Rollback

Vercel keeps every deploy. Project → Deployments → click an older deploy → **Promote to Production**. The DB is shared so this only rolls back code, not data.
