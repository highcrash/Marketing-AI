import { prisma } from './db';

export type ActivityKind = 'draft' | 'refine' | 'status' | 'send' | 'blast' | 'completion';

export interface ActivityItem {
  /// ISO 8601 timestamp. Items are sorted desc by this.
  at: string;
  kind: ActivityKind;
  recIndex: number;
  recTitle: string;
  /// One-line human summary suitable for a list item.
  summary: string;
  /// Optional status tag for colour coding (Approved / Sent / Failed / etc.)
  tone?: 'success' | 'warning' | 'info' | 'danger';
}

/// Pulls drafts, single SMS sends, and segment blasts for one analysis
/// and normalises them into a single reverse-chronological timeline.
/// Returns the most recent 50 events.
///
/// This is read-only and idempotent; the dashboard re-fetches it after
/// every state-changing action (send, blast, approve) via a refreshKey.
export async function getAnalysisActivity(
  analysisId: string,
): Promise<{ items: ActivityItem[] }> {
  const [drafts, sends, blasts, completions] = await Promise.all([
    prisma.campaignDraft.findMany({
      where: { analysisId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        recIndex: true,
        recTitle: true,
        status: true,
        feedback: true,
        parentDraftId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.smsSendEvent.findMany({
      where: { draft: { analysisId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        pieceIndex: true,
        toPhone: true,
        status: true,
        error: true,
        createdAt: true,
        draft: { select: { recIndex: true, recTitle: true } },
      },
      take: 100,
    }),
    prisma.smsBlastEvent.findMany({
      where: { draft: { analysisId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        pieceIndex: true,
        segmentLabel: true,
        recipientCount: true,
        sentCount: true,
        failedCount: true,
        campaignTag: true,
        status: true,
        error: true,
        createdAt: true,
        draft: { select: { recIndex: true, recTitle: true } },
      },
      take: 100,
    }),
    prisma.pieceCompletion.findMany({
      where: { draft: { analysisId } },
      orderBy: { completedAt: 'desc' },
      select: {
        pieceIndex: true,
        source: true,
        notes: true,
        attachmentName: true,
        completedAt: true,
        draft: { select: { recIndex: true, recTitle: true } },
      },
      take: 100,
    }),
  ]);

  const items: ActivityItem[] = [];

  for (const d of drafts) {
    const isRefine = d.parentDraftId !== null;
    items.push({
      at: d.createdAt.toISOString(),
      kind: isRefine ? 'refine' : 'draft',
      recIndex: d.recIndex,
      recTitle: d.recTitle,
      summary: isRefine
        ? `Refined draft${d.feedback ? `: "${d.feedback.slice(0, 80)}${d.feedback.length > 80 ? '…' : ''}"` : ''}`
        : 'Drafted campaign',
      tone: 'info',
    });
    // Surface APPROVED/REJECTED as a separate status event if updatedAt
    // diverges from createdAt — best-effort signal since we don't have a
    // separate status_changes audit table.
    if (
      (d.status === 'APPROVED' || d.status === 'REJECTED') &&
      d.updatedAt.getTime() - d.createdAt.getTime() > 1000
    ) {
      items.push({
        at: d.updatedAt.toISOString(),
        kind: 'status',
        recIndex: d.recIndex,
        recTitle: d.recTitle,
        summary: d.status === 'APPROVED' ? 'Approved draft' : 'Rejected draft',
        tone: d.status === 'APPROVED' ? 'success' : 'warning',
      });
    }
  }

  for (const s of sends) {
    const ok = s.status === 'SENT';
    items.push({
      at: s.createdAt.toISOString(),
      kind: 'send',
      recIndex: s.draft.recIndex,
      recTitle: s.draft.recTitle,
      summary: ok ? `Sent SMS to ${s.toPhone}` : `SMS to ${s.toPhone} — ${s.status}`,
      tone: ok ? 'success' : 'danger',
    });
  }

  for (const b of blasts) {
    const recip = b.recipientCount;
    const tone: ActivityItem['tone'] =
      b.status === 'COMPLETE' ? 'success' : b.status === 'PARTIAL' ? 'warning' : 'danger';
    items.push({
      at: b.createdAt.toISOString(),
      kind: 'blast',
      recIndex: b.draft.recIndex,
      recTitle: b.draft.recTitle,
      summary:
        b.status === 'COMPLETE'
          ? `Blast sent to ${recip} customers · ${b.segmentLabel}`
          : b.status === 'PARTIAL'
          ? `Blast partial: ${b.sentCount}/${recip} sent · ${b.segmentLabel}`
          : `Blast failed${b.error ? `: ${b.error.slice(0, 80)}` : ''} · ${b.segmentLabel}`,
      tone,
    });
  }

  for (const c of completions) {
    const isAuto = c.source !== 'manual';
    let summary: string;
    if (c.source === 'integrated-facebook-post') {
      summary = c.notes ? `Posted to Facebook: ${c.notes.slice(0, 80)}` : 'Posted to Facebook';
    } else if (isAuto) {
      summary = `Auto-marked piece done (${c.source})`;
    } else if (c.notes) {
      summary = `Marked piece done: ${c.notes.slice(0, 80)}`;
    } else {
      summary = 'Marked piece done (handled externally)';
    }
    if (c.attachmentName) {
      summary += ` · 📎 ${c.attachmentName}`;
    }
    items.push({
      at: c.completedAt.toISOString(),
      kind: 'completion',
      recIndex: c.draft.recIndex,
      recTitle: c.draft.recTitle,
      summary,
      tone: 'success',
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { items: items.slice(0, 50) };
}
