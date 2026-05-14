'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Next 16 requires useSearchParams consumers to live inside a Suspense
// boundary so the rest of the page can prerender statically. Splitting
// the form out keeps the wrapping cheap.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!res || res.error) {
        setError(res?.error ?? 'Login failed');
        setSubmitting(false);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 space-y-4"
      >
        <div>
          <p className="text-xs uppercase tracking-widest text-red-600 font-medium mb-1">
            Marketing AI
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sign in</h1>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:border-red-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:border-red-600"
          />
        </label>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 text-white px-4 py-2.5 text-sm font-medium tracking-wide uppercase"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-900">
          First time? <Link href="/register" className="text-red-600 hover:text-red-700">Set up the account</Link>. After the first user is created, this page is the only way in.
        </p>
      </form>
    </main>
  );
}
