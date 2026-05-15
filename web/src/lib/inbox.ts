/**
 * Derive a "work queue" from the current analysis state.
 *
 * The dashboard's home view is a single stream of action items rather
 * than a stats summary — this file is the pure function that decides
 * which items appear in that stream. Inputs are the already-loaded
 * analysis bundle (result + drafts + completions + plan); output is a
 * sorted list of typed action cards.
 *
 * Stays a thin transform so it can run in the browser. No DB / network.
 */

import type { AnalysisResult, Recommendation } from './ai/analyze';
import type { CampaignDraftPayload, DraftPiece } from './ai/draft';
import type { DraftRow } from './drafts';
import type { PieceCompletionRow } from './piece-completions';
import type { CampaignPlan, PlanTask } from './plan-types';

export type InboxKind =
  /// A recommendation that has no draft yet. Primary action: Draft.
  | 'draft-rec'
  /// A draft that's still PENDING_REVIEW. Primary action: Approve/Reject.
  | 'approve-draft'
  /// An APPROVED draft with at least one un-completed send-capable piece.
  /// Primary action: Send (SMS) or Post (FB/IG).
  | 'send-piece'
  /// An APPROVED draft with an un-completed brief/asset piece (visual/
  /// video brief, menu change, in-store card, etc.). Primary action:
  /// Mark done with note/attachment.
  | 'execute-piece'
  /// A plan task with date <= today and the corresponding rec has no
  /// draft yet. Primary action: Draft this rec.
  | 'plan-overdue-draft'
  /// A plan task with date in the next 7 days, regardless of draft
  /// state — surfaces "what's coming up." Primary action: Open rec.
  | 'plan-upcoming';

export interface InboxItem {
  /// Stable id: "{kind}:{draftId|recIndex}:{pieceIndex?}". Used for
  /// React keys and for the dashboard's selected-item state.
  id: string;
  kind: InboxKind;
  /// The recommendation this item targets. Always present — every
  /// queue item is anchored to one rec.
  recIndex: number;
  recTitle: string;
  /// One-line action label (e.g. "Approve draft", "Send SMS blast").
  title: string;
  /// Short context line under the title. Keep <80 chars.
  subtitle: string;
  /// Priority of the underlying rec — drives sort order within a kind.
  priority: Recommendation['priority'];
  /// ISO 8601. Optional — only set when there's a real deadline (plan
  /// task date, scheduled send fire time). Drives sort within a kind.
  dueAt: string | null;
  /// When set, the item carries one of these severities for the badge:
  ///   'now' = overdue or fires within 24h
  ///   'soon' = within 7 days
  ///   'later' = >7 days
  ///   'none' = no time component
  urgency: 'now' | 'soon' | 'later' | 'none';
  /// The draft this item references (when applicable). Lets the UI
  /// open the existing detail flow without re-deriving the row.
  draftId: string | null;
  pieceIndex: number | null;
  /// For send-piece items, what channel this piece will go out on so
  /// the card can show the right icon + verb.
  channel: PieceChannel | null;
}

export type PieceChannel = 'sms' | 'facebook' | 'instagram' | 'email' | 'manual';

interface InboxInputs {
  result: AnalysisResult;
  drafts: Record<number, DraftRow>;
  completions: Record<string, PieceCompletionRow>;
  latestPlan: CampaignPlan | null;
  now?: Date;
}

const DAY_MS = 24 * 3600 * 1000;
const PRIORITY_RANK: Record<Recommendation['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildInbox(inputs: InboxInputs): InboxItem[] {
  const now = inputs.now ?? new Date();
  const nowMs = now.getTime();
  const items: InboxItem[] = [];

  const planTasksByRec = new Map<number, PlanTask[]>();
  if (inputs.latestPlan) {
    for (const t of inputs.latestPlan.tasks) {
      const arr = planTasksByRec.get(t.recIndex) ?? [];
      arr.push(t);
      planTasksByRec.set(t.recIndex, arr);
    }
  }

  for (let recIndex = 0; recIndex < inputs.result.recommendations.length; recIndex++) {
    const rec = inputs.result.recommendations[recIndex];
    const draft = inputs.drafts[recIndex];
    const recTitle = rec.title;

    // Case 1: no draft yet → "Draft this rec" item.
    // Promoted to plan-overdue-draft if a plan task references it and is
    // due / past due.
    if (!draft) {
      const tasks = planTasksByRec.get(recIndex) ?? [];
      const overdueTask = tasks
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .find((t) => taskDateMs(t) <= nowMs + DAY_MS);
      if (overdueTask) {
        items.push({
          id: `plan-overdue-draft:${recIndex}`,
          kind: 'plan-overdue-draft',
          recIndex,
          recTitle,
          title: 'Draft this rec — plan task is due',
          subtitle: `${overdueTask.title} · scheduled ${overdueTask.date}`,
          priority: rec.priority,
          dueAt: overdueTask.date,
          urgency: urgencyFromMs(taskDateMs(overdueTask), nowMs),
          draftId: null,
          pieceIndex: null,
          channel: null,
        });
      } else {
        items.push({
          id: `draft-rec:${recIndex}`,
          kind: 'draft-rec',
          recIndex,
          recTitle,
          title: 'Draft this campaign',
          subtitle: `${categoryLabel(rec.category)} · ${rec.priority} priority`,
          priority: rec.priority,
          dueAt: null,
          urgency: 'none',
          draftId: null,
          pieceIndex: null,
          channel: null,
        });
      }
      continue;
    }

    // Case 2: PENDING_REVIEW → ask owner to approve or reject.
    if (draft.status === 'PENDING_REVIEW') {
      items.push({
        id: `approve-draft:${draft.id}`,
        kind: 'approve-draft',
        recIndex,
        recTitle,
        title: 'Approve or refine this draft',
        subtitle: summariseDraft(draft.payload),
        priority: rec.priority,
        dueAt: null,
        urgency: 'none',
        draftId: draft.id,
        pieceIndex: null,
        channel: null,
      });
      continue;
    }

    // Case 3: REJECTED → silent. The card can be re-opened via the
    // recs section if the owner wants to revisit.
    if (draft.status === 'REJECTED') continue;

    // Case 4: APPROVED → one queue item per piece that isn't done yet.
    if (draft.status === 'APPROVED') {
      const pieces = draft.payload.pieces ?? [];
      for (let pieceIndex = 0; pieceIndex < pieces.length; pieceIndex++) {
        const piece = pieces[pieceIndex];
        const key = `${draft.id}:${pieceIndex}`;
        if (inputs.completions[key]) continue;

        const channel = inferChannel(piece);
        const isSendable = channel === 'sms' || channel === 'facebook' || channel === 'instagram';

        items.push({
          id: `${isSendable ? 'send' : 'execute'}-piece:${draft.id}:${pieceIndex}`,
          kind: isSendable ? 'send-piece' : 'execute-piece',
          recIndex,
          recTitle,
          title: isSendable
            ? `${sendVerb(channel)} · ${piece.title}`
            : `Do: ${piece.title}`,
          subtitle: `${assetLabel(piece.assetType)} · ${truncate(piece.content, 70)}`,
          priority: rec.priority,
          dueAt: null,
          urgency: 'none',
          draftId: draft.id,
          pieceIndex,
          channel,
        });
      }
    }
  }

  // Plan-upcoming items: surface the next 5 days of plan tasks
  // regardless of draft state, so the owner sees what's coming. Skip
  // any task we already represented as plan-overdue-draft.
  if (inputs.latestPlan) {
    const seenAsOverdue = new Set(
      items.filter((i) => i.kind === 'plan-overdue-draft').map((i) => i.recIndex),
    );
    const horizon = nowMs + 7 * DAY_MS;
    for (const task of inputs.latestPlan.tasks) {
      const ms = taskDateMs(task);
      if (ms < nowMs - DAY_MS) continue; // already past
      if (ms > horizon) continue;
      if (seenAsOverdue.has(task.recIndex)) continue;
      const rec = inputs.result.recommendations[task.recIndex];
      if (!rec) continue;
      items.push({
        id: `plan-upcoming:${task.recIndex}:${task.date}`,
        kind: 'plan-upcoming',
        recIndex: task.recIndex,
        recTitle: rec.title,
        title: `Plan: ${task.title}`,
        subtitle: `${task.date}${task.hour !== null ? ` · ${task.hour}:00` : ''} · ${categoryLabel(rec.category)}`,
        priority: rec.priority,
        dueAt: task.date,
        urgency: urgencyFromMs(ms, nowMs),
        draftId: null,
        pieceIndex: null,
        channel: null,
      });
    }
  }

  return items.sort(compareItems);
}

/// Stable ordering: urgency first, then priority of the underlying rec,
/// then kind (action-required before just-FYI), then recIndex for
/// determinism so the list doesn't shuffle on every render.
function compareItems(a: InboxItem, b: InboxItem): number {
  const urgRank = (u: InboxItem['urgency']) =>
    u === 'now' ? 0 : u === 'soon' ? 1 : u === 'later' ? 2 : 3;
  const kindRank = (k: InboxKind) =>
    k === 'approve-draft'
      ? 0
      : k === 'send-piece'
      ? 1
      : k === 'execute-piece'
      ? 2
      : k === 'plan-overdue-draft'
      ? 3
      : k === 'draft-rec'
      ? 4
      : 5;
  return (
    urgRank(a.urgency) - urgRank(b.urgency) ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    kindRank(a.kind) - kindRank(b.kind) ||
    a.recIndex - b.recIndex
  );
}

function urgencyFromMs(targetMs: number, nowMs: number): InboxItem['urgency'] {
  const diff = targetMs - nowMs;
  if (diff <= DAY_MS) return 'now';
  if (diff <= 7 * DAY_MS) return 'soon';
  return 'later';
}

function taskDateMs(t: PlanTask): number {
  const baseDay = new Date(`${t.date}T00:00:00`).getTime();
  return Number.isFinite(baseDay) ? baseDay + (t.hour ?? 12) * 3600 * 1000 : Date.now();
}

function summariseDraft(p: CampaignDraftPayload): string {
  const pieceCount = p.pieces?.length ?? 0;
  const channelStr = (p.channels ?? []).slice(0, 3).join(', ');
  return `${pieceCount} piece${pieceCount === 1 ? '' : 's'}${channelStr ? ` · ${channelStr}` : ''}`;
}

function inferChannel(piece: DraftPiece): PieceChannel {
  const c = piece.channel.toLowerCase();
  if (piece.assetType === 'sms' || c === 'sms') return 'sms';
  if (c === 'facebook' || c === 'fb') return 'facebook';
  if (c === 'instagram' || c === 'ig') return 'instagram';
  if (piece.assetType === 'email-body' || c === 'email') return 'email';
  return 'manual';
}

function sendVerb(c: PieceChannel): string {
  if (c === 'sms') return 'Send SMS';
  if (c === 'facebook') return 'Post to Facebook';
  if (c === 'instagram') return 'Post to Instagram';
  if (c === 'email') return 'Send email';
  return 'Do';
}

const ASSET_LABEL: Record<string, string> = {
  sms: 'SMS',
  'social-post': 'Social post',
  'paid-ad-copy': 'Ad copy',
  'email-body': 'Email',
  'in-store-card': 'In-store',
  'visual-brief': 'Visual brief',
  'video-brief': 'Video brief',
  'menu-change': 'Menu change',
  'process-change': 'Process change',
};

function assetLabel(t: string): string {
  return ASSET_LABEL[t] ?? t;
}

const CATEGORY_LABEL: Record<Recommendation['category'], string> = {
  acquisition: 'Acquisition',
  retention: 'Retention',
  pricing: 'Pricing',
  'product-mix': 'Product mix',
  'channel-strategy': 'Channel strategy',
  content: 'Content',
  operations: 'Operations',
  brand: 'Brand',
};

function categoryLabel(c: Recommendation['category']): string {
  return CATEGORY_LABEL[c] ?? c;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/// Filter chips the InboxView surfaces above the queue. Defined here so
/// the filter contract stays single-source-of-truth.
export const INBOX_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'approve', label: 'Approve', kinds: ['approve-draft'] as InboxKind[] },
  { id: 'send', label: 'Send', kinds: ['send-piece'] as InboxKind[] },
  { id: 'execute', label: 'Execute', kinds: ['execute-piece'] as InboxKind[] },
  { id: 'draft', label: 'To draft', kinds: ['draft-rec', 'plan-overdue-draft'] as InboxKind[] },
  { id: 'plan', label: 'Upcoming', kinds: ['plan-upcoming'] as InboxKind[] },
] as const;

export type InboxFilterId = (typeof INBOX_FILTERS)[number]['id'];

export function applyFilter(items: InboxItem[], filter: InboxFilterId): InboxItem[] {
  if (filter === 'all') return items;
  const def = INBOX_FILTERS.find((f) => f.id === filter);
  if (!def || !('kinds' in def)) return items;
  const allowed = new Set(def.kinds);
  return items.filter((i) => allowed.has(i.kind));
}
