'use client';

import { useState } from 'react';

import { AnalysisView } from './AnalysisView';
import { OperationalStatsCard } from './OperationalStatsCard';
import type { AnalysisResult } from '@/lib/ai/analyze';
import type { AnalysisListItem, CompletionsByKey, DraftsByRecIndex } from '@/lib/analyses';
import type { DraftRow } from '@/lib/drafts';
import type { SmsSendRow } from '@/lib/sms-sends';

type Status = 'idle' | 'running' | 'error';

interface Current {
  id: string;
  result: AnalysisResult;
  drafts: DraftsByRecIndex;
  completions: CompletionsByKey;
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
  const [sendingPieceKey, setSendingPieceKey] = useState<string | null>(null);
  const [lastSendResultsByPiece, setLastSendResultsByPiece] = useState<
    Record<string, SmsSendRow | null>
  >({});
  const [smsError, setSmsError] = useState<string | null>(null);
  const [togglingCompletionKey, setTogglingCompletionKey] = useState<string | null>(null);
  /// Bumped after every state-changing action so the ActivityPanel
  /// re-fetches its timeline. Stats are derived client-side from
  /// `current.drafts` so they update instantly without waiting.
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const bumpActivity = () => setActivityRefreshKey((k) => k + 1);

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

      // Fresh analysis means no drafts (and therefore no completions).
      setCurrent({ id: body.id, result: body.result, drafts: {}, completions: {} });
      setStatus('idle');
      bumpActivity();

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
        | {
            id: string;
            result: AnalysisResult;
            drafts: DraftsByRecIndex;
            completions: CompletionsByKey;
          }
        | { error: string };
      if (!res.ok || 'error' in body) return;
      setCurrent({
        id: body.id,
        result: body.result,
        drafts: body.drafts,
        completions: body.completions ?? {},
      });
      bumpActivity();
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
      bumpActivity();
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
      bumpActivity();
    } catch (err: unknown) {
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setUpdatingStatusDraftId(null);
    }
  }

  async function sendSms(
    draftId: string,
    pieceIndex: number,
    phone: string,
    bodyOverride: string | null,
  ) {
    const key = `${draftId}:${pieceIndex}`;
    if (sendingPieceKey !== null) return;
    setSendingPieceKey(key);
    setSmsError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          phone,
          ...(bodyOverride != null ? { body: bodyOverride } : {}),
        }),
      });
      const body = (await res.json()) as
        | { event: SmsSendRow }
        | { event?: SmsSendRow; error: string; message: string };

      if ('event' in body && body.event) {
        // Whether SENT or PROVIDER_ERROR, persist the result so the user sees it.
        setLastSendResultsByPiece((prev) => ({ ...prev, [key]: body.event! }));
        // Re-fetch completions so the auto-mark from a successful send
        // shows up immediately. Cheap query — one DB read.
        if (body.event.status === 'SENT' && current) {
          void refetchCompletions(current.id);
        }
        bumpActivity();
      }
      if (!res.ok || 'error' in body) {
        const msg = 'message' in body ? body.message : `HTTP ${res.status}`;
        // Errors from the upstream send still get an event row + result line;
        // only surface a banner error if we have nothing at all.
        if (!('event' in body && body.event)) setSmsError(msg);
      }
    } catch (err: unknown) {
      setSmsError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSendingPieceKey(null);
    }
  }

  async function toggleCompletion(
    draftId: string,
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
  ) {
    const key = `${draftId}:${pieceIndex}`;
    if (togglingCompletionKey !== null) return;
    setTogglingCompletionKey(key);
    try {
      const method = currentlyComplete ? 'DELETE' : 'POST';
      const trimmedNotes =
        typeof notes === 'string' && notes.trim().length > 0 ? notes.trim() : null;
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(draftId)}/pieces/${pieceIndex}/complete`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'POST' ? JSON.stringify({ notes: trimmedNotes }) : undefined,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.length > 0 ? text.slice(0, 200) : `HTTP ${res.status}`);
      }
      setCurrent((prev) => {
        if (!prev) return prev;
        const completions = { ...prev.completions };
        if (currentlyComplete) {
          delete completions[key];
        } else {
          completions[key] = {
            id: 'pending',
            draftId,
            pieceIndex,
            notes: trimmedNotes,
            source: 'manual',
            completedAt: new Date().toISOString(),
          };
        }
        return { ...prev, completions };
      });
      bumpActivity();
    } catch (err: unknown) {
      // Surface via the existing draftError slot — same UI corner the
      // user already scans for problems.
      setDraftError({
        recIndex: -1,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    } finally {
      setTogglingCompletionKey(null);
    }
  }

  async function refetchCompletions(analysisId: string) {
    try {
      const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        completions?: CompletionsByKey;
      };
      if (!body.completions) return;
      setCurrent((prev) =>
        prev && prev.id === analysisId ? { ...prev, completions: body.completions! } : prev,
      );
    } catch {
      // Best-effort; ignore.
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
      bumpActivity();
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

        {smsError && (
          <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
              SMS send failed
            </p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-mono break-all">
              {smsError}
            </p>
          </div>
        )}

        <OperationalStatsCard refreshKey={activityRefreshKey} />

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
            analysisId={current.id}
            result={current.result}
            drafts={current.drafts}
            completions={current.completions}
            draftingIndex={draftingIndex}
            refiningDraftId={refiningDraftId}
            updatingStatusDraftId={updatingStatusDraftId}
            sendingPieceKey={sendingPieceKey}
            lastSendResultsByPiece={lastSendResultsByPiece}
            togglingCompletionKey={togglingCompletionKey}
            activityRefreshKey={activityRefreshKey}
            onDraft={draftRec}
            onRefine={refineDraft}
            onSetStatus={setDraftStatus}
            onSendSms={sendSms}
            onSegmentBlastSent={() => {
              bumpActivity();
              if (current) void refetchCompletions(current.id);
            }}
            onToggleCompletion={toggleCompletion}
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
