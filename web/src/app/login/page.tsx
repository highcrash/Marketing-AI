'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-[0.3em] font-medium">
              Marketing AI
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Enter your credentials to continue your audit & campaign workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="font-mono break-all">{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={submitting || !email || !password} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center">
          First time?{' '}
          <Link href="/register" className="text-primary hover:text-accent underline-offset-4 hover:underline">
            Set up the account
          </Link>
          . After the first user is created, this page is the only way in.
        </p>
      </div>
    </main>
  );
}
