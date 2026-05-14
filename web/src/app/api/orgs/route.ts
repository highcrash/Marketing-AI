import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  adoptLegacyBusinessesForUser,
  createOrganization,
  listOrgsForUser,
} from '@/lib/orgs';

export const dynamic = 'force-dynamic';

interface PostBody {
  name?: unknown;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    // Auto-adopt any legacy env-bootstrapped business into a default org
    // the first time the user hits this endpoint. Idempotent after.
    await adoptLegacyBusinessesForUser(session.user.id);
    const orgs = await listOrgsForUser(session.user.id);
    return NextResponse.json({ orgs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const name = typeof body.name === 'string' ? body.name : '';
  try {
    const org = await createOrganization({ name, ownerUserId: session.user.id });
    return NextResponse.json({ org });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'create_failed', message }, { status: 400 });
  }
}
