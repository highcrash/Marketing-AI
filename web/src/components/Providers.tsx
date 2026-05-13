'use client';

import { SessionProvider } from 'next-auth/react';

/// Client wrapper for client-only context providers. NextAuth's
/// `useSession`/`signIn`/`signOut` hooks need this around the app.
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
