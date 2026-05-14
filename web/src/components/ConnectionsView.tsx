'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Plus, RefreshCw, Trash2, X, XCircle } from 'lucide-react';

import type { FacebookConnectionRow, FacebookPostEventRow } from '@/lib/facebook';
import { FacebookIcon } from './icons/FacebookIcon';
import { InstagramIcon } from './icons/InstagramIcon';

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

  /// Re-query Graph for a connection's linked IG account using the
  /// stored token. The whole point: when the owner has just linked an
  /// IG Business account in Meta Business Suite, they can pick it up
  /// without re-pasting the token.
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  async function recheck(id: string) {
    if (refreshingId !== null) return;
    setRefreshingId(id);
    try {
      await fetch(`/api/facebook/connections/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
      await refresh();
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="border border-border bg-card">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <FacebookIcon size={14} className="text-primary" />
            Facebook Pages
          </h2>
          {!showConnectForm && (
            <button
              onClick={() => {
                setShowConnectForm(true);
                setSubmitError(null);
                setPickPages([]);
              }}
              className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-white bg-primary hover:bg-accent px-2 py-1"
            >
              <Plus size={11} />
              Connect a page
            </button>
          )}
        </header>

        {showConnectForm && (
          <div className="border-b border-border/60 bg-primary/5 px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Paste a Page Access Token (or User Access Token)
              </p>
              <button
                onClick={() => {
                  setShowConnectForm(false);
                  setToken('');
                  setPickPages([]);
                  setSubmitError(null);
                }}
                className="text-muted-foreground/70 hover:text-foreground"
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
              className="w-full bg-card border border-border text-xs text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-blue-600 font-mono break-all resize-y"
            />
            {pickPages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  This token can act for {pickPages.length} page{pickPages.length === 1 ? '' : 's'} — pick one to connect:
                </p>
                <ul className="space-y-1">
                  {pickPages.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => submitToken(p.id)}
                        disabled={submitting}
                        className="w-full text-left px-3 py-2 border border-border hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        <span className="text-sm font-medium text-foreground">
                          {p.name}
                        </span>
                        <span className="block text-[10px] text-muted-foreground font-mono">{p.id}</span>
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
                  className="bg-primary hover:bg-accent disabled:bg-zinc-300 disabled:text-muted-foreground text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase"
                >
                  {submitting ? 'Validating…' : 'Connect'}
                </button>
              </div>
            )}
            {submitError && (
              <p className="text-xs text-destructive font-mono break-all">
                {submitError}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : listError ? (
          <p className="px-4 py-6 text-xs text-destructive font-mono break-all">
            {listError}
          </p>
        ) : connections.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            No Facebook pages connected. Click <span className="font-medium">Connect a page</span> to get started.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {connections.map((c) => (
              <li key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  {c.active ? (
                    <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {c.pageName}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      page id {c.pageId}
                    </div>
                    {!c.active && c.lastValidationError && (
                      <p className="text-[11px] text-amber-400 mt-1 break-all">
                        Token rejected: {c.lastValidationError}
                      </p>
                    )}
                    {c.tokenExpiresAt && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Token expires {new Date(c.tokenExpiresAt).toLocaleString()}
                      </p>
                    )}
                    {c.instagramBusinessId ? (
                      <p className="text-[11px] mt-1 inline-flex items-center gap-1.5 text-primary">
                        <InstagramIcon size={11} />
                        <span>
                          Instagram linked{c.instagramUsername ? ` · @${c.instagramUsername}` : ''}
                        </span>
                      </p>
                    ) : (
                      <p className="text-[10px] mt-1 text-muted-foreground">
                        No Instagram Business account linked. Link one in Meta Business Suite, then
                        hit <span className="text-foreground">Re-check</span>.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => recheck(c.id)}
                    disabled={refreshingId === c.id}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
                    title="Re-query Graph for the IG link / token status"
                  >
                    <RefreshCw size={11} className={refreshingId === c.id ? 'animate-spin' : ''} />
                    {refreshingId === c.id ? 'Checking' : 'Re-check'}
                  </button>
                  <button
                    onClick={() => disconnect(c.id)}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={11} />
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recentPosts.length > 0 && (
        <section className="border border-border bg-card">
          <header className="px-4 py-3 border-b border-border/60">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Recent Facebook posts
            </h2>
          </header>
          <ul className="divide-y divide-border">
            {recentPosts.map((p) => (
              <li key={p.id} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {p.target === 'instagram' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-primary/15 text-primary">
                        <InstagramIcon size={10} />
                        IG
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-primary/15 text-primary">
                        <FacebookIcon size={10} />
                        FB
                      </span>
                    )}
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 ${
                        p.status === 'POSTED'
                          ? 'bg-emerald-950/40 text-emerald-300'
                          : p.status === 'PENDING'
                          ? 'bg-muted text-foreground'
                          : 'bg-amber-950/40 text-amber-300'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-foreground/90 whitespace-pre-wrap break-words">
                  {p.message.slice(0, 280)}
                  {p.message.length > 280 ? '…' : ''}
                </p>
                {p.providerPostId && p.target !== 'instagram' && (
                  <a
                    href={`https://www.facebook.com/${p.providerPostId.replace('_', '/posts/')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary hover:text-accent font-mono"
                  >
                    <ExternalLink size={10} />
                    {p.providerPostId}
                  </a>
                )}
                {p.providerPostId && p.target === 'instagram' && (
                  <p className="inline-flex items-center gap-1 mt-1 text-[10px] text-muted-foreground font-mono">
                    media id {p.providerPostId}
                  </p>
                )}
                {p.error && (
                  <p className="mt-1 text-[11px] text-destructive break-all">
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
