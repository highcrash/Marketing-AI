'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-[10px] uppercase tracking-[0.3em] font-medium">
              Marketing AI
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Set up account</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>
              Single-user lockdown. After this account is created, registration is closed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
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
                <Label htmlFor="password">Password (8+ chars)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="font-mono break-all">{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={submitting || !email || password.length < 8} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center">
          Already set up?{' '}
          <Link href="/login" className="text-primary hover:text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
