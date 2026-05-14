import { NextResponse } from 'next/server';

import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { inspectToken, upsertConnection } from '@/lib/facebook';

export const dynamic = 'force-dynamic';

interface PostBody {
  /// Either a Page Access Token (recommended — what /me/accounts gives
  /// you) or a User Access Token (we'll enumerate pages and require
  /// `pageId` to pick one).
  accessToken?: unknown;
  /// Required when the token is a User token; ignored when it's a Page
  /// token (the page is determined by the token itself).
  pageId?: unknown;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const accessToken =
      typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    if (accessToken.length < 20) {
      return NextResponse.json(
        { error: 'bad_request', message: 'accessToken is required' },
        { status: 400 },
      );
    }
    const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : '';

    const inspected = await inspectToken(accessToken);
    const business = await getOrCreateBusinessFromEnv();

    if (inspected.kind === 'page' && inspected.page) {
      const conn = await upsertConnection({
        businessId: business.id,
        pageId: inspected.page.id,
        pageName: inspected.page.name,
        accessToken,
        tokenExpiresAt: inspected.tokenExpiresAt,
      });
      return NextResponse.json({ connection: conn });
    }

    // User token: pick a page, then store its nested Page Access Token.
    const pages = inspected.pages ?? [];
    if (pages.length === 0) {
      return NextResponse.json(
        { error: 'no_pages', message: 'This token has no pages it can act for.' },
        { status: 400 },
      );
    }
    if (!pageId) {
      // First call with a User token: surface the list so the UI can
      // ask the user to choose one.
      return NextResponse.json({ pages });
    }
    const picked = pages.find((p) => p.id === pageId);
    if (!picked || !picked.pageAccessToken) {
      return NextResponse.json(
        { error: 'bad_page', message: 'pageId not in the list this token can act for' },
        { status: 400 },
      );
    }
    const conn = await upsertConnection({
      businessId: business.id,
      pageId: picked.id,
      pageName: picked.name,
      accessToken: picked.pageAccessToken,
      // We don't get a per-page expiry from /me/accounts; fall back to
      // the User token's expiry which usually matches.
      tokenExpiresAt: inspected.tokenExpiresAt,
    });
    return NextResponse.json({ connection: conn });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'connect_failed', message }, { status: 500 });
  }
}
