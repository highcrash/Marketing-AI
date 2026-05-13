import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';

/// Auth.js v5 config. Credentials-only (single-user, email + password).
/// JWT session strategy — no Session table to manage.
///
/// The `authorized` callback is the gate. Anything not in the public
/// allow-list requires a signed-in user. Matching is path-prefix; keep
/// it tight so deep links can't accidentally bypass.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string' ? credentials.email.trim().toLowerCase() : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? null };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    authorized({ request, auth: session }) {
      const { pathname } = request.nextUrl;
      // Public paths: login, register, the NextAuth API routes,
      // the register API, and the cron webhook (which is protected
      // by CRON_SECRET, not by NextAuth — Vercel Cron and any
      // external cron-as-a-service can't carry a session cookie).
      if (
        pathname === '/login' ||
        pathname === '/register' ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/register') ||
        pathname.startsWith('/api/cron')
      ) {
        return true;
      }
      return !!session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    };
  }
}
