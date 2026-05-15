/**
 * Loads SKILL.md files from the marketingskills submodule. Each skill is
 * a markdown doc with YAML frontmatter (name, description, metadata).
 * The body is the agent's instructions — we feed it to Claude as system
 * context, with cache_control so the same skills set is cheap to re-use
 * across analysis runs.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

export interface SkillFrontmatter {
  name: string;
  description: string;
  metadata?: { version?: string };
}

export interface Skill {
  /** Slug = the folder name under skills/skills/. */
  slug: string;
  frontmatter: SkillFrontmatter;
  /** Body of the SKILL.md after the frontmatter. */
  body: string;
}

/// Resolve SKILLS_ROOT with a fallback chain:
///   1. SKILLS_ROOT env var if set (handy for CI / Docker)
///   2. <cwd>/skills/skills — what the production deploy ships
///   3. <compiled-file>/../../../../skills/skills — the dev layout
///      where the next/font build leaves the file deep in .next/server
function resolveSkillsRoot(): string {
  const fromEnv = process.env.SKILLS_ROOT;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const fromCwd = resolve(process.cwd(), 'skills/skills');
  if (existsSync(fromCwd)) return fromCwd;
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../../skills/skills');
}

const SKILLS_ROOT = resolveSkillsRoot();

async function readSkillDir(slug: string): Promise<Skill | null> {
  const file = join(SKILLS_ROOT, slug, 'SKILL.md');
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<SkillFrontmatter>;
    if (!fm.name || !fm.description) return null;
    return {
      slug,
      frontmatter: { name: fm.name, description: fm.description, metadata: fm.metadata },
      body: parsed.content.trim(),
    };
  } catch {
    return null;
  }
}

let cache: Skill[] | null = null;

/**
 * Read all SKILL.md files under skills/skills/. Cached in-process — the
 * submodule pin is static at runtime so we never need to re-read.
 */
export async function loadAllSkills(): Promise<Skill[]> {
  if (cache) return cache;
  const dirs = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const slugs = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
  const skills = await Promise.all(slugs.map(readSkillDir));
  cache = skills.filter((s): s is Skill => s !== null);
  return cache;
}

/**
 * Pick a subset of skills by slug. Unknown slugs are silently skipped —
 * the analyzer logs which slugs it actually loaded.
 */
export async function loadSkillsBySlug(slugs: readonly string[]): Promise<Skill[]> {
  const all = await loadAllSkills();
  const bySlug = new Map(all.map((s) => [s.slug, s]));
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((s): s is Skill => s !== undefined);
}

/**
 * Default skill set for a "general marketing audit" analysis run. These
 * skills get loaded into the system message for the audit prompt.
 *
 * Skills not included here are still callable in follow-up prompts —
 * e.g. when drafting a specific campaign, load only the relevant
 * specialty (paid-ads, email-sequence, page-cro).
 */
export const DEFAULT_AUDIT_SKILLS = [
  'product-marketing-context',
  'customer-research',
  'marketing-psychology',
  'pricing-strategy',
  'paid-ads',
  'email-sequence',
  'social-content',
  'content-strategy',
  'churn-prevention',
  'referral-program',
] as const;
