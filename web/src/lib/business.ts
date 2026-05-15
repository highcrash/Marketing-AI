import { prisma } from './db';
import { RestoraClient } from './restora-client';

export const STANDARD_GOAL_TAGS = [
  'acquisition',
  'retention',
  'reach',
  'engagement',
  'conversions',
  'brand-awareness',
  'lead-generation',
  'increase-sales',
] as const;

export type StandardGoalTag = (typeof STANDARD_GOAL_TAGS)[number];

export interface BusinessGoals {
  /// Subset of STANDARD_GOAL_TAGS that the owner explicitly cares about.
  tags: StandardGoalTag[];
  /// Free-text additions (e.g. "opening second branch in Q3").
  notes: string | null;
}

/// Parse the persisted goalTags JSON, defensively. Falls back to []
/// when the column is empty, malformed, or contains tags we no longer
/// recognise.
export function parseGoalTags(raw: string | null | undefined): StandardGoalTag[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is StandardGoalTag =>
      typeof v === 'string' && (STANDARD_GOAL_TAGS as readonly string[]).includes(v),
    );
  } catch {
    return [];
  }
}

/// Bootstrap a single Business row from RESTORA_API_BASE / RESTORA_API_KEY.
/// Phase 1.C is single-tenant: there's exactly one connected business and
/// we look it up by baseUrl (the env-supplied URL). The first call against
/// a fresh DB calls /business/profile once to cache the display name.
///
/// Phase 1.D replaces this with a real onboarding form so multiple
/// businesses can be connected and the env fallback goes away.
export async function getOrCreateBusinessFromEnv(): Promise<{
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  goalTags: string;
  goalNotes: string | null;
}> {
  const baseUrl = process.env.RESTORA_API_BASE?.replace(/\/$/, '');
  const apiKey = process.env.RESTORA_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      'RESTORA_API_BASE and RESTORA_API_KEY must be set to bootstrap the default business.',
    );
  }

  const existing = await prisma.business.findUnique({ where: { baseUrl } });
  if (existing) {
    // If the user rotated the key in env, prefer the env value but persist
    // so future calls don't need to read env. The env IS the source of
    // truth in Phase 1.C — we just cache for fast lookups.
    if (existing.apiKey !== apiKey) {
      return prisma.business.update({
        where: { id: existing.id },
        data: { apiKey },
      });
    }
    return existing;
  }

  // First time we've seen this baseUrl — call /business/profile to
  // resolve the display name, then persist.
  const client = new RestoraClient(baseUrl, apiKey);
  const profile = await client.getProfile();

  return prisma.business.create({
    data: {
      name: profile.data.name,
      baseUrl,
      apiKey,
    },
  });
}

/// Read the persisted goals for one business. Returns empty defaults if
/// the owner hasn't set any — that's the signal the analyze pipeline
/// uses to fall back to "let the model infer goals from the data".
export async function getBusinessGoals(businessId: string): Promise<BusinessGoals> {
  const row = await prisma.business.findUnique({
    where: { id: businessId },
    select: { goalTags: true, goalNotes: true },
  });
  if (!row) return { tags: [], notes: null };
  return {
    tags: parseGoalTags(row.goalTags),
    notes: row.goalNotes && row.goalNotes.trim().length > 0 ? row.goalNotes : null,
  };
}

/// Read the owner-set IANA timezone override. Null means "fall back to
/// whatever Restora reports via /business/profile."
export async function getBusinessTimezone(
  businessId: string,
): Promise<string | null> {
  const row = await prisma.business.findUnique({
    where: { id: businessId },
    select: { timezone: true },
  });
  const tz = row?.timezone ?? null;
  if (!tz) return null;
  return isValidIanaTimezone(tz) ? tz : null;
}

/// Persist an owner-set timezone, or clear the override (pass null).
/// We validate the IANA name against the runtime's tz database so a
/// typo can't break every downstream Intl.DateTimeFormat call.
export async function setBusinessTimezone(
  businessId: string,
  timezone: string | null,
): Promise<string | null> {
  const trimmed = timezone?.trim() || null;
  if (trimmed !== null && !isValidIanaTimezone(trimmed)) {
    throw new Error(`Unknown IANA timezone: ${trimmed}`);
  }
  await prisma.business.update({
    where: { id: businessId },
    data: { timezone: trimmed },
  });
  return trimmed;
}

/// Probe Intl.DateTimeFormat with the name. Anything not in the
/// runtime's tz database throws a RangeError — that's our signal.
function isValidIanaTimezone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/// Persist owner-set marketing goals. Tags are filtered to the known
/// vocabulary so the prompt logic never has to guard against typos.
export async function setBusinessGoals(
  businessId: string,
  goals: BusinessGoals,
): Promise<BusinessGoals> {
  const cleanTags = Array.from(
    new Set(goals.tags.filter((t) => (STANDARD_GOAL_TAGS as readonly string[]).includes(t))),
  );
  const trimmedNotes =
    goals.notes && goals.notes.trim().length > 0 ? goals.notes.trim().slice(0, 1000) : null;
  await prisma.business.update({
    where: { id: businessId },
    data: {
      goalTags: JSON.stringify(cleanTags),
      goalNotes: trimmedNotes,
    },
  });
  return { tags: cleanTags as StandardGoalTag[], notes: trimmedNotes };
}
