'use client';

import { useState } from 'react';
import { Send, Users, X } from 'lucide-react';

import type { BlastEventRow, BlastSegmentFilter } from '@/lib/sms-blasts';

type Mode = 'idle' | 'previewing' | 'previewed' | 'sending' | 'sent' | 'error';

interface Preview {
  recipientCount: number;
  segmentLabel: string;
}

/// Inline segment-send form for an SMS piece. Lives inside PieceCard
/// and owns its own state — only the trigger button in PieceCard is
/// external. Calls /api/drafts/:id/send-sms-blast directly.
///
/// The two-step "preview → confirm → send" flow is intentional. Real
/// customers are at the other end of every blast; the recipient count
/// preview is the cheap, safe way to verify the filter is what you
/// meant before paying for actual SMS delivery.
export function SegmentBlastPanel({
  draftId,
  pieceIndex,
  pieceContent,
  onClose,
  onSent,
  initialResult,
}: {
  draftId: string;
  pieceIndex: number;
  /// Canonical SMS body from the draft. The panel seeds its editable
  /// body textarea with this; the user can fix placeholders before
  /// blasting to real customers. piece.content stays untouched.
  pieceContent: string;
  onClose: () => void;
  /// Called after a successful send so the parent can refresh history.
  onSent?: (event: BlastEventRow) => void;
  /// Pre-populated result if we already have one from a prior render.
  initialResult?: BlastEventRow | null;
}) {
  const [mode, setMode] = useState<Mode>(initialResult ? 'sent' : 'idle');
  const [editedBody, setEditedBody] = useState(pieceContent);
  const [minSpent, setMinSpent] = useState('');
  const [minVisits, setMinVisits] = useState('');
  const [maxLastVisitDays, setMaxLastVisitDays] = useState('');
  const [minLoyaltyPoints, setMinLoyaltyPoints] = useState('');
  const [campaignTag, setCampaignTag] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<BlastEventRow | null>(initialResult ?? null);
  const [error, setError] = useState<string | null>(null);

  function buildSegment(): BlastSegmentFilter {
    const out: BlastSegmentFilter = {};
    const trimmed = (s: string) => s.trim();
    if (trimmed(minSpent)) out.minSpent = Number(minSpent);
    if (trimmed(minVisits)) out.minVisits = Number(minVisits);
    if (trimmed(maxLastVisitDays)) out.maxLastVisitDays = Number(maxLastVisitDays);
    if (trimmed(minLoyaltyPoints)) out.minLoyaltyPoints = Number(minLoyaltyPoints);
    return out;
  }

  function bodyOverrideOrNull(): string | null {
    const trimmed = editedBody.trim();
    if (trimmed.length === 0) return null;
    return trimmed === pieceContent ? null : trimmed;
  }

  async function runPreview() {
    setMode('previewing');
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/send-sms-blast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          segment: buildSegment(),
          dryRun: true,
          ...(bodyOverrideOrNull() ? { body: bodyOverrideOrNull() } : {}),
        }),
      });
      const body = (await res.json()) as
        | { dryRun: true; recipientCount: number; segmentLabel: string }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setPreview({ recipientCount: body.recipientCount, segmentLabel: body.segmentLabel });
      setMode('previewed');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setMode('error');
    }
  }

  async function runSend() {
    if (!preview) return;
    setMode('sending');
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/send-sms-blast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          segment: buildSegment(),
          campaignTag: campaignTag.trim() || undefined,
          dryRun: false,
          ...(bodyOverrideOrNull() ? { body: bodyOverrideOrNull() } : {}),
        }),
      });
      const body = (await res.json()) as
        | { event: BlastEventRow }
        | { event?: BlastEventRow; error: string; message: string };
      if ('event' in body && body.event) {
        setResult(body.event);
        if (body.event.status !== 'FAILED') {
          onSent?.(body.event);
        }
      }
      if (!res.ok || ('error' in body && !('event' in body && body.event))) {
        const msg = 'message' in body ? body.message : `HTTP ${res.status}`;
        setError(msg);
        setMode('error');
        return;
      }
      setMode('sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setMode('error');
    }
  }

  const isBusy = mode === 'previewing' || mode === 'sending';

  return (
    <div className="border-t border-border/60 bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
          <Users size={12} />
          Send to a customer segment via Restora
        </p>
        <button
          onClick={onClose}
          disabled={isBusy}
          className="text-muted-foreground/70 hover:text-foreground  disabled:opacity-50"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {mode !== 'sent' && (
        <>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
              SMS body (edit before blasting — fix any [DATE+X] / placeholders)
            </span>
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={Math.min(8, Math.max(3, editedBody.split('\n').length + 1))}
              maxLength={1000}
              disabled={isBusy}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-600 font-sans resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {editedBody.length} chars
                {editedBody !== pieceContent && ' · edited'}
              </span>
              {editedBody !== pieceContent && (
                <button
                  onClick={() => setEditedBody(pieceContent)}
                  disabled={isBusy}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Reset to original
                </button>
              )}
            </div>
          </label>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <FilterInput
              label="Min spend (BDT)"
              value={minSpent}
              onChange={setMinSpent}
              placeholder="e.g. 500"
              disabled={isBusy}
            />
            <FilterInput
              label="Min visits"
              value={minVisits}
              onChange={setMinVisits}
              placeholder="e.g. 2"
              disabled={isBusy}
            />
            <FilterInput
              label="Visited within (days)"
              value={maxLastVisitDays}
              onChange={setMaxLastVisitDays}
              placeholder="e.g. 60"
              disabled={isBusy}
            />
            <FilterInput
              label="Min loyalty points"
              value={minLoyaltyPoints}
              onChange={setMinLoyaltyPoints}
              placeholder="e.g. 1"
              disabled={isBusy}
            />
          </div>

          <FilterInput
            label="Campaign tag (optional)"
            value={campaignTag}
            onChange={setCampaignTag}
            placeholder="e.g. mai-2026-reactivation"
            disabled={isBusy}
          />

          {mode === 'idle' || mode === 'previewing' || mode === 'error' ? (
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Empty filters = all active customers with a phone
              </p>
              <button
                onClick={runPreview}
                disabled={isBusy}
                className="bg-zinc-700 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-muted-foreground text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
              >
                <Users size={11} />
                {mode === 'previewing' ? 'Counting…' : 'Preview recipients'}
              </button>
            </div>
          ) : null}

          {mode === 'previewed' && preview && (
            <div className="space-y-2 pt-1 border-t border-border">
              <p className="text-sm text-foreground">
                <span className="font-medium">{preview.recipientCount}</span> customer
                {preview.recipientCount === 1 ? '' : 's'} match{' '}
                <span className="text-muted-foreground">·</span>{' '}
                <span className="text-muted-foreground italic">
                  {preview.segmentLabel}
                </span>
              </p>
              {preview.recipientCount === 0 ? (
                <p className="text-[11px] text-amber-400">
                  Nothing to send — broaden the filter.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Clicking Send will dispatch one SMS to each of these customers via your Restora
                  SMS provider. This is real spend.
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={runPreview}
                  className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-zinc-800 px-2 py-1.5 border border-border"
                >
                  Re-preview
                </button>
                <button
                  onClick={runSend}
                  disabled={preview.recipientCount === 0}
                  className="ml-auto bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 disabled:text-muted-foreground text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
                >
                  <Send size={11} />
                  Send to {preview.recipientCount} customer{preview.recipientCount === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          )}

          {mode === 'sending' && (
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span className="inline-block size-2 bg-emerald-600 animate-pulse" />
              Sending — one SMS per recipient, this can take a while.
            </div>
          )}

          {error && mode !== 'sending' && (
            <p className="text-[11px] text-destructive font-mono break-all">
              {error}
            </p>
          )}
        </>
      )}

      {mode === 'sent' && result && <BlastResultLine result={result} />}
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="bg-card border border-border text-foreground px-2 py-1.5 placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-600 font-mono text-[12px]"
      />
    </label>
  );
}

function BlastResultLine({ result }: { result: BlastEventRow }) {
  const isComplete = result.status === 'COMPLETE';
  const isPartial = result.status === 'PARTIAL';
  const tone = isComplete
    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/60'
    : isPartial
    ? 'text-amber-300 bg-amber-950/30 border-amber-900/60'
    : 'text-destructive bg-destructive/10/40 border-red-200 dark:border-red-900';
  return (
    <div className={`border ${tone} px-3 py-2 text-[11px] font-mono`}>
      <span className="font-medium">
        {isComplete ? '✓ Sent' : isPartial ? '⚠ Partial' : '✗ Failed'}{' '}
      </span>
      <span>
        {result.sentCount} / {result.recipientCount}
      </span>
      {result.failedCount > 0 && <span> · {result.failedCount} failed</span>}
      <span className="text-muted-foreground ml-2">{result.segmentLabel}</span>
      {result.campaignTag && <span className="text-muted-foreground ml-2">· tag {result.campaignTag}</span>}
      {result.error && (
        <span className="block mt-1 break-all whitespace-pre-wrap">{result.error}</span>
      )}
      <span className="text-muted-foreground ml-2 block mt-1">
        {new Date(result.createdAt).toLocaleString()}
      </span>
    </div>
  );
}
