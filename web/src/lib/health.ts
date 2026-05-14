/**
 * Connection health diagnostics. When something is broken the user
 * wants one page that says exactly what's down — DB, Restora, Anthropic,
 * each Facebook page — rather than guessing from a failed audit.
 *
 * Every check has a hard ~5s timeout. The whole report fans out in
 * parallel so the worst-case wait is bounded by the slowest check.
 */

import { exec as execCb } from 'child_process';
import { promisify } from 'util';

import Anthropic from '@anthropic-ai/sdk';

import { prisma } from './db';
import { getOrCreateBusinessFromEnv } from './business';
import { listConnections } from './facebook';
import { RestoraClient } from './restora-client';

const exec = promisify(execCb);

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

export interface RecentLogEntry {
  /// ISO timestamp from systemd journal.
  at: string;
  /// 'error' for stderr / non-zero exit lines; 'info' for the rest. We
  /// don't yet parse syslog priority — anything that looks like a stack
  /// trace, "Error:", or "FAIL" gets bumped to error.
  level: 'info' | 'error';
  message: string;
}

export interface HealthReport {
  generatedAt: string;
  db: CheckResult;
  restora: CheckResult;
  anthropic: CheckResult;
  facebook: Array<CheckResult & { pageId: string; pageName: string; connectionId: string }>;
  /// Last 30 lines from the systemd journal for the marketing-ai
  /// service. Empty when journalctl isn't available (local dev on
  /// Windows / macOS) — the field still ships so the UI can render a
  /// consistent shape.
  recentLogs: RecentLogEntry[];
  /// Backup snapshot health — newest backup age + count. Surfaces when
  /// /root/backups/marketing-ai stops being written to (cron disabled,
  /// disk full, etc.). Empty when no backups exist.
  backups: {
    count: number;
    newestAt: string | null;
    newestAgeHours: number | null;
  };
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

async function fetchRecentLogs(): Promise<RecentLogEntry[]> {
  // journalctl is Linux-only; in dev on Windows/macOS this command
  // never resolves to anything useful, so we early-return.
  if (process.platform !== 'linux') return [];
  try {
    const { stdout } = await exec(
      'journalctl -u marketing-ai.service --no-pager --lines=30 --output=short-iso 2>/dev/null || true',
      { timeout: 4_000, maxBuffer: 256 * 1024 },
    );
    const lines = stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));
    return lines.map((line) => {
      // short-iso prefix: 2026-05-14T02:30:00+0000 host service[pid]: ...
      const match = line.match(/^(\S+)\s+\S+\s+\S+:\s*(.*)$/);
      const at = match ? match[1] : new Date().toISOString();
      const message = match ? match[2] : line;
      const level: RecentLogEntry['level'] =
        /\b(error|fail|exception|cannot find module|throw)\b/i.test(message) ? 'error' : 'info';
      return { at, level, message };
    });
  } catch (err: unknown) {
    console.error('[health] fetchRecentLogs failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchBackupSummary(): Promise<HealthReport['backups']> {
  if (process.platform !== 'linux') {
    return { count: 0, newestAt: null, newestAgeHours: null };
  }
  try {
    const { stdout } = await exec(
      "ls -1t /root/backups/marketing-ai/dev-*.db.gz 2>/dev/null | head -200 || true",
      { timeout: 2_000 },
    );
    const files = stdout.split('\n').filter(Boolean);
    if (files.length === 0) {
      return { count: 0, newestAt: null, newestAgeHours: null };
    }
    // Parse the timestamp out of the newest filename:
    //   dev-20260514T025205Z.db.gz
    const newest = files[0];
    const tsMatch = newest.match(/dev-(\d{8}T\d{6}Z)\.db\.gz$/);
    let newestAt: string | null = null;
    let newestAgeHours: number | null = null;
    if (tsMatch) {
      const iso = tsMatch[1].replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        '$1-$2-$3T$4:$5:$6Z',
      );
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) {
        newestAt = d.toISOString();
        newestAgeHours = Math.round((Date.now() - d.getTime()) / 36e5);
      }
    }
    return { count: files.length, newestAt, newestAgeHours };
  } catch (err: unknown) {
    console.error('[health] fetchBackupSummary failed:', err instanceof Error ? err.message : err);
    return { count: 0, newestAt: null, newestAgeHours: null };
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
  const [db, restora, anthropic, facebook, recentLogs, backups] = await Promise.all([
    checkDb(),
    checkRestora(),
    checkAnthropic(),
    Promise.all(connections.map((c) => checkOneFacebook(c))),
    fetchRecentLogs(),
    fetchBackupSummary(),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    db,
    restora,
    anthropic,
    facebook,
    recentLogs,
    backups,
  };
}
