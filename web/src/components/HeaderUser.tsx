'use client';

import { signOut, useSession } from 'next-auth/react';
import { Calendar, CheckCircle2, LogOut, Plug } from 'lucide-react';
import Link from 'next/link';

export function HeaderUser() {
  const { data: session, status } = useSession();
  if (status === 'loading') return null;
  if (!session?.user) return null;
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
      <Link
        href="/schedules"
        className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-blue-600 hover:text-blue-600"
        title="View all schedules"
      >
        <Calendar size={11} />
        Schedules
      </Link>
      <Link
        href="/completions"
        className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-600 hover:text-emerald-600"
        title="Audit trail of completed pieces"
      >
        <CheckCircle2 size={11} />
        Completions
      </Link>
      <Link
        href="/connections"
        className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-blue-600 hover:text-blue-600"
        title="Manage Facebook + other external connections"
      >
        <Plug size={11} />
        Connections
      </Link>
      <span className="hidden sm:inline">{session.user.email}</span>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-red-600 hover:text-red-600"
        title="Sign out"
      >
        <LogOut size={11} />
        Sign out
      </button>
    </div>
  );
}
