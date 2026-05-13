/**
 * Month-to-date operational stats across all analyses for a business.
 *
 * Anthropic cost estimate uses approximate Opus 4.7 list pricing as of
 * model release. Set ANTHROPIC_INPUT_USD_PER_M / ANTHROPIC_OUTPUT_USD_PER_M
 * / ANTHROPIC_CACHE_WRITE_USD_PER_M / ANTHROPIC_CACHE_READ_USD_PER_M in
 * env to override (e.g. when using Sonnet, or after a price change).
 */

import { prisma } from './db';

interface UsageRow {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const DEFAULT_RATES = {
  inputPerM: 15, // USD per 1M input tokens — Opus 4.7 baseline
  outputPerM: 75,
  cacheWritePerM: 18.75, // ~1.25× input
  cacheReadPerM: 1.5, // ~0.1× input
};

function rates() {
  const env = process.env;
  const n = (k: string, fallback: number) =>
    env[k] && Number.isFinite(Number(env[k])) ? Number(env[k]) : fallback;
  return {
    inputPerM: n('ANTHROPIC_INPUT_USD_PER_M', DEFAULT_RATES.inputPerM),
    outputPerM: n('ANTHROPIC_OUTPUT_USD_PER_M', DEFAULT_RATES.outputPerM),
    cacheWritePerM: n('ANTHROPIC_CACHE_WRITE_USD_PER_M', DEFAULT_RATES.cacheWritePerM),
    cacheReadPerM: n('ANTHROPIC_CACHE_READ_USD_PER_M', DEFAULT_RATES.cacheReadPerM),
  };
}

function estimateUsdCost(rows: UsageRow[]): number {
  const r = rates();
  let total = 0;
  for (const row of rows) {
    total += (row.inputTokens / 1_000_000) * r.inputPerM;
    total += (row.outputTokens / 1_000_000) * r.outputPerM;
    total += (row.cacheWriteTokens / 1_000_000) * r.cacheWritePerM;
    total += (row.cacheReadTokens / 1_000_000) * r.cacheReadPerM;
  }
  return total;
}

export interface OperationalStats {
  /// ISO 8601 — earliest moment included in counts.
  since: string;
  /// ISO 8601 — moment the snapshot was taken.
  generatedAt: string;
  audits: number;
  drafts: number;
  draftsApproved: number;
  draftsRejected: number;
  draftsPending: number;
  refines: number;
  singleSends: number;
  singleSendsSuccess: number;
  blasts: number;
  blastRecipients: number;
  blastSent: number;
  scheduledPending: number;
  recurringActive: number;
  piecesCompleted: number;
  estimatedAiSpendUsd: number;
}

/// Default window is the start of the current calendar month in the
/// SERVER's timezone (Node's local TZ; usually UTC on a deployed host
/// and Asia/Dhaka on the user's local dev box). For consistent BD-month
/// boundaries on a UTC host we'd need explicit timezone arithmetic —
/// not bothering until someone notices the drift.
function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export async function getOperationalStats(businessId: string): Promise<OperationalStats> {
  const since = monthStart();

  const [
    analyses,
    drafts,
    sends,
    blasts,
    scheduledPending,
    recurringActive,
    piecesCompleted,
  ] = await Promise.all([
    prisma.analysis.findMany({
      where: { businessId, createdAt: { gte: since } },
      select: {
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
      },
    }),
    prisma.campaignDraft.findMany({
      where: {
        createdAt: { gte: since },
        analysis: { businessId },
      },
      select: {
        status: true,
        parentDraftId: true,
        inputTokens: true,
        outputTokens: true,
        cacheReadTokens: true,
        cacheWriteTokens: true,
      },
    }),
    prisma.smsSendEvent.findMany({
      where: {
        createdAt: { gte: since },
        draft: { analysis: { businessId } },
      },
      select: { status: true },
    }),
    prisma.smsBlastEvent.findMany({
      where: {
        createdAt: { gte: since },
        draft: { analysis: { businessId } },
      },
      select: { recipientCount: true, sentCount: true, status: true },
    }),
    prisma.scheduledSend.count({
      where: {
        status: 'PENDING',
        draft: { analysis: { businessId } },
      },
    }),
    prisma.recurringSchedule.count({
      where: {
        active: true,
        draft: { analysis: { businessId } },
      },
    }),
    prisma.pieceCompletion.count({
      where: {
        completedAt: { gte: since },
        draft: { analysis: { businessId } },
      },
    }),
  ]);

  // Latest draft per recIndex per analysis defines its "current" state —
  // but for monthly counts we want to know how many draft REQUESTS were
  // made, including refinements. `drafts` here is every CampaignDraft
  // row created this month, so the count is right and we just split by
  // refinement (parentDraftId non-null) and status.
  const draftsRefined = drafts.filter((d) => d.parentDraftId !== null).length;
  const draftsApproved = drafts.filter((d) => d.status === 'APPROVED').length;
  const draftsRejected = drafts.filter((d) => d.status === 'REJECTED').length;
  const draftsPending = drafts.filter((d) => d.status === 'PENDING_REVIEW').length;

  const singleSendsSuccess = sends.filter((s) => s.status === 'SENT').length;
  const blastRecipients = blasts.reduce((sum, b) => sum + b.recipientCount, 0);
  const blastSent = blasts.reduce((sum, b) => sum + b.sentCount, 0);

  const usd = estimateUsdCost([
    ...analyses.map((a) => ({
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      cacheReadTokens: a.cacheReadTokens,
      cacheWriteTokens: a.cacheWriteTokens,
    })),
    ...drafts.map((d) => ({
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheReadTokens: d.cacheReadTokens,
      cacheWriteTokens: d.cacheWriteTokens,
    })),
  ]);

  return {
    since: since.toISOString(),
    generatedAt: new Date().toISOString(),
    audits: analyses.length,
    drafts: drafts.length - draftsRefined,
    draftsApproved,
    draftsRejected,
    draftsPending,
    refines: draftsRefined,
    singleSends: sends.length,
    singleSendsSuccess,
    blasts: blasts.length,
    blastRecipients,
    blastSent,
    scheduledPending,
    recurringActive,
    piecesCompleted,
    estimatedAiSpendUsd: Math.round(usd * 100) / 100,
  };
}
