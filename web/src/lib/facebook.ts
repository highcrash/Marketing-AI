/**
 * Facebook Graph API client + connection helpers.
 *
 * Phase 2a — read-only validation + single-page text posting. Anything
 * fancier (scheduled posts, photo uploads, comment moderation) is left
 * to later phases.
 *
 * Auth model: we accept a Page Access Token directly. The token MUST be
 * a long-lived Page token (or be exchanged for one); short-lived User
 * tokens have a ~1-2 hour TTL and aren't useful for a platform. The
 * tradeoff is that we don't run a full Login-with-Facebook OAuth dance
 * — the owner pastes the token from Graph API Explorer. Acceptable for
 * a single-tenant internal tool; would need a real OAuth flow before
 * external launch + Meta App Review.
 */

import { prisma } from './db';

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';

interface GraphError {
  message: string;
  type?: string;
  code?: number;
  fbtrace_id?: string;
}

interface GraphErrorEnvelope {
  error: GraphError;
}

function isErrorEnvelope(body: unknown): body is GraphErrorEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'object'
  );
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  /// Returned only when querying with a User Access Token via
  /// /me/accounts. When the caller passes a Page Access Token directly,
  /// this will be null.
  pageAccessToken: string | null;
  category?: string;
}

/// Look up the page that a token can act for. We try /me first (works
/// for both User and Page tokens) and fall back to /me/accounts to grab
/// nested page tokens if the input is a User Access Token.
export async function inspectToken(token: string): Promise<{
  kind: 'page' | 'user';
  page?: FacebookPageInfo;
  pages?: FacebookPageInfo[];
  tokenExpiresAt: Date | null;
  raw: unknown;
}> {
  // /me with the token tells us the actor — for a Page token it's the
  // Page, for a User token it's the User. Don't ask for `category` here
  // because that field doesn't exist on User nodes and Graph rejects
  // the whole call with code 100.
  const meRes = await fetch(`${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const me = (await meRes.json()) as unknown;
  if (!meRes.ok || isErrorEnvelope(me)) {
    const msg = isErrorEnvelope(me) ? me.error.message : `HTTP ${meRes.status}`;
    throw new Error(`Token rejected by Graph: ${msg}`);
  }

  // Debug token tells us the token type and (when present) the expiry.
  // We don't fail the flow if debug fails — it's informational.
  let tokenExpiresAt: Date | null = null;
  let tokenKind: 'page' | 'user' = 'page';
  try {
    const dbgRes = await fetch(
      `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`,
    );
    const dbg = (await dbgRes.json()) as { data?: { type?: string; expires_at?: number; data_access_expires_at?: number } };
    if (dbg.data) {
      if (dbg.data.type === 'USER') tokenKind = 'user';
      else tokenKind = 'page';
      // expires_at = 0 means "never expires" (long-lived Page token).
      if (dbg.data.expires_at && dbg.data.expires_at > 0) {
        tokenExpiresAt = new Date(dbg.data.expires_at * 1000);
      }
    }
  } catch {
    // Ignore — debug is a nicety, not a requirement.
  }

  const meObj = me as { id?: string; name?: string };
  if (tokenKind === 'page' && meObj.id) {
    // Now that we know it's a Page node, we can ask for `category`
    // safely; ignore failure since it's metadata-only.
    let category: string | undefined;
    try {
      const catRes = await fetch(
        `${GRAPH_BASE}/${encodeURIComponent(meObj.id)}?fields=category&access_token=${encodeURIComponent(token)}`,
      );
      const catBody = (await catRes.json()) as { category?: string };
      if (catRes.ok) category = catBody.category;
    } catch {
      // Ignore — category is informational only.
    }
    return {
      kind: 'page',
      page: {
        id: meObj.id,
        name: meObj.name ?? '(unnamed page)',
        pageAccessToken: null,
        category,
      },
      tokenExpiresAt,
      raw: me,
    };
  }

  // User token — list the pages it can act for, each with their own page
  // access token nested in `access_token`.
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,category,access_token&limit=50&access_token=${encodeURIComponent(token)}`,
  );
  const pages = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; category?: string; access_token?: string }>;
  };
  if (!pagesRes.ok) {
    throw new Error('Token is a User token but /me/accounts call failed — cannot enumerate pages');
  }
  return {
    kind: 'user',
    pages: (pages.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      pageAccessToken: p.access_token ?? null,
      category: p.category,
    })),
    tokenExpiresAt,
    raw: { me, pages },
  };
}

export async function postToPage(params: {
  pageId: string;
  pageAccessToken: string;
  message: string;
}): Promise<{ id: string }> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(params.pageId)}/feed`;
  const form = new URLSearchParams();
  form.set('message', params.message);
  form.set('access_token', params.pageAccessToken);
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const body = (await res.json()) as unknown;
  if (!res.ok || isErrorEnvelope(body)) {
    const msg = isErrorEnvelope(body) ? body.error.message : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const ok = body as { id?: string };
  if (!ok.id) throw new Error('Graph response had no post id');
  return { id: ok.id };
}

export interface FacebookConnectionRow {
  id: string;
  businessId: string;
  pageId: string;
  pageName: string;
  active: boolean;
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToConnection(row: {
  id: string;
  businessId: string;
  pageId: string;
  pageName: string;
  active: boolean;
  tokenExpiresAt: Date | null;
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FacebookConnectionRow {
  return {
    id: row.id,
    businessId: row.businessId,
    pageId: row.pageId,
    pageName: row.pageName,
    active: row.active,
    tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
    lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
    lastValidationError: row.lastValidationError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listConnections(businessId: string): Promise<FacebookConnectionRow[]> {
  const rows = await prisma.facebookConnection.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(rowToConnection);
}

/// Upsert one page connection. Token is replaced if a row already
/// exists for this (businessId, pageId) — re-pasting refreshes the
/// token in place.
export async function upsertConnection(params: {
  businessId: string;
  pageId: string;
  pageName: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
}): Promise<FacebookConnectionRow> {
  const row = await prisma.facebookConnection.upsert({
    where: { businessId_pageId: { businessId: params.businessId, pageId: params.pageId } },
    create: {
      businessId: params.businessId,
      pageId: params.pageId,
      pageName: params.pageName,
      accessToken: params.accessToken,
      tokenExpiresAt: params.tokenExpiresAt,
      active: true,
      lastValidatedAt: new Date(),
      lastValidationError: null,
    },
    update: {
      pageName: params.pageName,
      accessToken: params.accessToken,
      tokenExpiresAt: params.tokenExpiresAt,
      active: true,
      lastValidatedAt: new Date(),
      lastValidationError: null,
    },
  });
  return rowToConnection(row);
}

export async function deleteConnection(connectionId: string): Promise<void> {
  // Cascade-delete the post events too so we don't leave orphan rows.
  await prisma.facebookPostEvent.deleteMany({ where: { connectionId } });
  await prisma.facebookConnection.delete({ where: { id: connectionId } });
}

export async function getConnection(connectionId: string): Promise<{
  row: FacebookConnectionRow;
  accessToken: string;
} | null> {
  const r = await prisma.facebookConnection.findUnique({ where: { id: connectionId } });
  if (!r) return null;
  return { row: rowToConnection(r), accessToken: r.accessToken };
}

export interface FacebookPostEventRow {
  id: string;
  businessId: string;
  connectionId: string;
  draftId: string | null;
  pieceIndex: number | null;
  message: string;
  status: 'PENDING' | 'POSTED' | 'FAILED' | 'PROVIDER_ERROR';
  providerPostId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToPostEvent(row: {
  id: string;
  businessId: string;
  connectionId: string;
  draftId: string | null;
  pieceIndex: number | null;
  message: string;
  status: string;
  providerPostId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): FacebookPostEventRow {
  return {
    id: row.id,
    businessId: row.businessId,
    connectionId: row.connectionId,
    draftId: row.draftId,
    pieceIndex: row.pieceIndex,
    message: row.message,
    status: row.status as FacebookPostEventRow['status'],
    providerPostId: row.providerPostId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// Publish a text post through a saved connection. Persists the attempt
/// before the upstream call so even network failures get audited.
export async function publishPost(params: {
  businessId: string;
  connectionId: string;
  message: string;
  draftId?: string | null;
  pieceIndex?: number | null;
}): Promise<FacebookPostEventRow> {
  const conn = await getConnection(params.connectionId);
  if (!conn || conn.row.businessId !== params.businessId) {
    throw new Error('connection_not_found');
  }
  if (!conn.row.active) {
    throw new Error('connection_inactive');
  }
  const pending = await prisma.facebookPostEvent.create({
    data: {
      businessId: params.businessId,
      connectionId: params.connectionId,
      draftId: params.draftId ?? null,
      pieceIndex: params.pieceIndex ?? null,
      message: params.message,
      status: 'PENDING',
    },
  });
  try {
    const { id } = await postToPage({
      pageId: conn.row.pageId,
      pageAccessToken: conn.accessToken,
      message: params.message,
    });
    const updated = await prisma.facebookPostEvent.update({
      where: { id: pending.id },
      data: { status: 'POSTED', providerPostId: id },
    });
    return rowToPostEvent(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    const isProvider = /OAuth|permission|expired|invalid/i.test(msg);
    const updated = await prisma.facebookPostEvent.update({
      where: { id: pending.id },
      data: {
        status: isProvider ? 'PROVIDER_ERROR' : 'FAILED',
        error: msg.slice(0, 1000),
      },
    });
    // Reflect on the connection so the UI can flag a dead token.
    if (isProvider) {
      await prisma.facebookConnection.update({
        where: { id: params.connectionId },
        data: { lastValidationError: msg.slice(0, 500), active: false },
      });
    }
    return rowToPostEvent(updated);
  }
}

export async function listRecentPostEvents(
  businessId: string,
  take = 50,
): Promise<FacebookPostEventRow[]> {
  const rows = await prisma.facebookPostEvent.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map(rowToPostEvent);
}
