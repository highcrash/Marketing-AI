'use client';

import { useState } from 'react';

import { AnalysisView } from './AnalysisView';
import type { AnalysisResult } from '@/lib/ai/analyze';
import type { AnalysisListItem, DraftsByRecIndex } from '@/lib/analyses';
import type { DraftRow } from '@/lib/drafts';

type Status = 'idle' | 'running' | 'error';

interface Current {
  id: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
}

export function AnalysisDashboard({
  initialLatest,
  initialList,
}: {
  initialLatest: Current | null;
  initialList: AnalysisListItem[];
}) {
  const [current, setCurrent] = useState<Current | null>(initialLatest);
  const [list, setList] = useState<AnalysisListItem[]>(initialList);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [draftingIndex, setDraftingIndex] = useState<number | null>(null);
  const [draftError, setDraftError] = useState<{ recIndex: number; message: string } | null>(null);
  const [refiningDraftId, setRefiningDraftId] = useState<string | null>(null);
  const [updatingStatusDraftId, setUpdatingStatusDraftId] = useState<string | null>(null);

  async function runAnalysis() {
    setStatus('running');
    setError(null);
    setElapsedMs(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsedMs(Date.now() - t0), 500);

    try {
      const res = await fetch('/api/analyze', { method: 'POST' });
      const body = (await res.json()) as
        | { id: string; result: AnalysisResult }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }

      // Fresh analysis means no drafts yet.
      setCurrent({ id: body.id, result: body.result, drafts: {} });
      setStatus('idle');

      const listRes = await fetch('/api/analyses');
      if (listRes.ok) {
        const listBody = (await listRes.json()) as { items: AnalysisListItem[] };
        setList(listBody.items);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setStatus('error');
    } finally {
      clearInterval(tick);
    }
  }

  async function loadAnalysis(id: string) {
    if (current?.id === id) return;
    try {
      const res = await fetch(`/api/analyses/${id}`);
      const body = (await res.json()) as
        | { id: string; result: AnalysisResult; drafts: DraftsByRecIndex }
        | { error: string };
      if (!res.ok || 'error' in body) return;
      setCurrent({ id: body.id, result: body.result, drafts: body.drafts });
    } catch {
      // Swallow — list rows that fail just stay un-selected.
    }
  }

  async function draftRec(recIndex: number) {
    if (!current || draftingIndex !== null) return;
    setDraftingIndex(recIndex);
    setDraftError(null);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: current.id, recIndex }),
      });
      const body = (await res.json()) as
        | { draft: DraftRow }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }

      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              drafts: { ...prev.drafts, [recIndex]: body.draft },
            }
          : prev,
      );
    } catch (err: unknown) {
      setDraftError({
        recIndex,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setDraftingIndex(null);
    }
  }

  async function setDraftStatus(
    draftId: string,
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
  ) {
    if (!current || updatingStatusDraftId !== null) return;
    setUpdatingStatusDraftId(draftId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as
        | { draft: DraftRow }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              drafts: { ...prev.drafts, [body.draft.recIndex]: body.draft },
            }
          : prev,
      );
    } catch (err: unknown) {
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setUpdatingStatusDraftId(null);
    }
  }

  async function refineDraft(draftId: string, feedback: string) {
    if (!current || refiningDraftId !== null) return;
    setRefiningDraftId(draftId);
    setDraftError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const body = (await res.json()) as
        | { draft: DraftRow }
        | { error: string; message: string };

      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }

      setCurrent((prev) =>
        prev
          ? {
              ...prev,
              drafts: { ...prev.drafts, [body.draft.recIndex]: body.draft },
            }
          : prev,
      );
    } catch (err: unknown) {
      // We don't have a stable recIndex here without re-deriving it, so
      // surface the error generically via the same sidebar slot.
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setRefiningDraftId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
      <aside className="space-y-4">
        <button
          onClick={runAnalysis}
          disabled={status === 'running'}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 text-white px-4 py-2.5 text-sm font-medium tracking-wide uppercase"
        >
          {status === 'running' ? 'Running…' : 'Run analysis'}
        </button>

        {status === 'running' && (
          <div className="border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block size-2 bg-red-600 animate-pulse" />
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {(elapsedMs / 1000).toFixed(0)}s · typical ~75s
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Fetching snapshot, loading skills, calling Claude. Don&apos;t refresh.
            </p>
          </div>
        )}

        {status === 'error' && error && (
          <div className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">
              Analysis failed
            </p>
            <p className="text-[11px] text-red-600 dark:text-red-400 font-mono break-all">
              {error}
            </p>
          </div>
        )}

        {draftError && (
          <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
              {draftError.recIndex >= 0
                ? `Draft failed (rec #${draftError.recIndex + 1})`
                : 'Refine failed'}
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-mono break-all">
              {draftError.message}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 px-1">
            Past runs · {list.length}
          </p>
          {list.length === 0 ? (
            <p className="text-xs text-zinc-500 px-1">No runs yet.</p>
          ) : (
            <ul className="space-y-1">
              {list.map((item) => {
                const isActive = current?.id === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => loadAnalysis(item.id)}
                      className={`w-full text-left px-3 py-2 text-xs border transition-colors ${
                        isActive
                          ? 'border-red-600 bg-red-50 dark:bg-red-950/30'
                          : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <div className="font-medium text-zinc-800 dark:text-zinc-200">
                        {new Date(item.generatedAt).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {item.recommendationCount} recs · {item.model.replace('claude-', '')}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section>
        {current ? (
          <AnalysisView
            result={current.result}
            drafts={current.drafts}
            draftingIndex={draftingIndex}
            refiningDraftId={refiningDraftId}
            updatingStatusDraftId={updatingStatusDraftId}
            onDraft={draftRec}
            onRefine={refineDraft}
            onSetStatus={setDraftStatus}
          />
        ) : status !== 'running' ? (
          <div className="border border-dashed border-zinc-300 dark:border-zinc-800 p-12 text-center text-zinc-500">
            <p className="mb-2">No analysis yet.</p>
            <p className="text-xs">
              Click <span className="font-medium">Run analysis</span> in the sidebar to fetch business data
              and generate recommendations. The first run takes ~75s and costs ~$1 in Opus tokens.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
