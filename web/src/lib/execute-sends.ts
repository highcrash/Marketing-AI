/**
 * Core send-execution logic shared between the on-demand send routes
 * and the scheduler. Each function:
 *  1. Validates the draft is APPROVED and the piece is an SMS piece
 *  2. Writes a pending audit row (SmsSendEvent / SmsBlastEvent)
 *  3. Calls Restora's external API via RestoraClient
 *  4. Updates the audit row with the result
 *  5. Returns the persisted row
 *
 * Callers handle validation of their inputs (req body parsing, HTTP
 * status codes, etc.) — these functions trust their args and only
 * raise SendExecutionError when execution fails in a recoverable way.
 */

import { prisma } from './db';
import { RestoraClient, RestoraApiError } from './restora-client';
import { getDraftById } from './drafts';
import {
  createPendingSmsSend,
  markSmsSendResult,
  type SmsSendRow,
} from './sms-sends';
import {
  createPendingBlast,
  markBlastResult,
  type BlastEventRow,
  type BlastSegmentFilter,
} from './sms-blasts';

export class SendExecutionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SendExecutionError';
  }
}

interface BusinessRecord {
  id: string;
  baseUrl: string;
  apiKey: string;
}

/// Resolve the draft + verify it belongs to the supplied business + is
/// in APPROVED state + the piece is an SMS piece. Throws on any failure.
/// Returns the loaded draft + piece content so callers don't refetch.
async function resolveSendPiece(
  draftId: string,
  pieceIndex: number,
  businessId: string,
): Promise<{ draftId: string; pieceContent: string }> {
  const draft = await getDraftById(draftId);
  if (!draft) {
    throw new SendExecutionError('draft_not_found', `Draft ${draftId} not found`);
  }
  const analysisRow = await prisma.analysis.findFirst({
    where: { id: draft.analysisId, businessId },
    select: { id: true },
  });
  if (!analysisRow) {
    throw new SendExecutionError('draft_not_found', `Draft ${draftId} not owned by business`);
  }
  if (draft.status !== 'APPROVED') {
    throw new SendExecutionError(
      'not_approved',
      `Draft ${draftId} is ${draft.status}, not APPROVED`,
    );
  }
  const piece = draft.payload.pieces[pieceIndex];
  if (!piece || piece.assetType !== 'sms') {
    throw new SendExecutionError(
      'bad_piece',
      `pieceIndex ${pieceIndex} does not point to an SMS piece`,
    );
  }
  return { draftId: draft.id, pieceContent: piece.content };
}

export async function executeSingleSmsSend(params: {
  business: BusinessRecord;
  draftId: string;
  pieceIndex: number;
  phone: string;
  campaignTag?: string | null;
}): Promise<SmsSendRow> {
  const { pieceContent } = await resolveSendPiece(
    params.draftId,
    params.pieceIndex,
    params.business.id,
  );

  const event = await createPendingSmsSend({
    draftId: params.draftId,
    pieceIndex: params.pieceIndex,
    toPhone: params.phone,
    body: pieceContent,
    campaignTag: params.campaignTag ?? null,
  });

  const restora = new RestoraClient(params.business.baseUrl, params.business.apiKey);
  try {
    const result = await restora.sendSms({
      phone: params.phone,
      body: pieceContent,
      campaignTag: params.campaignTag ?? undefined,
    });
    return markSmsSendResult(event.id, {
      status: result.data.ok ? 'SENT' : 'PROVIDER_ERROR',
      providerRequestId: result.data.providerRequestId,
      providerStatus: result.data.status,
      error: result.data.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return markSmsSendResult(event.id, {
      status: err instanceof RestoraApiError ? 'PROVIDER_ERROR' : 'FAILED',
      error: message,
    });
  }
}

export async function executeSmsBlast(params: {
  business: BusinessRecord;
  draftId: string;
  pieceIndex: number;
  segment: BlastSegmentFilter;
  campaignTag?: string | null;
}): Promise<BlastEventRow> {
  const { pieceContent } = await resolveSendPiece(
    params.draftId,
    params.pieceIndex,
    params.business.id,
  );

  const blast = await createPendingBlast({
    draftId: params.draftId,
    pieceIndex: params.pieceIndex,
    segmentFilter: params.segment,
    body: pieceContent,
    campaignTag: params.campaignTag ?? null,
  });

  const restora = new RestoraClient(params.business.baseUrl, params.business.apiKey);
  try {
    const result = await restora.sendSmsBlast({
      segment: params.segment,
      smsTemplate: pieceContent,
      campaignTag: params.campaignTag ?? undefined,
      dryRun: false,
    });
    if (result.data.dryRun) {
      return markBlastResult(blast.id, {
        recipientCount: 0,
        sentCount: 0,
        failedCount: 0,
        status: 'FAILED',
        error: 'Upstream returned dryRun: true unexpectedly',
      });
    }
    const { recipientCount, sent, failed } = result.data;
    const status = failed === 0 ? 'COMPLETE' : sent === 0 ? 'FAILED' : 'PARTIAL';
    return markBlastResult(blast.id, {
      recipientCount,
      sentCount: sent,
      failedCount: failed,
      status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return markBlastResult(blast.id, {
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      status: 'FAILED',
      error: message,
    });
  }
}
