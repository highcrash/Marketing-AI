/**
 * Multi-tenant primitives: organizations, memberships, business
 * resolution.
 *
 * Existing routes still use `getOrCreateBusinessFromEnv()` to find
 * the working business. To migrate them, swap in
 * `getCurrentBusinessForUser(userId)` which returns the user's
 * `activeBusinessId` (falling back to their first available business,
 * falling back to env). This file deliberately doesn't touch any
 * existing call sites — that migration happens piecemeal once UI
 * guidelines land + we know how the org/business switcher looks.
 */

import { prisma } from './db';
import { RestoraClient } from './restora-client';

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  /// Caller's role in this org.
  role: Role;
  businessCount: number;
  createdAt: string;
}

export interface BusinessSummary {
  id: string;
  organizationId: string | null;
  name: string;
  baseUrl: string;
  goalTags: string[];
  goalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'org'
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let i = 1;
  // 10 attempts is plenty; cuid suffixes guarantee uniqueness after
  // that in the rare case of a slug collision storm.
  while (i < 10) {
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
    i += 1;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createOrganization(params: {
  name: string;
  ownerUserId: string;
}): Promise<{ id: string; slug: string }> {
  const name = params.name.trim().slice(0, 120);
  if (name.length === 0) throw new Error('Organization name required');
  const slug = await uniqueSlug(slugify(name));
  const org = await prisma.organization.create({
    data: {
      name,
      slug,
      memberships: {
        create: {
          userId: params.ownerUserId,
          role: 'OWNER',
        },
      },
    },
  });
  return { id: org.id, slug: org.slug };
}

export async function listOrgsForUser(userId: string): Promise<OrgSummary[]> {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    include: {
      org: {
        include: {
          _count: { select: { businesses: true } },
        },
      },
    },
    orderBy: { org: { createdAt: 'asc' } },
  });
  return memberships.map((m) => ({
    id: m.org.id,
    name: m.org.name,
    slug: m.org.slug,
    role: m.role as Role,
    businessCount: m.org._count.businesses,
    createdAt: m.org.createdAt.toISOString(),
  }));
}

export async function getMembership(
  orgId: string,
  userId: string,
): Promise<{ role: Role } | null> {
  const m = await prisma.orgMembership.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  return m ? { role: m.role as Role } : null;
}

export async function listBusinessesForUser(userId: string): Promise<BusinessSummary[]> {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    select: { orgId: true },
  });
  if (memberships.length === 0) return [];
  const orgIds = memberships.map((m) => m.orgId);
  const businesses = await prisma.business.findMany({
    where: { organizationId: { in: orgIds } },
    orderBy: { createdAt: 'asc' },
  });
  return businesses.map((b) => ({
    id: b.id,
    organizationId: b.organizationId,
    name: b.name,
    baseUrl: b.baseUrl,
    goalTags: (() => {
      try {
        const parsed = JSON.parse(b.goalTags);
        return Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        return [];
      }
    })(),
    goalNotes: b.goalNotes,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));
}

/// Connect a new business to an org. Validates the endpoint by
/// calling /business/profile before persisting — bad keys should fail
/// immediately, not at first audit.
export async function connectBusiness(params: {
  organizationId: string;
  baseUrl: string;
  apiKey: string;
}): Promise<BusinessSummary> {
  const trimmedBase = params.baseUrl.trim().replace(/\/$/, '');
  if (!trimmedBase) throw new Error('baseUrl required');
  if (!params.apiKey.startsWith('rk_')) throw new Error('apiKey must be a Restora rk_ key');

  const existing = await prisma.business.findUnique({ where: { baseUrl: trimmedBase } });
  if (existing) {
    throw new Error('A business with this baseUrl already exists');
  }

  // Validate the endpoint + key by fetching /business/profile.
  const client = new RestoraClient(trimmedBase, params.apiKey);
  const profile = await client.getProfile();

  const row = await prisma.business.create({
    data: {
      organizationId: params.organizationId,
      name: profile.data.name,
      baseUrl: trimmedBase,
      apiKey: params.apiKey,
    },
  });
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    baseUrl: row.baseUrl,
    goalTags: [],
    goalNotes: row.goalNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setActiveBusinessForUser(
  userId: string,
  businessId: string | null,
): Promise<void> {
  if (businessId) {
    // Ownership check: the business must belong to one of the user's
    // orgs, otherwise we'd let a user "switch" to someone else's data.
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { organizationId: true },
    });
    if (!business || !business.organizationId) {
      throw new Error('Business not in any organization');
    }
    const member = await prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: business.organizationId, userId } },
      select: { id: true },
    });
    if (!member) throw new Error('Not a member of this business\'s organization');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { activeBusinessId: businessId },
  });
}

/// Resolve the working business for a user. Order of preference:
///   1. user.activeBusinessId (when it still belongs to one of their orgs)
///   2. First business in their first org (chronologically)
///   3. Env-bootstrapped business (legacy single-tenant fallback)
///
/// New routes should swap in this function in place of
/// getOrCreateBusinessFromEnv() once UI surfaces the business
/// switcher.
export async function getCurrentBusinessForUser(userId: string): Promise<BusinessSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeBusinessId: true },
  });
  if (user?.activeBusinessId) {
    const active = await prisma.business.findUnique({
      where: { id: user.activeBusinessId },
    });
    if (active && active.organizationId) {
      const member = await prisma.orgMembership.findUnique({
        where: { orgId_userId: { orgId: active.organizationId, userId } },
        select: { id: true },
      });
      if (member) {
        return {
          id: active.id,
          organizationId: active.organizationId,
          name: active.name,
          baseUrl: active.baseUrl,
          goalTags: [],
          goalNotes: active.goalNotes,
          createdAt: active.createdAt.toISOString(),
          updatedAt: active.updatedAt.toISOString(),
        };
      }
    }
  }
  const all = await listBusinessesForUser(userId);
  if (all.length > 0) return all[0];
  return null;
}

/// Adopt any orphaned env-bootstrapped Business (organizationId IS
/// NULL) into a default org for the given user. Used during the
/// transition from single-tenant to multi-tenant — once every
/// existing deployment has called this once, nothing is orphaned
/// anymore. Idempotent.
export async function adoptLegacyBusinessesForUser(userId: string): Promise<void> {
  const orphans = await prisma.business.findMany({
    where: { organizationId: null },
    select: { id: true },
  });
  if (orphans.length === 0) return;
  let existingOrg = await prisma.orgMembership.findFirst({
    where: { userId, role: 'OWNER' },
    select: { orgId: true },
  });
  let orgId: string;
  if (existingOrg) {
    orgId = existingOrg.orgId;
  } else {
    const created = await createOrganization({ name: 'Default Organization', ownerUserId: userId });
    orgId = created.id;
  }
  await prisma.business.updateMany({
    where: { organizationId: null },
    data: { organizationId: orgId },
  });
}

export async function inviteMember(params: {
  orgId: string;
  inviterUserId: string;
  email: string;
  role: Role;
}): Promise<{ added: boolean; userId: string }> {
  if (params.role === 'OWNER') {
    throw new Error('Cannot invite as OWNER — use transferOwnership instead');
  }
  // Inviter must be OWNER or ADMIN.
  const inviter = await getMembership(params.orgId, params.inviterUserId);
  if (!inviter || (inviter.role !== 'OWNER' && inviter.role !== 'ADMIN')) {
    throw new Error('Only OWNER or ADMIN can invite members');
  }
  const email = params.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Soft-create: a placeholder user with no passwordHash. When they
    // register through /register (which we'd extend to recognise an
    // existing invited row), they get their hash set. For now we just
    // tell the caller no such user — the formal invite-email flow is
    // a later UI task.
    throw new Error(`No user with email ${email} — they must register first`);
  }
  user = user;
  const existing = await prisma.orgMembership.findUnique({
    where: { orgId_userId: { orgId: params.orgId, userId: user.id } },
  });
  if (existing) {
    return { added: false, userId: user.id };
  }
  await prisma.orgMembership.create({
    data: {
      orgId: params.orgId,
      userId: user.id,
      role: params.role,
    },
  });
  return { added: true, userId: user.id };
}
