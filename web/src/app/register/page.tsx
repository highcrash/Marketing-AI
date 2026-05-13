'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const body = (await res.json()) as
        | { user: { id: string; email: string; name: string | null } }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        setError('message' in body ? body.message : `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }

      // Auto sign in after register.
      const signInRes = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (!signInRes || signInRes.error) {
        setError('Account created but auto-sign-in failed. Try /login.');
        setSubmitting(false);
        return;
      }
      router.push('/');
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
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Set up account
          </h1>
          <p className="text-[11px] text-zinc-500 mt-2">
            Single-user lockdown. After this account is created, registration is closed.
          </p>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:border-red-600"
          />
        </label>

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
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Password (8+ chars)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:border-red-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-2 focus:outline-none focus:border-red-600"
          />
        </label>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !email || password.length < 8}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 text-white px-4 py-2.5 text-sm font-medium tracking-wide uppercase"
        >
          {submitting ? 'Creating…' : 'Create account'}
        </button>

        <p className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-100 dark:border-zinc-900">
          Already set up? <Link href="/login" className="text-red-600 hover:text-red-700">Sign in</Link>.
        </p>
      </form>
    </main>
  );
}
