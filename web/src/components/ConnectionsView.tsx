'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Plus, Trash2, X, XCircle } from 'lucide-react';

import type { FacebookConnectionRow, FacebookPostEventRow } from '@/lib/facebook';
import { FacebookIcon } from './icons/FacebookIcon';

interface ListResponse {
  connections: FacebookConnectionRow[];
  recentPosts: FacebookPostEventRow[];
}

interface ConnectResponse {
  connection?: FacebookConnectionRow;
  pages?: Array<{ id: string; name: string; category?: string }>;
  error?: string;
  message?: string;
}

export function ConnectionsView() {
  const [connections, setConnections] = useState<FacebookConnectionRow[]>([]);
  const [recentPosts, setRecentPosts] = useState<FacebookPostEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showConnectForm, setShowConnectForm] = useState(false);
  const [token, setToken] = useState('');
  const [pickPages, setPickPages] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch('/api/facebook/connections');
      const body = (await res.json()) as ListResponse | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setConnections(body.connections);
      setRecentPosts(body.recentPosts);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitToken(pageId?: string) {
    if (!token.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/facebook/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token.trim(), pageId }),
      });
      const body = (await res.json()) as ConnectResponse;
      if (!res.ok || body.error) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      if (body.pages && body.pages.length > 0 && !body.connection) {
        setPickPages(body.pages);
        return;
      }
      if (body.connection) {
        setShowConnectForm(false);
        setToken('');
        setPickPages([]);
        await refresh();
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this page? Past posts stay in your history but you won\'t be able to post here again until you re-connect.')) {
      return;
    }
    await fetch(`/api/facebook/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }

  return (
    <div className="space-y-5">
      <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 dark:border-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
            <FacebookIcon size={14} className="text-blue-600" />
            Facebook Pages
          </h2>
          {!showConnectForm && (
            <button
              onClick={() => {
                setShowConnectForm(true);
                setSubmitError(null);
                setPickPages([]);
              }}
              className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-white bg-blue-600 hover:bg-blue-700 px-2 py-1"
            >
              <Plus size={11} />
              Connect a page
            </button>
          )}
        </header>

        {showConnectForm && (
          <div className="border-b border-zinc-100 dark:border-zinc-900 bg-blue-50/40 dark:bg-blue-950/20 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Paste a Page Access Token (or User Access Token)
              </p>
              <button
                onClick={() => {
                  setShowConnectForm(false);
                  setToken('');
                  setPickPages([]);
                  setSubmitError(null);
                }}
                className="text-zinc-400 hover:text-zinc-600"
                aria-label="Cancel"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={3}
              disabled={submitting}
              placeholder="EAA... (get from Graph API Explorer or your Meta app)"
              className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 px-3 py-2 placeholder:text-zinc-400 focus:outline-none focus:border-blue-600 font-mono break-all resize-y"
            />
            {pickPages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                  This token can act for {pickPages.length} page{pickPages.length === 1 ? '' : 's'} — pick one to connect:
                </p>
                <ul className="space-y-1">
                  {pickPages.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => submitToken(p.id)}
                        disabled={submitting}
                        className="w-full text-left px-3 py-2 border border-zinc-200 dark:border-zinc-800 hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-50"
                      >
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {p.name}
                        </span>
                        <span className="block text-[10px] text-zinc-500 font-mono">{p.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex justify-end">
                <button
                  onClick={() => submitToken()}
                  disabled={submitting || token.trim().length < 20}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase"
                >
                  {submitting ? 'Validating…' : 'Connect'}
                </button>
              </div>
            )}
            {submitError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">
                {submitError}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="px-4 py-6 text-xs text-zinc-500">Loading…</p>
        ) : listError ? (
          <p className="px-4 py-6 text-xs text-red-600 dark:text-red-400 font-mono break-all">
            {listError}
          </p>
        ) : connections.length === 0 ? (
          <p className="px-4 py-6 text-xs text-zinc-500">
            No Facebook pages connected. Click <span className="font-medium">Connect a page</span> to get started.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {connections.map((c) => (
              <li key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {c.active ? (
                    <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {c.pageName}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      page id {c.pageId}
                    </div>
                    {!c.active && c.lastValidationError && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 break-all">
                        Token rejected: {c.lastValidationError}
                      </p>
                    )}
                    {c.tokenExpiresAt && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Token expires {new Date(c.tokenExpiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => disconnect(c.id)}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500 hover:text-red-600"
                >
                  <Trash2 size={11} />
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recentPosts.length > 0 && (
        <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <header className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
              Recent Facebook posts
            </h2>
          </header>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {recentPosts.map((p) => (
              <li key={p.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${
                      p.status === 'POSTED'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : p.status === 'PENDING'
                        ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {p.status}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(p.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
                  {p.message.slice(0, 280)}
                  {p.message.length > 280 ? '…' : ''}
                </p>
                {p.providerPostId && (
                  <a
                    href={`https://www.facebook.com/${p.providerPostId.replace('_', '/posts/')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[10px] text-blue-600 hover:text-blue-700 font-mono"
                  >
                    <ExternalLink size={10} />
                    {p.providerPostId}
                  </a>
                )}
                {p.error && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 break-all">
                    {p.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
