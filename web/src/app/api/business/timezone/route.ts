import { NextResponse } from 'next/server';

import {
  getBusinessTimezone,
  getOrCreateBusinessFromEnv,
  setBusinessTimezone,
} from '@/lib/business';
import { RestoraClient } from '@/lib/restora-client';

export const dynamic = 'force-dynamic';

interface GetResponse {
  /// Owner-set override, null when not set.
  override: string | null;
  /// What Restora's /business/profile is currently reporting. Shown
  /// in the UI so the owner can compare before overriding.
  fromRestora: string | null;
  /// The effective timezone the analyze pipeline will use right now.
  effective: string;
  /// Curated IANA names for the dropdown. Empty means "use any IANA
  /// string"; in practice we offer the common ones plus an Other field.
  suggestions: string[];
}

/// Common IANA zones we surface as quick picks. Owners can still type
/// any valid zone via the "other" input.
const SUGGESTIONS = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Istanbul',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export async function GET() {
  try {
    const business = await getOrCreateBusinessFromEnv();
    const override = await getBusinessTimezone(business.id);

    // Best-effort fetch of Restora's reported zone — non-fatal if the
    // remote is down, the UI just doesn't show the comparison.
    let fromRestora: string | null = null;
    try {
      const client = new RestoraClient(business.baseUrl, business.apiKey);
      const profile = await client.getProfile();
      fromRestora = profile.meta.timezone ?? null;
    } catch {
      fromRestora = null;
    }

    const effective = override ?? fromRestora ?? 'UTC';

    const body: GetResponse = {
      override,
      fromRestora,
      effective,
      suggestions: SUGGESTIONS,
    };
    return NextResponse.json(body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'load_failed', message }, { status: 500 });
  }
}

interface PutBody {
  /// IANA timezone name, or null/empty to clear the override.
  timezone?: unknown;
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as PutBody;
    const raw = typeof body.timezone === 'string' ? body.timezone : null;
    const next = raw && raw.trim().length > 0 ? raw.trim() : null;
    const business = await getOrCreateBusinessFromEnv();
    const saved = await setBusinessTimezone(business.id, next);
    return NextResponse.json({ override: saved });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.startsWith('Unknown IANA timezone') ? 400 : 500;
    return NextResponse.json({ error: 'save_failed', message }, { status });
  }
}
