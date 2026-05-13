'use client';

import { signOut, useSession } from 'next-auth/react';
import { LogOut } from 'lucide-react';

export function HeaderUser() {
  const { data: session, status } = useSession();
  if (status === 'loading') return null;
  if (!session?.user) return null;
  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
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
