'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Circle, Clock, Copy, Pencil, RotateCcw, Save, Send, Sparkles, Users, X } from 'lucide-react';

import type { DraftPiece } from '@/lib/ai/draft';
import type { DraftRow } from '@/lib/drafts';
import type { PieceCompletionRow } from '@/lib/piece-completions';
import type { SmsSendRow } from '@/lib/sms-sends';
import { FacebookIcon } from './icons/FacebookIcon';
import { FacebookPostPanel } from './FacebookPostPanel';
import { SegmentBlastPanel } from './SegmentBlastPanel';
import { SchedulePanel } from './SchedulePanel';

const STATUS_STYLES: Record<string, { label: string; pill: string }> = {
  PENDING_REVIEW: { label: 'Draft', pill: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  APPROVED: { label: 'Approved', pill: 'bg-emerald-600 text-white' },
  REJECTED: { label: 'Rejected', pill: 'bg-amber-600 text-white' },
};

const CHANNEL_LABEL: Record<string, string> = {
  sms: 'SMS',
  facebook: 'Facebook',
  instagram: 'Instagram',
  email: 'Email',
  foodpanda: 'Foodpanda',
  'in-store': 'In-store',
  whatsapp: 'WhatsApp',
  'google-business': 'Google Business',
  tiktok: 'TikTok',
};

const ASSET_TYPE_LABEL: Record<DraftPiece['assetType'], string> = {
  sms: 'SMS',
  'social-post': 'Social post',
  'paid-ad-copy': 'Ad copy',
  'email-body': 'Email body',
  'in-store-card': 'In-store card',
  'visual-brief': 'Visual brief',
  'video-brief': 'Video brief',
  'menu-change': 'Menu change',
  'process-change': 'Process change',
};

const BRIEF_ASSET_TYPES: Array<DraftPiece['assetType']> = ['visual-brief', 'video-brief'];

function channelLabel(c: string): string {
  return CHANNEL_LABEL[c.toLowerCase()] ?? c;
}

export function DraftView({
  draft,
  isRefining,
  isUpdatingStatus,
  sendingPieceIndex,
  lastSendResultByPiece,
  completionsByPiece,
  togglingPieceIndex,
  onRefine,
  onSetStatus,
  onSendSms,
  onSegmentBlastSent,
  onToggleCompletion,
}: {
  draft: DraftRow;
  isRefining: boolean;
  isUpdatingStatus: boolean;
  sendingPieceIndex: number | null;
  lastSendResultByPiece: Record<number, SmsSendRow | null>;
  completionsByPiece: Record<number, PieceCompletionRow | null>;
  togglingPieceIndex: number | null;
  onRefine: (feedback: string) => void;
  onSetStatus: (status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (pieceIndex: number, phone: string, bodyOverride: string | null) => void;
  /// Bubbled up after a segment blast completes (success or partial) so
  /// the parent activity feed can re-fetch.
  onSegmentBlastSent: () => void;
  onToggleCompletion: (
    pieceIndex: number,
    currentlyComplete: boolean,
    notes?: string | null,
  ) => void;
}) {
  const canSendSms = draft.status === 'APPROVED';
  const payload = draft.payload;
  const [showRefineForm, setShowRefineForm] = useState(false);
  const [feedback, setFeedback] = useState('');

  function submitRefine() {
    const trimmed = feedback.trim();
    if (trimmed.length < 4) return;
    onRefine(trimmed);
    setFeedback('');
    setShowRefineForm(false);
  }

  return (
    <div className="border border-primary/40 bg-primary/5 p-5 mt-3 space-y-5">
      <header>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h6 className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
            <span>Campaign draft · {payload.title}</span>
            {(() => {
              const style = STATUS_STYLES[draft.status] ?? STATUS_STYLES.PENDING_REVIEW;
              return (
                <span
                  className={`text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 ${style.pill}`}
                >
                  {style.label}
                </span>
              );
            })()}
            {draft.versionCount > 1 && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-normal">
                v{draft.version} of {draft.versionCount}
              </span>
            )}
          </h6>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {new Date(draft.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-0.5 bg-muted uppercase tracking-wider text-[10px]">
            {payload.campaignType.replace(/-/g, ' ')}
          </span>
          {(payload.channels ?? []).map((c) => (
            <span
              key={c}
              className="px-2 py-0.5 bg-white dark:bg-zinc-900 border border-border text-[10px] uppercase tracking-wider"
            >
              {channelLabel(c)}
            </span>
          ))}
          <span className="text-muted-foreground">·</span>
          <span>{payload.launchTimeline}</span>
        </div>
        {draft.feedback && (
          <p className="mt-3 text-xs text-muted-foreground border-l-2 border-primary/40 pl-3">
            <span className="font-medium text-muted-foreground uppercase tracking-wider text-[10px] mr-2">
              Refined with feedback
            </span>
            <span className="italic">&ldquo;{draft.feedback}&rdquo;</span>
          </p>
        )}
      </header>

      <section>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Pieces · ready to paste
        </p>
        <div className="space-y-3">
          {(payload.pieces ?? []).map((piece, i) => (
            <PieceCard
              key={i}
              piece={piece}
              pieceIndex={i}
              canSendSms={canSendSms}
              isSendingSms={sendingPieceIndex === i}
              lastSendResult={lastSendResultByPiece[i] ?? null}
              completion={completionsByPiece[i] ?? null}
              isTogglingCompletion={togglingPieceIndex === i}
              draftId={draft.id}
              onSendSms={(phone, body) => onSendSms(i, phone, body)}
              onSegmentBlastSent={onSegmentBlastSent}
              onToggleCompletion={(currentlyComplete, notes) =>
                onToggleCompletion(i, currentlyComplete, notes)
              }
            />
          ))}
        </div>
      </section>

      {(payload.budgetBdt != null || payload.budgetBreakdown) && (
        <section>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Budget</p>
          {payload.budgetBdt != null && (
            <p className="text-sm font-medium text-foreground mb-2">
              ৳{payload.budgetBdt.toLocaleString()}
            </p>
          )}
          {payload.budgetBreakdown && payload.budgetBreakdown.length > 0 && (
            <ul className="text-sm space-y-1">
              {payload.budgetBreakdown.map((b, i) => (
                <li key={i} className="flex justify-between text-foreground/90">
                  <span>{b.item}</span>
                  <span className="text-muted-foreground font-mono">
                    ৳{b.amountBdt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">KPIs to watch</p>
        <ul className="space-y-1.5 text-sm text-foreground/90">
          {(payload.kpis ?? []).map((k, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary mt-0.5">●</span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Execution checklist
        </p>
        <ol className="space-y-1.5 text-sm text-foreground/90 list-decimal pl-5">
          {(payload.executionChecklist ?? []).map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </section>

      {(payload.warnings?.length ?? 0) > 0 && (
        <section className="border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-2">
            Watch out
          </p>
          <ul className="space-y-1 text-xs text-amber-300">
            {(payload.warnings ?? []).map((w, i) => (
              <li key={i} className="flex gap-2">
                <span>⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-border pt-3">
        {showRefineForm ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Refine this draft
              </p>
              <button
                onClick={() => {
                  setShowRefineForm(false);
                  setFeedback('');
                }}
                className="text-muted-foreground/70 hover:text-foreground "
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Make the SMS friendlier and add a Bengali variant. Drop the FB ad piece — we're not running paid yet."
              rows={3}
              maxLength={2000}
              autoFocus
              disabled={isRefining}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary resize-y"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitRefine();
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                ⌘/Ctrl + Enter to submit · {feedback.length}/2000
              </span>
              <button
                onClick={submitRefine}
                disabled={isRefining || feedback.trim().length < 4}
                className="bg-primary hover:bg-accent disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
              >
                <Sparkles size={11} />
                {isRefining ? 'Refining…' : 'Refine draft'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowRefineForm(true)}
              disabled={isRefining || isUpdatingStatus}
              className="text-[10px] tracking-widest uppercase text-primary hover:text-accent disabled:text-muted-foreground/70 inline-flex items-center gap-1 mr-auto"
            >
              <Sparkles size={11} />
              {isRefining ? 'Refining…' : 'Refine with feedback'}
            </button>

            {draft.status === 'PENDING_REVIEW' ? (
              <>
                <button
                  onClick={() => onSetStatus('REJECTED')}
                  disabled={isUpdatingStatus || isRefining}
                  className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-amber-600 disabled:text-muted-foreground/70 inline-flex items-center gap-1 px-2 py-1 border border-border hover:border-amber-600"
                >
                  <X size={11} />
                  Reject
                </button>
                <button
                  onClick={() => onSetStatus('APPROVED')}
                  disabled={isUpdatingStatus || isRefining}
                  className="text-[10px] tracking-widest uppercase text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 disabled:text-muted-foreground inline-flex items-center gap-1 px-2 py-1"
                >
                  <Check size={11} />
                  {isUpdatingStatus ? 'Saving…' : 'Approve'}
                </button>
              </>
            ) : (
              <button
                onClick={() => onSetStatus('PENDING_REVIEW')}
                disabled={isUpdatingStatus || isRefining}
                className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-primary disabled:text-muted-foreground/70 inline-flex items-center gap-1 px-2 py-1 border border-border hover:border-primary"
              >
                <RotateCcw size={11} />
                {isUpdatingStatus ? 'Saving…' : 'Re-open'}
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

function PieceCard({
  piece,
  pieceIndex,
  canSendSms,
  isSendingSms,
  lastSendResult,
  completion,
  isTogglingCompletion,
  draftId,
  onSendSms,
  onSegmentBlastSent,
  onToggleCompletion,
}: {
  piece: DraftPiece;
  pieceIndex: number;
  canSendSms: boolean;
  isSendingSms: boolean;
  lastSendResult: SmsSendRow | null;
  completion: PieceCompletionRow | null;
  isTogglingCompletion: boolean;
  draftId: string;
  onSendSms: (phone: string, bodyOverride: string | null) => void;
  onSegmentBlastSent: () => void;
  onToggleCompletion: (currentlyComplete: boolean, notes?: string | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [showBlastForm, setShowBlastForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showFacebookForm, setShowFacebookForm] = useState(false);
  const [phone, setPhone] = useState('');
  /// The single source of truth for piece title/body/notes within this
  /// card. Initialised from the draft payload; mutated locally after a
  /// successful PATCH so the UI reflects the edit without a full
  /// dashboard re-fetch.
  const [localPiece, setLocalPiece] = useState({
    title: piece.title,
    content: piece.content,
    notes: piece.notes ?? null,
  });
  /// Per-form editable body. Reset to localPiece.content whenever the user
  /// opens the form fresh — they can edit before sending without
  /// mutating the canonical draft.
  const [editedBody, setEditedBody] = useState(piece.content);
  /// Notes-on-completion mini form. Opens when the user clicks an empty
  /// circle (so they can capture HOW they did it externally — Twilio
  /// campaign id, designer name, etc.) or clicks "Edit note" on an
  /// already-complete piece.
  const [showCompletionForm, setShowCompletionForm] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  /// Inline piece-content editor. Lets the user fix typos / tweak copy
  /// without burning a Claude refine. Persists to the draft payload in
  /// place — historical sends keep their locked body, the UI shows the
  /// latest edited content for any future actions.
  const [showEditForm, setShowEditForm] = useState(false);
  const [editTitle, setEditTitle] = useState(piece.title);
  const [editContent, setEditContent] = useState(piece.content);
  const [editNotes, setEditNotes] = useState(piece.notes ?? '');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const isBrief = BRIEF_ASSET_TYPES.includes(piece.assetType);
  const isSmsPiece = piece.assetType === 'sms';
  const showSmsControls = isSmsPiece && canSendSms;
  /// Anything destined for Facebook — both social-post pieces and
  /// paid-ad-copy pieces — can be published as a page text post once
  /// the draft is APPROVED. The user can still edit before submitting.
  const isFacebookPiece =
    piece.channel.toLowerCase() === 'facebook' &&
    (piece.assetType === 'social-post' || piece.assetType === 'paid-ad-copy');
  const showFacebookControls = isFacebookPiece && canSendSms; // same APPROVED gate
  const isComplete = !!completion;

  async function copy() {
    await navigator.clipboard.writeText(localPiece.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onCirclePress() {
    if (isComplete) {
      // Already done → toggle off immediately. Notes editing is a
      // separate action via the "Edit note" link.
      onToggleCompletion(true);
      return;
    }
    // Not yet done → open the inline form so the user can optionally
    // jot down where/how the work happened before marking it done.
    setCompletionNotes('');
    setShowCompletionForm(true);
  }

  function submitCompletion() {
    const trimmed = completionNotes.trim();
    onToggleCompletion(false, trimmed.length > 0 ? trimmed : null);
    setShowCompletionForm(false);
    setCompletionNotes('');
  }

  function openEditNotes() {
    setCompletionNotes(completion?.notes ?? '');
    setShowCompletionForm(true);
  }

  function saveEditedNotes() {
    // Editing an existing completion: re-submit the mark call with new
    // notes. The server-side upsert updates the row in place.
    const trimmed = completionNotes.trim();
    onToggleCompletion(false, trimmed.length > 0 ? trimmed : null);
    setShowCompletionForm(false);
    setCompletionNotes('');
  }

  function openEditPiece() {
    setEditTitle(localPiece.title);
    setEditContent(localPiece.content);
    setEditNotes(localPiece.notes ?? '');
    setEditError(null);
    setShowEditForm(true);
  }

  async function savePieceEdit() {
    setSavingEdit(true);
    setEditError(null);
    try {
      const trimmedTitle = editTitle.trim().slice(0, 200);
      const res = await fetch(
        `/api/drafts/${encodeURIComponent(draftId)}/pieces/${pieceIndex}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: trimmedTitle.length > 0 ? trimmedTitle : undefined,
            content: editContent,
            notes: editNotes,
          }),
        },
      );
      const json = (await res.json()) as { piece?: typeof piece; error?: string; message?: string };
      if (!res.ok || json.error) {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      if (json.piece) {
        setLocalPiece({
          title: json.piece.title,
          content: json.piece.content,
          notes: json.piece.notes ?? null,
        });
        // Reset transient form-state too so the next "Send to phone"
        // form picks up the new canonical body instead of the stale one.
        setEditedBody(json.piece.content);
      }
      setShowEditForm(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSavingEdit(false);
    }
  }

  function submitSend() {
    const trimmedPhone = phone.trim();
    if (trimmedPhone.length < 6) return;
    const trimmedBody = editedBody.trim();
    if (trimmedBody.length === 0) return;
    // Only send the override when it differs from the canonical content
    // — keeps the server-side audit row cleaner.
    const override = trimmedBody !== localPiece.content ? trimmedBody : null;
    onSendSms(trimmedPhone, override);
    setShowSendForm(false);
    setPhone('');
    setEditedBody(localPiece.content);
  }

  return (
    <div
      className={`border ${isComplete ? 'border-emerald-900/60' : 'border-border'} bg-card`}
    >
      <header
        className={`flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 ${isComplete ? 'bg-emerald-950/30' : 'bg-secondary'}`}
      >
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={onCirclePress}
            disabled={isTogglingCompletion || showCompletionForm}
            className={`inline-flex items-center justify-center ${isComplete ? 'text-emerald-400 hover:text-emerald-700' : 'text-muted-foreground/70 hover:text-emerald-600'} disabled:opacity-50`}
            title={
              isComplete
                ? completion?.source === 'integrated-sms-send'
                  ? 'Done · sent via Restora'
                  : completion?.source === 'integrated-sms-blast'
                  ? 'Done · blasted via Restora'
                  : completion?.source === 'integrated-facebook-post'
                  ? 'Done · posted to Facebook'
                  : 'Done · click to un-mark'
                : 'Mark this piece as done (e.g. sent externally, brief delivered, change made)'
            }
          >
            {isComplete ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </button>
          <span className="px-1.5 py-0.5 bg-muted uppercase tracking-wider text-[10px] text-foreground/90">
            {ASSET_TYPE_LABEL[piece.assetType]}
          </span>
          <span className="text-muted-foreground">{channelLabel(piece.channel)}</span>
          <span className="text-muted-foreground">· {localPiece.title}</span>
        </div>
        <div className="flex items-center gap-1">
          {!isBrief && (
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary px-2 py-0.5 border border-border"
            >
              <Copy size={11} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {!showEditForm && (
            <button
              onClick={openEditPiece}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary px-2 py-0.5 border border-border"
              title="Edit this piece in place (typo fix, tweak copy) without re-running Claude"
            >
              <Pencil size={11} />
              Edit
            </button>
          )}
          {showSmsControls && !showSendForm && !showBlastForm && !showScheduleForm && (
            <>
              <button
                onClick={() => setShowSendForm(true)}
                disabled={isSendingSms}
                className="inline-flex items-center gap-1 text-[10px] text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 disabled:text-muted-foreground px-2 py-0.5"
                title="Send to one phone — test send"
              >
                <Send size={11} />
                {isSendingSms ? 'Sending…' : 'Send to phone'}
              </button>
              <button
                onClick={() => setShowBlastForm(true)}
                className="inline-flex items-center gap-1 text-[10px] text-white bg-emerald-700 hover:bg-emerald-600 px-2 py-0.5"
                title="Send to every customer matching a segment filter"
              >
                <Users size={11} />
                Send to segment
              </button>
              <button
                onClick={() => setShowScheduleForm(true)}
                className="inline-flex items-center gap-1 text-[10px] text-white bg-primary hover:bg-accent px-2 py-0.5"
                title="Schedule a send for later"
              >
                <Clock size={11} />
                Schedule
              </button>
            </>
          )}
          {showFacebookControls && !showFacebookForm && (
            <button
              onClick={() => setShowFacebookForm(true)}
              className="inline-flex items-center gap-1 text-[10px] text-white bg-primary hover:bg-accent px-2 py-0.5"
              title="Publish this piece to a connected Facebook page"
            >
              <FacebookIcon size={11} />
              Post to Facebook
            </button>
          )}
        </div>
      </header>

      <pre className="px-3 py-3 text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
        {localPiece.content}
      </pre>

      {localPiece.notes && !showEditForm && (
        <p className="px-3 pb-3 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
          {localPiece.notes}
        </p>
      )}

      {showEditForm && (
        <div className="border-t border-border bg-secondary/40 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Edit piece in place — no Claude refine
            </p>
            <button
              onClick={() => {
                setShowEditForm(false);
                setEditError(null);
              }}
              className="text-muted-foreground/70 hover:text-foreground "
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Title</span>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={savingEdit}
              maxLength={200}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">Body</span>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              disabled={savingEdit}
              rows={Math.min(14, Math.max(4, editContent.split('\n').length + 1))}
              maxLength={60000}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary resize-y font-sans"
            />
            <div className="text-[10px] text-muted-foreground mt-1">{editContent.length} chars</div>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
              Notes (internal — what kind of asset is needed, target audience, etc.)
            </span>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              disabled={savingEdit}
              rows={2}
              maxLength={2000}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-primary resize-y"
            />
          </label>
          {editError && (
            <p className="text-xs text-destructive font-mono break-all">{editError}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Historical sends keep the body they were sent with; new sends use the edited version.
            </span>
            <button
              onClick={savePieceEdit}
              disabled={savingEdit || editContent.trim().length === 0}
              className="bg-primary hover:bg-accent disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
            >
              <Save size={11} />
              {savingEdit ? 'Saving…' : 'Save edits'}
            </button>
          </div>
        </div>
      )}

      {isComplete && completion && !showCompletionForm && (
        <div className="border-t border-emerald-950 bg-emerald-950/20 px-3 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 size={11} />
              <span className="font-medium">
                {completion.source === 'integrated-sms-send'
                  ? 'Sent via Restora'
                  : completion.source === 'integrated-sms-blast'
                  ? 'Blasted via Restora'
                  : completion.source === 'integrated-facebook-post'
                  ? 'Posted to Facebook'
                  : 'Marked done'}
              </span>
              <span className="text-muted-foreground">
                · {new Date(completion.completedAt).toLocaleString()}
              </span>
            </span>
            <button
              onClick={openEditNotes}
              disabled={isTogglingCompletion}
              className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
            >
              {completion.notes ? 'Edit note' : '+ Add note'}
            </button>
          </div>
          {completion.notes && (
            <p className="mt-1.5 text-foreground/90 whitespace-pre-wrap break-words">
              {completion.notes}
            </p>
          )}
        </div>
      )}

      {showCompletionForm && (
        <div className="border-t border-emerald-950 bg-emerald-950/20 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {isComplete ? 'Edit completion note' : 'Mark done — how did you do it? (optional)'}
            </p>
            <button
              onClick={() => {
                setShowCompletionForm(false);
                setCompletionNotes('');
              }}
              className="text-muted-foreground/70 hover:text-foreground "
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            value={completionNotes}
            onChange={(e) => setCompletionNotes(e.target.value)}
            placeholder={
              isSmsPiece
                ? 'e.g. Sent via Twilio · campaign id MG123… · 142 recipients'
                : 'e.g. Posted on FB page manually · briefed designer Rahim on 14 May'
            }
            rows={2}
            maxLength={500}
            autoFocus
            disabled={isTogglingCompletion}
            className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-600 resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                isComplete ? saveEditedNotes() : submitCompletion();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              ⌘/Ctrl + Enter · {completionNotes.length}/500
            </span>
            <button
              onClick={isComplete ? saveEditedNotes : submitCompletion}
              disabled={isTogglingCompletion}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
            >
              <Check size={11} />
              {isTogglingCompletion
                ? 'Saving…'
                : isComplete
                ? 'Save note'
                : 'Mark done'}
            </button>
          </div>
        </div>
      )}

      {showSmsControls && showSendForm && (
        <div className="border-t border-border/60 bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Send this SMS via Restora
            </p>
            <button
              onClick={() => {
                setShowSendForm(false);
                setPhone('');
                setEditedBody(localPiece.content);
              }}
              className="text-muted-foreground/70 hover:text-foreground "
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
              SMS body (edit before sending — fix any [DATE+X] / placeholders)
            </span>
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={Math.min(8, Math.max(3, editedBody.split('\n').length + 1))}
              maxLength={1000}
              disabled={isSendingSms}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-600 font-sans resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {editedBody.length} chars
                {editedBody !== localPiece.content && ' · edited'}
              </span>
              {editedBody !== localPiece.content && (
                <button
                  onClick={() => setEditedBody(localPiece.content)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Reset to original
                </button>
              )}
            </div>
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+8801710330040"
            disabled={isSendingSms}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSend();
            }}
            className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-emerald-600 font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Sends through your Restora SMS provider · Enter to confirm
            </span>
            <button
              onClick={submitSend}
              disabled={isSendingSms || phone.trim().length < 6 || editedBody.trim().length === 0}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
            >
              <Send size={11} />
              {isSendingSms ? 'Sending…' : 'Send SMS'}
            </button>
          </div>
        </div>
      )}

      {showSmsControls && lastSendResult && !showSendForm && (
        <SendResultLine result={lastSendResult} />
      )}

      {showSmsControls && showBlastForm && (
        <SegmentBlastPanel
          draftId={draftId}
          pieceIndex={pieceIndex}
          pieceContent={localPiece.content}
          onClose={() => setShowBlastForm(false)}
          onSent={onSegmentBlastSent}
        />
      )}

      {showSmsControls && showScheduleForm && (
        <SchedulePanel
          draftId={draftId}
          pieceIndex={pieceIndex}
          pieceContent={localPiece.content}
          onClose={() => setShowScheduleForm(false)}
        />
      )}

      {showFacebookControls && showFacebookForm && (
        <FacebookPostPanel
          draftId={draftId}
          pieceIndex={pieceIndex}
          pieceContent={localPiece.content}
          onClose={() => setShowFacebookForm(false)}
          onPosted={onSegmentBlastSent}
        />
      )}
    </div>
  );
}

function SendResultLine({ result }: { result: SmsSendRow }) {
  const isSuccess = result.status === 'SENT';
  const styles = isSuccess
    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/60'
    : 'text-amber-300 bg-amber-950/30 border-amber-900/60';
  return (
    <div className={`border-t px-3 py-2 text-[11px] font-mono ${styles}`}>
      <span className="font-medium">
        {isSuccess ? '✓ Sent' : `✗ ${result.status}`}
      </span>{' '}
      to <span>{result.toPhone}</span>
      {result.providerRequestId && (
        <span className="text-muted-foreground"> · req {result.providerRequestId}</span>
      )}
      {result.error && (
        <span className="block mt-1 break-all whitespace-pre-wrap">{result.error}</span>
      )}
      <span className="text-muted-foreground ml-2">
        {new Date(result.createdAt).toLocaleTimeString()}
      </span>
    </div>
  );
}
