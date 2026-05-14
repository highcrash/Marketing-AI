import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { setActiveBusinessForUser } from '@/lib/orgs';

export const dynamic = 'force-dynamic';

interface PostBody {
  businessId?: unknown;
}

/// Switch the user's active business — the one the dashboard renders
/// against by default. Pass null/empty to clear it (falls back to
/// first available).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const businessId =
    typeof body.businessId === 'string' && body.businessId.length > 0 ? body.businessId : null;
  try {
    await setActiveBusinessForUser(session.user.id, businessId);
    return NextResponse.json({ ok: true, activeBusinessId: businessId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'switch_failed', message }, { status: 400 });
  }
}
