import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getMembership, inviteMember, type Role } from '@/lib/orgs';

export const dynamic = 'force-dynamic';

const VALID_ROLES = new Set<Role>(['ADMIN', 'MEMBER']);

interface PostBody {
  email?: unknown;
  role?: unknown;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: orgId } = await ctx.params;
  const me = await getMembership(orgId, session.user.id);
  if (!me) return NextResponse.json({ error: 'not_a_member' }, { status: 403 });
  const memberships = await prisma.orgMembership.findMany({
    where: { orgId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({
    members: memberships.map((m) => ({
      id: m.id,
      role: m.role as Role,
      user: { id: m.user.id, email: m.user.email, name: m.user.name },
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id: orgId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const email = typeof body.email === 'string' ? body.email : '';
  const role =
    typeof body.role === 'string' && VALID_ROLES.has(body.role as Role) ? (body.role as Role) : 'MEMBER';
  if (!email) {
    return NextResponse.json({ error: 'bad_request', message: 'email required' }, { status: 400 });
  }
  try {
    const result = await inviteMember({
      orgId,
      inviterUserId: session.user.id,
      email,
      role,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'invite_failed', message }, { status: 400 });
  }
}
