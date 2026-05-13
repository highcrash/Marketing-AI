'use client';

import { useState } from 'react';
import { Copy, Sparkles, X } from 'lucide-react';

import type { DraftPiece } from '@/lib/ai/draft';
import type { DraftRow } from '@/lib/drafts';

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
  onRefine,
}: {
  draft: DraftRow;
  isRefining: boolean;
  onRefine: (feedback: string) => void;
}) {
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
          <h6 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Campaign draft · {payload.title}
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
            <PieceCard key={i} piece={piece} />
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
          <button
            onClick={() => setShowRefineForm(true)}
            disabled={isRefining}
            className="text-[10px] tracking-widest uppercase text-red-600 hover:text-red-700 disabled:text-zinc-400 inline-flex items-center gap-1"
          >
            <Sparkles size={11} />
            {isRefining ? 'Refining…' : 'Refine with feedback'}
          </button>
        )}
      </footer>
    </div>
  );
}

function PieceCard({ piece }: { piece: DraftPiece }) {
  const [copied, setCopied] = useState(false);
  const isBrief = BRIEF_ASSET_TYPES.includes(piece.assetType);

  async function copy() {
    await navigator.clipboard.writeText(piece.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
        {!isBrief && (
          <button
            onClick={copy}
            className="inline-flex items-center gap-1 text-[10px] text-zinc-600 dark:text-zinc-400 hover:text-red-600 px-2 py-0.5 border border-zinc-200 dark:border-zinc-800"
          >
            <Copy size={11} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </header>
      <pre className="px-3 py-3 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">
        {piece.content}
      </pre>
      {piece.notes && (
        <p className="px-3 pb-3 text-[11px] text-zinc-500 border-t border-zinc-100 dark:border-zinc-900 pt-2">
          {piece.notes}
        </p>
      )}
    </div>
  );
}
