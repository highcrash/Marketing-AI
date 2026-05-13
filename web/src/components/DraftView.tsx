'use client';

import { useState } from 'react';
import { Check, Clock, Copy, RotateCcw, Send, Sparkles, Users, X } from 'lucide-react';

import type { DraftPiece } from '@/lib/ai/draft';
import type { DraftRow } from '@/lib/drafts';
import type { SmsSendRow } from '@/lib/sms-sends';
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
  onRefine,
  onSetStatus,
  onSendSms,
  onSegmentBlastSent,
}: {
  draft: DraftRow;
  isRefining: boolean;
  isUpdatingStatus: boolean;
  sendingPieceIndex: number | null;
  lastSendResultByPiece: Record<number, SmsSendRow | null>;
  onRefine: (feedback: string) => void;
  onSetStatus: (status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED') => void;
  onSendSms: (pieceIndex: number, phone: string) => void;
  /// Bubbled up after a segment blast completes (success or partial) so
  /// the parent activity feed can re-fetch.
  onSegmentBlastSent: () => void;
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
    <div className="border border-red-300 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 p-5 mt-3 space-y-5">
      <header>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h6 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
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
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-normal">
                v{draft.version} of {draft.versionCount}
              </span>
            )}
          </h6>
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            {new Date(draft.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 uppercase tracking-wider text-[10px]">
            {payload.campaignType.replace(/-/g, ' ')}
          </span>
          {payload.channels.map((c) => (
            <span
              key={c}
              className="px-2 py-0.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[10px] uppercase tracking-wider"
            >
              {channelLabel(c)}
            </span>
          ))}
          <span className="text-zinc-500">·</span>
          <span>{payload.launchTimeline}</span>
        </div>
        {draft.feedback && (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400 border-l-2 border-red-300 dark:border-red-800 pl-3">
            <span className="font-medium text-zinc-500 uppercase tracking-wider text-[10px] mr-2">
              Refined with feedback
            </span>
            <span className="italic">&ldquo;{draft.feedback}&rdquo;</span>
          </p>
        )}
      </header>

      <section>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
          Pieces · ready to paste
        </p>
        <div className="space-y-3">
          {payload.pieces.map((piece, i) => (
            <PieceCard
              key={i}
              piece={piece}
              pieceIndex={i}
              canSendSms={canSendSms}
              isSendingSms={sendingPieceIndex === i}
              lastSendResult={lastSendResultByPiece[i] ?? null}
              draftId={draft.id}
              onSendSms={(phone) => onSendSms(i, phone)}
              onSegmentBlastSent={onSegmentBlastSent}
            />
          ))}
        </div>
      </section>

      {(payload.budgetBdt != null || payload.budgetBreakdown) && (
        <section>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Budget</p>
          {payload.budgetBdt != null && (
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
              ৳{payload.budgetBdt.toLocaleString()}
            </p>
          )}
          {payload.budgetBreakdown && payload.budgetBreakdown.length > 0 && (
            <ul className="text-sm space-y-1">
              {payload.budgetBreakdown.map((b, i) => (
                <li key={i} className="flex justify-between text-zinc-700 dark:text-zinc-300">
                  <span>{b.item}</span>
                  <span className="text-zinc-500 font-mono">
                    ৳{b.amountBdt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">KPIs to watch</p>
        <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          {payload.kpis.map((k, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-red-600 mt-0.5">●</span>
              <span>{k}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
          Execution checklist
        </p>
        <ol className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 list-decimal pl-5">
          {payload.executionChecklist.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </section>

      {payload.warnings.length > 0 && (
        <section className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <p className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-500 mb-2">
            Watch out
          </p>
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {payload.warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span>⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-zinc-200 dark:border-zinc-800 pt-3">
        {showRefineForm ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Refine this draft
              </p>
              <button
                onClick={() => {
                  setShowRefineForm(false);
                  setFeedback('');
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
              className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 px-3 py-2 placeholder:text-zinc-400 focus:outline-none focus:border-red-600 resize-y"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitRefine();
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">
                ⌘/Ctrl + Enter to submit · {feedback.length}/2000
              </span>
              <button
                onClick={submitRefine}
                disabled={isRefining || feedback.trim().length < 4}
                className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
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
              className="text-[10px] tracking-widest uppercase text-red-600 hover:text-red-700 disabled:text-zinc-400 inline-flex items-center gap-1 mr-auto"
            >
              <Sparkles size={11} />
              {isRefining ? 'Refining…' : 'Refine with feedback'}
            </button>

            {draft.status === 'PENDING_REVIEW' ? (
              <>
                <button
                  onClick={() => onSetStatus('REJECTED')}
                  disabled={isUpdatingStatus || isRefining}
                  className="text-[10px] tracking-widest uppercase text-zinc-600 dark:text-zinc-400 hover:text-amber-600 disabled:text-zinc-400 inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-amber-600"
                >
                  <X size={11} />
                  Reject
                </button>
                <button
                  onClick={() => onSetStatus('APPROVED')}
                  disabled={isUpdatingStatus || isRefining}
                  className="text-[10px] tracking-widest uppercase text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 disabled:text-zinc-500 inline-flex items-center gap-1 px-2 py-1"
                >
                  <Check size={11} />
                  {isUpdatingStatus ? 'Saving…' : 'Approve'}
                </button>
              </>
            ) : (
              <button
                onClick={() => onSetStatus('PENDING_REVIEW')}
                disabled={isUpdatingStatus || isRefining}
                className="text-[10px] tracking-widest uppercase text-zinc-600 dark:text-zinc-400 hover:text-red-600 disabled:text-zinc-400 inline-flex items-center gap-1 px-2 py-1 border border-zinc-200 dark:border-zinc-800 hover:border-red-600"
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
  draftId,
  onSendSms,
  onSegmentBlastSent,
}: {
  piece: DraftPiece;
  pieceIndex: number;
  canSendSms: boolean;
  isSendingSms: boolean;
  lastSendResult: SmsSendRow | null;
  draftId: string;
  onSendSms: (phone: string) => void;
  onSegmentBlastSent: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [showBlastForm, setShowBlastForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [phone, setPhone] = useState('');
  const isBrief = BRIEF_ASSET_TYPES.includes(piece.assetType);
  const isSmsPiece = piece.assetType === 'sms';
  const showSmsControls = isSmsPiece && canSendSms;

  async function copy() {
    await navigator.clipboard.writeText(piece.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function submitSend() {
    const trimmed = phone.trim();
    if (trimmed.length < 6) return;
    onSendSms(trimmed);
    setShowSendForm(false);
    setPhone('');
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 uppercase tracking-wider text-[10px] text-zinc-700 dark:text-zinc-300">
            {ASSET_TYPE_LABEL[piece.assetType]}
          </span>
          <span className="text-zinc-500">{channelLabel(piece.channel)}</span>
          <span className="text-zinc-600 dark:text-zinc-400">· {piece.title}</span>
        </div>
        <div className="flex items-center gap-1">
          {!isBrief && (
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-red-600 px-2 py-0.5 border border-zinc-200 dark:border-zinc-800"
            >
              <Copy size={11} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          {showSmsControls && !showSendForm && !showBlastForm && !showScheduleForm && (
            <>
              <button
                onClick={() => setShowSendForm(true)}
                disabled={isSendingSms}
                className="inline-flex items-center gap-1 text-[10px] text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 disabled:text-zinc-500 px-2 py-0.5"
                title="Send to one phone — test send"
              >
                <Send size={11} />
                {isSendingSms ? 'Sending…' : 'Send to phone'}
              </button>
              <button
                onClick={() => setShowBlastForm(true)}
                className="inline-flex items-center gap-1 text-[10px] text-white bg-emerald-700 hover:bg-emerald-800 px-2 py-0.5"
                title="Send to every customer matching a segment filter"
              >
                <Users size={11} />
                Send to segment
              </button>
              <button
                onClick={() => setShowScheduleForm(true)}
                className="inline-flex items-center gap-1 text-[10px] text-white bg-blue-600 hover:bg-blue-700 px-2 py-0.5"
                title="Schedule a send for later"
              >
                <Clock size={11} />
                Schedule
              </button>
            </>
          )}
        </div>
      </header>

      <pre className="px-3 py-3 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
        {piece.content}
      </pre>

      {piece.notes && (
        <p className="px-3 pb-3 text-[11px] text-zinc-500 border-t border-zinc-100 dark:border-zinc-900 pt-2">
          {piece.notes}
        </p>
      )}

      {showSmsControls && showSendForm && (
        <div className="border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              Send this SMS via Restora
            </p>
            <button
              onClick={() => {
                setShowSendForm(false);
                setPhone('');
              }}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              aria-label="Cancel"
            >
              <X size={14} />
            </button>
          </div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+8801710330040"
            autoFocus
            disabled={isSendingSms}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSend();
            }}
            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 px-3 py-2 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-600 font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">
              Sends through your Restora SMS provider · Enter to confirm
            </span>
            <button
              onClick={submitSend}
              disabled={isSendingSms || phone.trim().length < 6}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
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
          onClose={() => setShowBlastForm(false)}
          onSent={onSegmentBlastSent}
        />
      )}

      {showSmsControls && showScheduleForm && (
        <SchedulePanel
          draftId={draftId}
          pieceIndex={pieceIndex}
          onClose={() => setShowScheduleForm(false)}
        />
      )}
    </div>
  );
}

function SendResultLine({ result }: { result: SmsSendRow }) {
  const isSuccess = result.status === 'SENT';
  const styles = isSuccess
    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900'
    : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900';
  return (
    <div className={`border-t px-3 py-2 text-[11px] font-mono ${styles}`}>
      <span className="font-medium">
        {isSuccess ? '✓ Sent' : `✗ ${result.status}`}
      </span>{' '}
      to <span>{result.toPhone}</span>
      {result.providerRequestId && (
        <span className="text-zinc-500"> · req {result.providerRequestId}</span>
      )}
      {result.error && (
        <span className="block mt-1 break-all whitespace-pre-wrap">{result.error}</span>
      )}
      <span className="text-zinc-500 ml-2">
        {new Date(result.createdAt).toLocaleTimeString()}
      </span>
    </div>
  );
}
