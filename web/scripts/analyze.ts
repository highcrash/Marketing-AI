/**
 * CLI entry point for the marketing analysis pipeline.
 *
 * Reads RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC_API_KEY from .env,
 * pulls the business snapshot, runs the analysis, and prints recommendations
 * to stdout. No DB, no UI — just the loop end-to-end.
 *
 * Run:  pnpm tsx scripts/analyze.ts
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { RestoraClient } from '../src/lib/restora-client.js';
import { runAnalysis, type Recommendation } from '../src/lib/ai/analyze.js';

// Tiny .env loader — avoids dragging in dotenv. We only need it in the CLI;
// Next.js loads .env automatically for the server side.
async function loadDotEnv() {
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  const raw = await readFile(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

const EnvSchema = z.object({
  RESTORA_API_BASE: z.string().url(),
  RESTORA_API_KEY: z.string().regex(/^rk_[0-9a-f]{8}_[A-Za-z0-9_-]+$/, {
    message: 'RESTORA_API_KEY must be in format rk_<8hex>_<secret>',
  }),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-7'),
});

function priorityRank(p: Recommendation['priority']): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2;
}

function fmtCategoryHeader(category: string): string {
  const label = category.replace(/-/g, ' ').toUpperCase();
  return `\n━━━ ${label} ━━━`;
}

function fmtPriority(p: Recommendation['priority']): string {
  if (p === 'high') return '[HIGH]    ';
  if (p === 'medium') return '[MEDIUM]  ';
  return '[LOW]     ';
}

async function main() {
  await loadDotEnv();
  const env = EnvSchema.parse(process.env);

  const restora = new RestoraClient(env.RESTORA_API_BASE, env.RESTORA_API_KEY);
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const t0 = Date.now();
  process.stdout.write(`Connecting to ${env.RESTORA_API_BASE} …\n`);

  const result = await runAnalysis(restora, anthropic, { model: env.ANTHROPIC_MODEL });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const grouped: Record<string, Recommendation[]> = {};
  for (const rec of result.recommendations) {
    (grouped[rec.category] ??= []).push(rec);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }

  // ── Print ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(78)}`);
  console.log(`MARKETING AUDIT  —  ${result.business.name}`);
  console.log(`Generated: ${result.generatedAt}  ·  Model: ${result.model}  ·  ${elapsed}s`);
  console.log(
    `Tokens: in=${result.inputTokens} (cache: read=${result.cacheReadTokens}, write=${result.cacheWriteTokens}) out=${result.outputTokens}`,
  );
  console.log('═'.repeat(78));

  console.log('\nEXECUTIVE SUMMARY');
  console.log('─'.repeat(78));
  console.log(result.summary);

  console.log('\nINFERRED GOALS');
  console.log('─'.repeat(78));
  for (const goal of result.inferredGoals) console.log(`• ${goal}`);

  console.log('\nRECOMMENDATIONS');
  for (const [category, recs] of Object.entries(grouped)) {
    console.log(fmtCategoryHeader(category));
    for (const rec of recs) {
      console.log(`\n${fmtPriority(rec.priority)}${rec.title}`);
      console.log(`  Why: ${rec.rationale}`);
      console.log(`  Impact: ${rec.expectedImpact}`);
      if (rec.estimatedBudgetBdt != null) {
        console.log(`  Budget: ৳${rec.estimatedBudgetBdt.toLocaleString()}/month`);
      }
      console.log('  Actions this week:');
      for (const a of rec.firstActionsThisWeek) console.log(`    - ${a}`);
      if (rec.requiresHumanForExecution) {
        console.log('  ⚠ Requires human creative work (photo / video / in-store).');
      }
      if (rec.relatedSkills.length > 0) {
        console.log(`  Skills: ${rec.relatedSkills.join(', ')}`);
      }
    }
  }

  console.log(`\n${'═'.repeat(78)}\n`);
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(`\nFATAL: ${err.message}`);
    if (process.env.DEBUG && err.stack) console.error(err.stack);
  } else {
    console.error('FATAL:', err);
  }
  process.exit(1);
});
