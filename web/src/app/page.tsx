'use client';

import { useState } from 'react';

import { AnalysisView } from '@/components/AnalysisView';
import type { AnalysisResult } from '@/lib/ai/analyze';

type Status = 'idle' | 'running' | 'done' | 'error';

export default function Home() {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  async function runAnalysis() {
    setStatus('running');
    setError(null);
    setElapsedMs(0);

    const t0 = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - t0), 500);

    try {
      const res = await fetch('/api/analyze', { method: 'POST' });
      const body = (await res.json()) as AnalysisResult | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        const msg = 'message' in body ? body.message : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setResult(body);
      setStatus('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      setError(msg);
      setStatus('error');
    } finally {
      clearInterval(tick);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <p className="text-xs uppercase tracking-widest text-red-600 font-medium mb-2">
            Marketing AI · Phase 1.B
          </p>
          <h1 className="text-3xl font-semibold">Marketing audit</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 max-w-2xl">
            Pulls a snapshot from your connected business endpoint, runs it through Claude with a
            curated marketing skill library, and returns a prioritized, data-grounded action list.
            Read-only — nothing is published to any platform.
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={runAnalysis}
            disabled={status === 'running'}
            className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 text-white px-5 py-2.5 text-sm font-medium tracking-wide uppercase"
          >
            {status === 'running' ? 'Running…' : status === 'done' ? 'Re-run analysis' : 'Run analysis'}
          </button>

          {status === 'running' && (
            <span className="text-sm text-zinc-500">
              Fetching snapshot, calling Claude · {(elapsedMs / 1000).toFixed(0)}s
              <span className="ml-2 text-xs text-zinc-400">(typical ~75s)</span>
            </span>
          )}

          {status === 'done' && result && (
            <span className="text-xs text-zinc-500">
              Last run · {new Date(result.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {status === 'idle' && !result && (
          <div className="border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center text-zinc-500">
            <p className="mb-2">No analysis yet.</p>
            <p className="text-xs">Click <span className="font-medium">Run analysis</span> to fetch business data and generate recommendations.</p>
          </div>
        )}

        {status === 'error' && (
          <div className="border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-5 mb-6">
            <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
              Analysis failed
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">{error}</p>
          </div>
        )}

        {status === 'running' && (
          <div className="border border-zinc-200 dark:border-zinc-800 p-8 text-center text-zinc-500">
            <div className="inline-flex items-center gap-3">
              <span className="inline-block size-2 bg-red-600 animate-pulse" />
              <span className="text-sm">Working…</span>
            </div>
            <p className="text-xs text-zinc-400 mt-3 max-w-md mx-auto">
              The analysis pulls ~11 endpoints from your business, loads marketing skills as
              context, and calls Claude Opus. Don&apos;t refresh.
            </p>
          </div>
        )}

        {result && status !== 'running' && <AnalysisView result={result} />}
      </div>
    </main>
  );
}
