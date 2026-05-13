import { prisma } from './db';
import { RestoraClient } from './restora-client';

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
