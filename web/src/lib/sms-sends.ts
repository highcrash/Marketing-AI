import { prisma } from './db';

export interface SmsSendRow {
  id: string;
  draftId: string;
  pieceIndex: number;
  toPhone: string;
  body: string;
  campaignTag: string | null;
  status: string;
  providerRequestId: string | null;
  providerStatus: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToSend(row: {
  id: string;
  draftId: string;
  pieceIndex: number;
  toPhone: string;
  body: string;
  campaignTag: string | null;
  status: string;
  providerRequestId: string | null;
  providerStatus: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SmsSendRow {
  return {
    id: row.id,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    toPhone: row.toPhone,
    body: row.body,
    campaignTag: row.campaignTag,
    status: row.status,
    providerRequestId: row.providerRequestId,
    providerStatus: row.providerStatus,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createPendingSmsSend(params: {
  draftId: string;
  pieceIndex: number;
  toPhone: string;
  body: string;
  campaignTag: string | null;
}): Promise<SmsSendRow> {
  const row = await prisma.smsSendEvent.create({
    data: {
      draftId: params.draftId,
      pieceIndex: params.pieceIndex,
      toPhone: params.toPhone,
      body: params.body,
      campaignTag: params.campaignTag,
      status: 'PENDING',
    },
  });
  return rowToSend(row);
}

export async function markSmsSendResult(
  id: string,
  result: {
    status: 'SENT' | 'FAILED' | 'PROVIDER_ERROR';
    providerRequestId?: string | null;
    providerStatus?: string | null;
    error?: string | null;
  },
): Promise<SmsSendRow> {
  const row = await prisma.smsSendEvent.update({
    where: { id },
    data: {
      status: result.status,
      providerRequestId: result.providerRequestId ?? null,
      providerStatus: result.providerStatus ?? null,
      error: result.error ?? null,
    },
  });
  return rowToSend(row);
}

export async function listSendsByDraft(draftId: string): Promise<SmsSendRow[]> {
  const rows = await prisma.smsSendEvent.findMany({
    where: { draftId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(rowToSend);
}

/// Returns a Map of pieceIndex → SmsSendRow[] (newest first) so the UI
/// can render per-piece send history cheaply.
export async function listSendsByDraftGroupedByPiece(
  draftId: string,
): Promise<Record<number, SmsSendRow[]>> {
  const sends = await listSendsByDraft(draftId);
  const grouped: Record<number, SmsSendRow[]> = {};
  for (const s of sends) {
    (grouped[s.pieceIndex] ??= []).push(s);
  }
  return grouped;
}
