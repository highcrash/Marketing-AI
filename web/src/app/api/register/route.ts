import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PostBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/// Single-user lockdown: the FIRST POST creates the user; subsequent
/// POSTs always 403. This is intentional. The Marketing AI platform
/// today is single-tenant; opening registration to anyone reaching the
/// hostname is a security hole, not a feature.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as PostBody;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' && body.name.trim().length > 0 ? body.name.trim() : null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Email is not valid' },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: 'bad_request', message: `Password must be at least ${MIN_PASSWORD_LEN} characters` },
      { status: 400 },
    );
  }

  try {
    const existingCount = await prisma.user.count();
    if (existingCount > 0) {
      return NextResponse.json(
        {
          error: 'closed',
          message: 'Registration is closed. This Marketing AI install is single-user.',
        },
        { status: 403 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true },
    });
    return NextResponse.json({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'register_failed', message }, { status: 500 });
  }
}
