/**
 * Closed-loop campaign attribution via short tracking codes.
 *
 * The owner mints a code per campaign piece, Claude weaves it into
 * the message body ("Use code EATRO-M5-001 at checkout"), and the
 * owner logs redemptions back into the platform — either manually
 * after seeing the code typed at POS, or later via a Restora webhook
 * that pushes redemption events automatically. Either way the
 * dashboard can show "this campaign drove ৳X across N customers".
 */

import { randomBytes } from 'crypto';

import { prisma } from './db';

export interface CampaignCodeRow {
  id: string;
  code: string;
  draftId: string;
  pieceIndex: number;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  /// Aggregates derived from the redemption ledger so the dashboard
  /// can render code rows without an extra query.
  redemptionCount: number;
  totalAmountMinor: number;
  totalQty: number;
}

export interface CampaignRedemptionRow {
  id: string;
  codeId: string;
  amountMinor: number;
  qty: number;
  source: string;
  notes: string | null;
  redeemedAt: string;
}

function rowToCode(
  row: {
    id: string;
    code: string;
    draftId: string;
    pieceIndex: number;
    label: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  agg: { count: number; totalAmount: number; totalQty: number },
): CampaignCodeRow {
  return {
    id: row.id,
    code: row.code,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    label: row.label,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    redemptionCount: agg.count,
    totalAmountMinor: agg.totalAmount,
    totalQty: agg.totalQty,
  };
}

function rowToRedemption(row: {
  id: string;
  codeId: string;
  amountMinor: number;
  qty: number;
  source: string;
  notes: string | null;
  redeemedAt: Date;
}): CampaignRedemptionRow {
  return {
    id: row.id,
    codeId: row.codeId,
    amountMinor: row.amountMinor,
    qty: row.qty,
    source: row.source,
    notes: row.notes,
    redeemedAt: row.redeemedAt.toISOString(),
  };
}

/// Build a customer-friendly short code. Format:
///   <PREFIX>-<MONTH><YEAR-LAST-DIGIT>-<RANDOM4>
/// PREFIX defaults to 'C' (campaign) but the dashboard will pass a
/// business-specific prefix once multi-tenancy lands. RANDOM4 is 4
/// base32 chars (no I/O/0/1) so it's unambiguous to read aloud.
const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function mintCodeString(prefix: string): string {
  const now = new Date();
  const ym = `M${now.getUTCMonth() + 1}${now.getUTCFullYear() % 10}`;
  const buf = randomBytes(4);
  let r = '';
  for (let i = 0; i < 4; i++) r += BASE32[buf[i] % BASE32.length];
  return `${prefix.toUpperCase()}-${ym}-${r}`;
}

/// Create a new tracking code for a draft piece. Retries up to 5
/// times on the (very rare) random-collision case.
export async function createCampaignCode(params: {
  draftId: string;
  pieceIndex: number;
  prefix?: string;
  label?: string | null;
  expiresAt?: Date | null;
}): Promise<CampaignCodeRow> {
  const prefix = (params.prefix ?? 'C').replace(/[^A-Z0-9]/gi, '').slice(0, 8) || 'C';
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintCodeString(prefix);
    try {
      const row = await prisma.campaignCode.create({
        data: {
          code,
          draftId: params.draftId,
          pieceIndex: params.pieceIndex,
          label: params.label ?? null,
          expiresAt: params.expiresAt ?? null,
        },
      });
      return rowToCode(row, { count: 0, totalAmount: 0, totalQty: 0 });
    } catch (err: unknown) {
      // Unique-constraint violation on code → retry with a new random.
      if (err instanceof Error && /unique|UNIQUE/.test(err.message)) continue;
      throw err;
    }
  }
  throw new Error('Failed to mint a unique code after 5 attempts');
}

export async function listCodesForBusiness(businessId: string): Promise<CampaignCodeRow[]> {
  const rows = await prisma.campaignCode.findMany({
    where: { draft: { analysis: { businessId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      redemptions: { select: { amountMinor: true, qty: true } },
    },
  });
  return rows.map((r) => {
    const totalAmount = r.redemptions.reduce((s, x) => s + x.amountMinor, 0);
    const totalQty = r.redemptions.reduce((s, x) => s + x.qty, 0);
    return rowToCode(r, { count: r.redemptions.length, totalAmount, totalQty });
  });
}

export async function listCodesForDraft(draftId: string): Promise<CampaignCodeRow[]> {
  const rows = await prisma.campaignCode.findMany({
    where: { draftId },
    orderBy: { createdAt: 'desc' },
    include: {
      redemptions: { select: { amountMinor: true, qty: true } },
    },
  });
  return rows.map((r) => {
    const totalAmount = r.redemptions.reduce((s, x) => s + x.amountMinor, 0);
    const totalQty = r.redemptions.reduce((s, x) => s + x.qty, 0);
    return rowToCode(r, { count: r.redemptions.length, totalAmount, totalQty });
  });
}

export async function findCodeByCode(code: string): Promise<CampaignCodeRow | null> {
  const row = await prisma.campaignCode.findUnique({
    where: { code: code.toUpperCase() },
    include: { redemptions: { select: { amountMinor: true, qty: true } } },
  });
  if (!row) return null;
  const totalAmount = row.redemptions.reduce((s, x) => s + x.amountMinor, 0);
  const totalQty = row.redemptions.reduce((s, x) => s + x.qty, 0);
  return rowToCode(row, { count: row.redemptions.length, totalAmount, totalQty });
}

export async function logRedemption(params: {
  codeId: string;
  amountMinor: number;
  qty: number;
  source?: string;
  notes?: string | null;
  redeemedAt?: Date;
}): Promise<CampaignRedemptionRow> {
  const row = await prisma.campaignRedemption.create({
    data: {
      codeId: params.codeId,
      amountMinor: Math.max(0, Math.floor(params.amountMinor)),
      qty: Math.max(1, Math.floor(params.qty)),
      source: params.source ?? 'manual',
      notes: params.notes ?? null,
      ...(params.redeemedAt ? { redeemedAt: params.redeemedAt } : {}),
    },
  });
  return rowToRedemption(row);
}

export async function listRedemptionsForCode(codeId: string): Promise<CampaignRedemptionRow[]> {
  const rows = await prisma.campaignRedemption.findMany({
    where: { codeId },
    orderBy: { redeemedAt: 'desc' },
  });
  return rows.map(rowToRedemption);
}

export async function deleteCode(codeId: string): Promise<void> {
  // Redemptions cascade-delete via FK onDelete: Cascade.
  await prisma.campaignCode.delete({ where: { id: codeId } });
}
