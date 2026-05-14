/**
 * Connection health diagnostics. When something is broken the user
 * wants one page that says exactly what's down — DB, Restora, Anthropic,
 * each Facebook page — rather than guessing from a failed audit.
 *
 * Every check has a hard ~5s timeout. The whole report fans out in
 * parallel so the worst-case wait is bounded by the slowest check.
 */

import Anthropic from '@anthropic-ai/sdk';

import { prisma } from './db';
import { getOrCreateBusinessFromEnv } from './business';
import { listConnections } from './facebook';
import { RestoraClient } from './restora-client';

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export interface CheckResult {
  status: HealthStatus;
  latencyMs: number | null;
  /// One-line human-readable result for the panel.
  message: string;
  /// Optional details (provider error, response shape, etc.) for the
  /// drawer the user clicks to expand.
  detail?: string;
}

export interface HealthReport {
  generatedAt: string;
  db: CheckResult;
  restora: CheckResult;
  anthropic: CheckResult;
  facebook: Array<CheckResult & { pageId: string; pageName: string; connectionId: string }>;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function checkDb(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 5_000, 'db');
    return {
      status: 'ok',
      latencyMs: Date.now() - t0,
      message: 'SQLite responding',
    };
  } catch (err: unknown) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      message: 'SQLite not reachable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRestora(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const business = await getOrCreateBusinessFromEnv();
    const client = new RestoraClient(business.baseUrl, business.apiKey);
    const profile = await withTimeout(client.getProfile(), 5_000, 'restora');
    return {
      status: 'ok',
      latencyMs: Date.now() - t0,
      message: `${profile.data.name} · ${profile.meta.currency} · ${profile.meta.timezone}`,
    };
  } catch (err: unknown) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      message: 'Restora /business/profile failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkAnthropic(): Promise<CheckResult> {
  const t0 = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      status: 'down',
      latencyMs: null,
      message: 'ANTHROPIC_API_KEY not set',
    };
  }
  try {
    // Cheapest possible call: 1 input + 1 output token. Returns fast,
    // burns next-to-nothing, and exercises auth + ratelimit headers.
    const anthropic = new Anthropic({ apiKey: key });
    const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-7';
    const res = await withTimeout(
      anthropic.messages.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'OK' }],
      }),
      5_000,
      'anthropic',
    );
    return {
      status: 'ok',
      latencyMs: Date.now() - t0,
      message: `Claude ${res.model} responding`,
    };
  } catch (err: unknown) {
    return {
      status: 'down',
      latencyMs: Date.now() - t0,
      message: 'Anthropic Messages API rejected the call',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkOneFacebook(connection: {
  id: string;
  pageId: string;
  pageName: string;
  active: boolean;
}): Promise<CheckResult & { pageId: string; pageName: string; connectionId: string }> {
  if (!connection.active) {
    return {
      connectionId: connection.id,
      pageId: connection.pageId,
      pageName: connection.pageName,
      status: 'degraded',
      latencyMs: null,
      message: 'Connection marked inactive (token rejected previously)',
    };
  }
  const t0 = Date.now();
  try {
    // Pull the persisted token; never trust the connection row to ship
    // the secret to the client.
    const row = await prisma.facebookConnection.findUnique({
      where: { id: connection.id },
      select: { accessToken: true },
    });
    if (!row) {
      return {
        connectionId: connection.id,
        pageId: connection.pageId,
        pageName: connection.pageName,
        status: 'down',
        latencyMs: null,
        message: 'Connection row disappeared between list + read',
      };
    }
    const res = await withTimeout(
      fetch(
        `https://graph.facebook.com/v22.0/${encodeURIComponent(connection.pageId)}?fields=id,name&access_token=${encodeURIComponent(row.accessToken)}`,
      ),
      5_000,
      'facebook',
    );
    const body = (await res.json()) as { id?: string; name?: string; error?: { message: string } };
    if (!res.ok || body.error) {
      return {
        connectionId: connection.id,
        pageId: connection.pageId,
        pageName: connection.pageName,
        status: 'down',
        latencyMs: Date.now() - t0,
        message: 'Graph rejected token',
        detail: body.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return {
      connectionId: connection.id,
      pageId: connection.pageId,
      pageName: connection.pageName,
      status: 'ok',
      latencyMs: Date.now() - t0,
      message: `Token still valid for ${body.name ?? connection.pageName}`,
    };
  } catch (err: unknown) {
    return {
      connectionId: connection.id,
      pageId: connection.pageId,
      pageName: connection.pageName,
      status: 'down',
      latencyMs: Date.now() - t0,
      message: 'Graph call failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runHealthCheck(): Promise<HealthReport> {
  // Resolve the business first because the FB check needs it. Doing
  // this serially is fine because the call is local-DB-only.
  let connections: Array<{
    id: string;
    pageId: string;
    pageName: string;
    active: boolean;
  }> = [];
  try {
    const business = await getOrCreateBusinessFromEnv();
    connections = await listConnections(business.id);
  } catch {
    // If we can't resolve the business, leave FB list empty. The other
    // checks will surface the underlying problem.
  }
  const [db, restora, anthropic, facebook] = await Promise.all([
    checkDb(),
    checkRestora(),
    checkAnthropic(),
    Promise.all(connections.map((c) => checkOneFacebook(c))),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    db,
    restora,
    anthropic,
    facebook,
  };
}
