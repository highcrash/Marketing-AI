import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { connectBusiness, getMembership, listBusinessesForUser } from '@/lib/orgs';

export const dynamic = 'force-dynamic';

interface PostBody {
  organizationId?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const businesses = await listBusinessesForUser(session.user.id);
    return NextResponse.json({ businesses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'list_failed', message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const organizationId = typeof body.organizationId === 'string' ? body.organizationId : '';
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : '';
  if (!organizationId || !baseUrl || !apiKey) {
    return NextResponse.json(
      { error: 'bad_request', message: 'organizationId + baseUrl + apiKey required' },
      { status: 400 },
    );
  }
  // Must be OWNER or ADMIN to add a business to the org.
  const member = await getMembership(organizationId, session.user.id);
  if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const business = await connectBusiness({ organizationId, baseUrl, apiKey });
    return NextResponse.json({ business });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'connect_failed', message }, { status: 400 });
  }
}
