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
  /// Linked Instagram Business / Creator account, when one is
  /// configured in Meta Business Suite. Null when none is linked.
  instagram?: { id: string; username: string | null } | null;
}

/// Probe a Page for its linked Instagram Business account. The IG
/// Business / Creator account ID is exposed as `instagram_business_account`
/// on the Page node. Returns null when no account is linked.
async function lookupInstagramForPage(
  pageId: string,
  accessToken: string,
): Promise<{ id: string; username: string | null } | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(pageId)}?` +
        new URLSearchParams({
          fields: 'instagram_business_account{id,username}',
          access_token: accessToken,
        }).toString(),
    );
    const body = (await res.json()) as {
      instagram_business_account?: { id?: string; username?: string };
      error?: GraphError;
    };
    if (!res.ok || body.error || !body.instagram_business_account?.id) return null;
    return {
      id: body.instagram_business_account.id,
      username: body.instagram_business_account.username ?? null,
    };
  } catch {
    return null;
  }
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
    const instagram = await lookupInstagramForPage(meObj.id, token);
    return {
      kind: 'page',
      page: {
        id: meObj.id,
        name: meObj.name ?? '(unnamed page)',
        pageAccessToken: null,
        category,
        instagram,
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
  // For each page we got back, look up its linked IG account if any.
  // Done in parallel — if a page has no IG linked, lookupInstagramForPage
  // returns null which we just pass through.
  const enriched = await Promise.all(
    (pages.data ?? []).map(async (p) => ({
      id: p.id,
      name: p.name,
      pageAccessToken: p.access_token ?? null,
      category: p.category,
      instagram: p.access_token ? await lookupInstagramForPage(p.id, p.access_token) : null,
    })),
  );
  return {
    kind: 'user',
    pages: enriched,
    tokenExpiresAt,
    raw: { me, pages },
  };
}

export type PageMediaKind = 'text' | 'photo' | 'reel';

export async function postToPage(params: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  /// When set, FB fetches the image from this URL and attaches it as
  /// a photo post (POST /<page-id>/photos). Otherwise we do a plain
  /// text post via /feed.
  imageUrl?: string | null;
}): Promise<{ id: string }> {
  const isPhoto = !!params.imageUrl && params.imageUrl.trim().length > 0;
  const url = `${GRAPH_BASE}/${encodeURIComponent(params.pageId)}/${isPhoto ? 'photos' : 'feed'}`;
  const form = new URLSearchParams();
  if (isPhoto) {
    form.set('url', params.imageUrl!.trim());
    // 'message' acts as the caption on a photo post.
    form.set('caption', params.message);
  } else {
    form.set('message', params.message);
  }
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
  // /photos returns { id, post_id } — prefer post_id (the feed-level
  // id) so the audit row points to the public post, not the photo node.
  const ok = body as { id?: string; post_id?: string };
  const id = ok.post_id ?? ok.id;
  if (!id) throw new Error('Graph response had no post id');
  return { id };
}

/// Publish a Reel by URL. Facebook's Reels API is a 3-step container
/// flow: create a video container with upload_phase=start, fetch the
/// video at the URL with upload_phase=hosted, then finalise with
/// upload_phase=finish. We use the hosted-URL variant because we
/// already saved the user's upload to /public/uploads/, so the file
/// is reachable from the public internet.
///
/// Polling for the container to leave PUBLISHED status is omitted —
/// FB returns the post id immediately on the finalise call. The post
/// goes through their server-side encode + safety checks
/// asynchronously and shows up on the page once ready (usually 1-2
/// minutes).
export async function postReelToPage(params: {
  pageId: string;
  pageAccessToken: string;
  videoUrl: string;
  description: string;
}): Promise<{ id: string }> {
  const base = `${GRAPH_BASE}/${encodeURIComponent(params.pageId)}/video_reels`;

  // Step 1 — create the upload container.
  const startForm = new URLSearchParams();
  startForm.set('upload_phase', 'start');
  startForm.set('access_token', params.pageAccessToken);
  const startRes = await fetch(base, {
    method: 'POST',
    body: startForm,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const startBody = (await startRes.json()) as { video_id?: string; error?: GraphError };
  if (!startRes.ok || startBody.error || !startBody.video_id) {
    throw new Error(startBody.error?.message ?? `Reels start failed: HTTP ${startRes.status}`);
  }
  const videoId = startBody.video_id;

  // Step 2 — hand FB the URL to fetch the bytes from.
  const uploadUrl = `https://rupload.facebook.com/video-upload/v22.0/${encodeURIComponent(videoId)}`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${params.pageAccessToken}`,
      file_url: params.videoUrl,
    },
  });
  const uploadBody = (await uploadRes.json()) as { success?: boolean; error?: GraphError };
  if (!uploadRes.ok || uploadBody.error || uploadBody.success !== true) {
    throw new Error(uploadBody.error?.message ?? `Reels upload failed: HTTP ${uploadRes.status}`);
  }

  // Step 3 — finalise with the description.
  const finishForm = new URLSearchParams();
  finishForm.set('video_id', videoId);
  finishForm.set('upload_phase', 'finish');
  finishForm.set('video_state', 'PUBLISHED');
  finishForm.set('description', params.description);
  finishForm.set('access_token', params.pageAccessToken);
  const finishRes = await fetch(base, {
    method: 'POST',
    body: finishForm,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const finishBody = (await finishRes.json()) as { success?: boolean; post_id?: string; error?: GraphError };
  if (!finishRes.ok || finishBody.error || finishBody.success !== true) {
    throw new Error(finishBody.error?.message ?? `Reels finish failed: HTTP ${finishRes.status}`);
  }
  // FB returns video_id reliably here; post_id only when the finish
  // call publishes synchronously. Fall back to video_id so the user
  // still has something traceable.
  return { id: finishBody.post_id ?? videoId };
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
  /// IG Business / Creator account linked to this Page in Meta
  /// Business Suite. Null when none is linked.
  instagramBusinessId: string | null;
  instagramUsername: string | null;
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
  instagramBusinessId: string | null;
  instagramUsername: string | null;
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
    instagramBusinessId: row.instagramBusinessId,
    instagramUsername: row.instagramUsername,
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
/// token in place. Instagram link (if any) gets persisted too so the
/// UI knows to surface IG controls without an extra Graph round-trip.
export async function upsertConnection(params: {
  businessId: string;
  pageId: string;
  pageName: string;
  accessToken: string;
  tokenExpiresAt: Date | null;
  instagram?: { id: string; username: string | null } | null;
}): Promise<FacebookConnectionRow> {
  const igId = params.instagram?.id ?? null;
  const igUser = params.instagram?.username ?? null;
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
      instagramBusinessId: igId,
      instagramUsername: igUser,
    },
    update: {
      pageName: params.pageName,
      accessToken: params.accessToken,
      tokenExpiresAt: params.tokenExpiresAt,
      active: true,
      lastValidatedAt: new Date(),
      lastValidationError: null,
      instagramBusinessId: igId,
      instagramUsername: igUser,
    },
  });
  return rowToConnection(row);
}

/// Re-query Graph for the linked IG account using the stored token.
/// Lets the user pick up an IG link they just configured in Meta
/// Business Suite without having to paste the token again.
export async function refreshConnection(connectionId: string): Promise<FacebookConnectionRow | null> {
  const conn = await prisma.facebookConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return null;
  const ig = await lookupInstagramForPage(conn.pageId, conn.accessToken);
  const updated = await prisma.facebookConnection.update({
    where: { id: connectionId },
    data: {
      lastValidatedAt: new Date(),
      instagramBusinessId: ig?.id ?? null,
      instagramUsername: ig?.username ?? null,
    },
  });
  return rowToConnection(updated);
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
  target: PostTarget;
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
  target: string;
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
    target: (row.target as PostTarget) ?? 'facebook',
    status: row.status as FacebookPostEventRow['status'],
    providerPostId: row.providerPostId,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/// Publish a text-or-photo-or-reel post through a saved connection.
/// Persists the attempt before the upstream call so even network
/// failures get audited.
export type PostTarget = 'facebook' | 'instagram';

export async function publishPost(params: {
  businessId: string;
  connectionId: string;
  message: string;
  /// Which platform to publish to. 'instagram' requires the linked
  /// FacebookConnection.instagramBusinessId to be set + the token
  /// to carry instagram_content_publish scope.
  target?: PostTarget;
  /// Optional public URL of an image. When set, the post is published
  /// as a photo (with the message as the caption). Must be reachable
  /// from Facebook's servers — `localhost` URLs won't work.
  imageUrl?: string | null;
  /// Optional public URL of an MP4. When set, the post is published
  /// as a Reel; this takes precedence over imageUrl if both are set.
  videoUrl?: string | null;
  draftId?: string | null;
  pieceIndex?: number | null;
}): Promise<FacebookPostEventRow> {
  const target: PostTarget = params.target ?? 'facebook';
  const conn = await getConnection(params.connectionId);
  if (!conn || conn.row.businessId !== params.businessId) {
    throw new Error('connection_not_found');
  }
  if (!conn.row.active) {
    throw new Error('connection_inactive');
  }
  if (target === 'instagram' && !conn.row.instagramBusinessId) {
    throw new Error('No Instagram Business account linked to this page');
  }
  if (target === 'instagram' && !params.imageUrl && !params.videoUrl) {
    throw new Error('Instagram posts require an image or video URL');
  }
  const pending = await prisma.facebookPostEvent.create({
    data: {
      businessId: params.businessId,
      connectionId: params.connectionId,
      draftId: params.draftId ?? null,
      pieceIndex: params.pieceIndex ?? null,
      message: params.message,
      target,
      status: 'PENDING',
    },
  });
  try {
    let id: string;
    if (target === 'instagram') {
      const igUserId = conn.row.instagramBusinessId!;
      if (params.videoUrl && params.videoUrl.trim().length > 0) {
        const result = await postInstagramReel({
          igUserId,
          pageAccessToken: conn.accessToken,
          videoUrl: params.videoUrl.trim(),
          caption: params.message,
        });
        id = result.id;
      } else {
        const result = await postInstagramPhoto({
          igUserId,
          pageAccessToken: conn.accessToken,
          imageUrl: params.imageUrl!.trim(),
          caption: params.message,
        });
        id = result.id;
      }
    } else if (params.videoUrl && params.videoUrl.trim().length > 0) {
      const result = await postReelToPage({
        pageId: conn.row.pageId,
        pageAccessToken: conn.accessToken,
        videoUrl: params.videoUrl.trim(),
        description: params.message,
      });
      id = result.id;
    } else {
      const result = await postToPage({
        pageId: conn.row.pageId,
        pageAccessToken: conn.accessToken,
        message: params.message,
        imageUrl: params.imageUrl,
      });
      id = result.id;
    }
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

export interface FacebookPageInsightsSnapshot {
  pageId: string;
  pageName: string;
  /// Total fan/follower count (currently the same number on most pages
  /// since Meta unified the two metrics).
  fans: number | null;
  followers: number | null;
  /// 7-day "talking about" count — Meta's rolling-window engagement
  /// proxy. Available without read_insights.
  talkingAbout: number | null;
  /// Up to 5 most recent posts. We can't pull reach/impressions
  /// without read_insights so we settle for the engagement counts that
  /// are exposed on the post node directly. Empty array if the page
  /// has no posts.
  recentPosts: Array<{
    id: string;
    message: string | null;
    createdAt: string;
    likes: number | null;
    comments: number | null;
    reactions: number | null;
    shares: number | null;
  }>;
}

/// Pull the page-level numbers that don't require the read_insights
/// permission scope (which most Page Access Tokens don't have unless
/// the admin explicitly grants it during OAuth). What we get without
/// it: fan/follower count, talking-about count, recent posts with
/// likes/comments/reactions/shares. Reach + impressions per post
/// require read_insights, so we skip them — Claude does fine with
/// engagement counts as a proxy.
///
/// Returns null when both the page-fields call AND the posts call
/// fail (e.g. token completely rejected). Partial failures still
/// return a snapshot.
export async function fetchPageInsights(params: {
  pageId: string;
  pageName: string;
  accessToken: string;
}): Promise<FacebookPageInsightsSnapshot | null> {
  const { pageId, pageName, accessToken } = params;
  try {
    const [pageRes, postsRes] = await Promise.all([
      fetch(
        `${GRAPH_BASE}/${encodeURIComponent(pageId)}` +
          `?fields=id,name,fan_count,followers_count,talking_about_count` +
          `&access_token=${encodeURIComponent(accessToken)}`,
      ),
      fetch(
        `${GRAPH_BASE}/${encodeURIComponent(pageId)}/posts` +
          `?fields=id,message,created_time,shares,likes.summary(true),comments.summary(true),reactions.summary(true)` +
          `&limit=5` +
          `&access_token=${encodeURIComponent(accessToken)}`,
      ),
    ]);

    interface PageFields {
      id?: string;
      name?: string;
      fan_count?: number;
      followers_count?: number;
      talking_about_count?: number;
      error?: GraphError;
    }
    interface PostRow {
      id: string;
      message?: string;
      created_time?: string;
      shares?: { count?: number };
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      reactions?: { summary?: { total_count?: number } };
    }

    let pageFields: PageFields | null = null;
    if (pageRes.ok) {
      const body = (await pageRes.json()) as PageFields;
      if (!body.error) pageFields = body;
    }

    const recentPosts: FacebookPageInsightsSnapshot['recentPosts'] = [];
    if (postsRes.ok) {
      const postsBody = (await postsRes.json()) as { data?: PostRow[]; error?: GraphError };
      if (!postsBody.error) {
        for (const p of postsBody.data ?? []) {
          recentPosts.push({
            id: p.id,
            message: p.message ?? null,
            createdAt: p.created_time ?? new Date().toISOString(),
            likes: p.likes?.summary?.total_count ?? null,
            comments: p.comments?.summary?.total_count ?? null,
            reactions: p.reactions?.summary?.total_count ?? null,
            shares: p.shares?.count ?? null,
          });
        }
      }
    }

    if (!pageFields && recentPosts.length === 0) return null;

    return {
      pageId,
      pageName: pageFields?.name ?? pageName,
      fans: pageFields?.fan_count ?? null,
      followers: pageFields?.followers_count ?? null,
      talkingAbout: pageFields?.talking_about_count ?? null,
      recentPosts,
    };
  } catch {
    return null;
  }
}

/// Pull insights for every active connection on a business and return
/// the snapshots that succeeded. Tokens that have gone stale produce
/// nulls which we filter out — the audit then proceeds without FB
/// data for those pages.
export async function fetchAllPageInsights(
  businessId: string,
): Promise<FacebookPageInsightsSnapshot[]> {
  const conns = await prisma.facebookConnection.findMany({
    where: { businessId, active: true },
  });
  const results = await Promise.all(
    conns.map((c) =>
      fetchPageInsights({
        pageId: c.pageId,
        pageName: c.pageName,
        accessToken: c.accessToken,
      }),
    ),
  );
  return results.filter((r): r is FacebookPageInsightsSnapshot => r !== null);
}

/// Publish a photo to an Instagram Business / Creator account. Two-
/// step container flow: create the media container with image_url +
/// caption, then publish it via /media_publish.
///
/// Requires the Page Access Token to carry the instagram_basic +
/// instagram_content_publish permissions. Tokens minted from the
/// Graph API Explorer typically need these granted explicitly via the
/// "Get Token" permissions picker.
export async function postInstagramPhoto(params: {
  igUserId: string;
  pageAccessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ id: string }> {
  const containerForm = new URLSearchParams();
  containerForm.set('image_url', params.imageUrl);
  containerForm.set('caption', params.caption);
  containerForm.set('access_token', params.pageAccessToken);
  const cRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(params.igUserId)}/media`, {
    method: 'POST',
    body: containerForm,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const cBody = (await cRes.json()) as { id?: string; error?: GraphError };
  if (!cRes.ok || cBody.error || !cBody.id) {
    throw new Error(cBody.error?.message ?? `IG container create failed: HTTP ${cRes.status}`);
  }
  const publishForm = new URLSearchParams();
  publishForm.set('creation_id', cBody.id);
  publishForm.set('access_token', params.pageAccessToken);
  const pRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(params.igUserId)}/media_publish`, {
    method: 'POST',
    body: publishForm,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const pBody = (await pRes.json()) as { id?: string; error?: GraphError };
  if (!pRes.ok || pBody.error || !pBody.id) {
    throw new Error(pBody.error?.message ?? `IG publish failed: HTTP ${pRes.status}`);
  }
  return { id: pBody.id };
}

/// Publish a Reel to Instagram. Same 2-step container flow, but with
/// media_type=REELS + video_url. FB encodes asynchronously; we poll
/// the container's status_code briefly to make sure it left the
/// IN_PROGRESS state before calling /media_publish.
export async function postInstagramReel(params: {
  igUserId: string;
  pageAccessToken: string;
  videoUrl: string;
  caption: string;
}): Promise<{ id: string }> {
  const containerForm = new URLSearchParams();
  containerForm.set('media_type', 'REELS');
  containerForm.set('video_url', params.videoUrl);
  containerForm.set('caption', params.caption);
  containerForm.set('access_token', params.pageAccessToken);
  const cRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(params.igUserId)}/media`, {
    method: 'POST',
    body: containerForm,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const cBody = (await cRes.json()) as { id?: string; error?: GraphError };
  if (!cRes.ok || cBody.error || !cBody.id) {
    throw new Error(cBody.error?.message ?? `IG Reel container create failed: HTTP ${cRes.status}`);
  }
  const containerId = cBody.id;

  // Poll the container's status_code. FB encodes asynchronously; we
  // wait up to ~20s (40 × 500ms). If it's still IN_PROGRESS after
  // that we fire the publish anyway — the call may succeed once
  // encoding completes, and the post still ends up live; we just
  // surface FB's error if it doesn't.
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const sRes = await fetch(
      `${GRAPH_BASE}/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(params.pageAccessToken)}`,
    );
    const sBody = (await sRes.json()) as { status_code?: string; error?: GraphError };
    if (sBody.status_code === 'FINISHED') break;
    if (sBody.status_code === 'ERROR') {
      throw new Error('IG Reel container encode failed');
    }
  }

  const publishForm = new URLSearchParams();
  publishForm.set('creation_id', containerId);
  publishForm.set('access_token', params.pageAccessToken);
  const pRes = await fetch(`${GRAPH_BASE}/${encodeURIComponent(params.igUserId)}/media_publish`, {
    method: 'POST',
    body: publishForm,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const pBody = (await pRes.json()) as { id?: string; error?: GraphError };
  if (!pRes.ok || pBody.error || !pBody.id) {
    throw new Error(pBody.error?.message ?? `IG Reel publish failed: HTTP ${pRes.status}`);
  }
  return { id: pBody.id };
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
