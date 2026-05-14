'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, ExternalLink, Image as ImageIcon, Repeat, Send, Type, Upload, Video, X } from 'lucide-react';
import Link from 'next/link';

import type { FacebookConnectionRow, FacebookPostEventRow } from '@/lib/facebook';
import { FacebookIcon } from './icons/FacebookIcon';

type MediaKind = 'text' | 'photo' | 'reel';

interface UploadResponse {
  upload?: {
    sha: string;
    ext: string;
    size: number;
    publicPath: string;
    absoluteUrl: string | null;
    kind: 'image' | 'video';
  };
  error?: string;
  message?: string;
}

/// Returns "YYYY-MM-DDThh:mm" exactly 1h from now, in local time, in the
/// shape the <input type="datetime-local"> control expects. Used as the
/// default value when the user opens the schedule form.
function defaultScheduleAt(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface ConnectionsResponse {
  connections: FacebookConnectionRow[];
  recentPosts: FacebookPostEventRow[];
}

/// Inline panel under a draft piece that lets the user publish the
/// piece's body as a Facebook page post. Picks one of the connected
/// pages, lets the body be edited before sending, and persists an
/// audit row server-side. On success the originating piece is
/// auto-marked complete (`integrated-facebook-post` source).
export function FacebookPostPanel({
  draftId,
  pieceIndex,
  pieceContent,
  onClose,
  onPosted,
}: {
  draftId: string;
  pieceIndex: number;
  pieceContent: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [loadingConns, setLoadingConns] = useState(true);
  const [connections, setConnections] = useState<FacebookConnectionRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState(pieceContent);
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<FacebookPostEventRow | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  /// Post mode: 'now' publishes immediately via /api/facebook/post,
  /// 'later' creates a ScheduledSend row that the scheduler tick picks
  /// up via /api/drafts/:id/schedule, 'recurring' creates a
  /// RecurringSchedule that fires every chosen day-of-week.
  const [mode, setMode] = useState<'now' | 'later' | 'recurring'>('now');
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleAt);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<{ id: string; scheduledAt: string } | null>(null);
  // Recurring weekly: pick day-of-week (0=Sun..6=Sat) + local HH:mm
  const [dow, setDow] = useState<number>(new Date().getDay());
  const [hhmm, setHhmm] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(Math.floor(d.getMinutes() / 5) * 5).padStart(2, '0')}`;
  });
  const [recurringResult, setRecurringResult] = useState<{ id: string; nextFireAt: string } | null>(null);
  /// Which media variant the user is publishing. Drives whether the
  /// post API gets imageUrl, videoUrl, or neither.
  const [mediaKind, setMediaKind] = useState<MediaKind>('text');
  /// Resolved public URL for the selected media — either pasted by
  /// the user or returned by /api/uploads after a file upload. The
  /// publicPath is what we display; absoluteUrl is what Graph fetches.
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaAbsoluteUrl, setMediaAbsoluteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      const json = (await res.json()) as UploadResponse;
      if (!res.ok || json.error || !json.upload) {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      // If PUBLIC_BASE_URL isn't set the file is still saved locally
      // but Graph can't fetch it — warn the user instead of silently
      // shipping a localhost URL.
      if (!json.upload.absoluteUrl) {
        setUploadError(
          'File uploaded but PUBLIC_BASE_URL env is not set, so Facebook can\'t fetch it. Set PUBLIC_BASE_URL or paste a public URL instead.',
        );
      }
      setMediaUrl(json.upload.publicPath);
      setMediaAbsoluteUrl(json.upload.absoluteUrl);
      // Auto-pick the kind from the upload type.
      if (json.upload.kind === 'video') setMediaKind('reel');
      else if (mediaKind === 'text') setMediaKind('photo');
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  /// Pick the URL to send to FB. If the user uploaded a file we have
  /// both a relative publicPath and (hopefully) an absolute URL — Graph
  /// needs absolute, so prefer that. If the user pasted a URL directly
  /// we just send it verbatim.
  function mediaUrlForFB(): string | null {
    const trimmed = mediaUrl.trim();
    if (trimmed.length === 0) return null;
    if (mediaAbsoluteUrl) return mediaAbsoluteUrl;
    // If the user pasted a URL we expect it to be absolute already.
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    setLoadingConns(true);
    fetch('/api/facebook/connections')
      .then(async (res) => {
        const json = (await res.json()) as ConnectionsResponse | { error: string; message: string };
        if (cancelled) return;
        if (!res.ok || 'error' in json) {
          setListError('message' in json ? json.message : `HTTP ${res.status}`);
          return;
        }
        const activeOnly = json.connections.filter((c) => c.active);
        setConnections(activeOnly);
        if (activeOnly.length === 1) setSelectedId(activeOnly[0].id);
      })
      .catch((err: unknown) => {
        if (!cancelled) setListError(err instanceof Error ? err.message : 'unknown error');
      })
      .finally(() => {
        if (!cancelled) setLoadingConns(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (!selectedId) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const url = mediaKind === 'text' ? null : mediaUrlForFB();
    if (mediaKind !== 'text' && !url) {
      setPostError(
        mediaUrl.trim().length === 0
          ? `Add ${mediaKind === 'reel' ? 'a video' : 'an image'} URL or upload a file first`
          : 'Uploaded file is not publicly reachable — set PUBLIC_BASE_URL or paste a remote URL',
      );
      return;
    }
    setPosting(true);
    setPostError(null);
    setResult(null);
    try {
      const res = await fetch('/api/facebook/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: selectedId,
          message: trimmed,
          imageUrl: mediaKind === 'photo' ? url : null,
          videoUrl: mediaKind === 'reel' ? url : null,
          draftId,
          pieceIndex,
        }),
      });
      const json = (await res.json()) as { event?: FacebookPostEventRow; error?: string; message?: string };
      if (!res.ok || json.error) {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      if (json.event) {
        setResult(json.event);
        if (json.event.status === 'POSTED') {
          onPosted();
        }
      }
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setPosting(false);
    }
  }

  async function schedule() {
    if (!selectedId) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime())) {
      setPostError('Pick a valid date/time');
      return;
    }
    setScheduling(true);
    setPostError(null);
    setScheduleResult(null);
    try {
      const url = mediaKind === 'text' ? null : mediaUrlForFB();
      if (mediaKind !== 'text' && !url) {
        setPostError(
          mediaUrl.trim().length === 0
            ? `Add ${mediaKind === 'reel' ? 'a video' : 'an image'} URL or upload a file first`
            : 'Uploaded file is not publicly reachable — set PUBLIC_BASE_URL or paste a remote URL',
        );
        return;
      }
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          kind: 'fb-post',
          scheduledAt: when.toISOString(),
          config: {
            connectionId: selectedId,
            body: trimmed,
            imageUrl: mediaKind === 'photo' ? url : null,
            videoUrl: mediaKind === 'reel' ? url : null,
          },
        }),
      });
      const json = (await res.json()) as {
        scheduled?: { id: string; scheduledAt: string };
        error?: string;
        message?: string;
      };
      if (!res.ok || json.error) {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      if (json.scheduled) {
        setScheduleResult(json.scheduled);
        onPosted();
      }
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setScheduling(false);
    }
  }

  /// Compute the first fire from the day-of-week + time picker, in the
  /// browser's local timezone. If the target slot is already in the
  /// past for "today", bump to next week. The server stores both the
  /// timezone IANA name and the resolved UTC instant.
  function computeFirstFire(): Date {
    const [h, m] = hhmm.split(':').map((s) => Number(s));
    const now = new Date();
    const target = new Date(now);
    const currentDow = now.getDay();
    let deltaDays = dow - currentDow;
    if (deltaDays < 0) deltaDays += 7;
    target.setDate(now.getDate() + deltaDays);
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 7);
    }
    return target;
  }

  async function scheduleRecurring() {
    if (!selectedId) return;
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const [h, m] = hhmm.split(':').map((s) => Number(s));
    if (!Number.isInteger(h) || !Number.isInteger(m)) {
      setPostError('Pick a valid time');
      return;
    }
    setScheduling(true);
    setPostError(null);
    setRecurringResult(null);
    try {
      const firstFireAt = computeFirstFire();
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const url = mediaKind === 'text' ? null : mediaUrlForFB();
      if (mediaKind !== 'text' && !url) {
        setPostError(
          mediaUrl.trim().length === 0
            ? `Add ${mediaKind === 'reel' ? 'a video' : 'an image'} URL or upload a file first`
            : 'Uploaded file is not publicly reachable — set PUBLIC_BASE_URL or paste a remote URL',
        );
        return;
      }
      const res = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/recurring`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIndex,
          kind: 'fb-post',
          dayOfWeek: dow,
          hour: h,
          minute: m,
          timezone,
          firstFireAt: firstFireAt.toISOString(),
          config: {
            connectionId: selectedId,
            body: trimmed,
            imageUrl: mediaKind === 'photo' ? url : null,
            videoUrl: mediaKind === 'reel' ? url : null,
          },
        }),
      });
      const json = (await res.json()) as {
        recurring?: { id: string; nextFireAt: string };
        error?: string;
        message?: string;
      };
      if (!res.ok || json.error) {
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }
      if (json.recurring) {
        setRecurringResult(json.recurring);
        onPosted();
      }
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="border-t border-primary/30 bg-primary/5 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
          <FacebookIcon size={11} className="text-primary" />
          Post to Facebook
        </p>
        <button
          onClick={onClose}
          className="text-muted-foreground/70 hover:text-foreground "
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      {loadingConns ? (
        <p className="text-xs text-muted-foreground">Loading pages…</p>
      ) : listError ? (
        <p className="text-xs text-destructive font-mono break-all">{listError}</p>
      ) : connections.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No active Facebook pages connected.{' '}
          <Link
            href="/connections"
            className="text-primary hover:text-blue-700 underline-offset-2 hover:underline"
          >
            Connect one →
          </Link>
        </p>
      ) : (
        <>
          {connections.length > 1 && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
                Page
              </label>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value || null)}
                disabled={posting}
                className="w-full bg-card border border-border text-sm text-foreground px-3 py-2"
              >
                <option value="">Select a page…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.pageName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
              Post body (edit before posting)
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(10, Math.max(4, body.split('\n').length + 1))}
              maxLength={60000}
              disabled={posting}
              className="w-full bg-card border border-border text-sm text-foreground px-3 py-2 placeholder:text-muted-foreground/70 focus:outline-none focus:border-blue-600 font-sans resize-y"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {body.length} chars
                {body !== pieceContent && ' · edited'}
              </span>
              {body !== pieceContent && (
                <button
                  onClick={() => setBody(pieceContent)}
                  disabled={posting}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Reset to original
                </button>
              )}
            </div>
          </label>

          {/* Media kind toggle — text-only / photo / reel */}
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest">
            {(['text', 'photo', 'reel'] as const).map((k) => {
              const Icon = k === 'text' ? Type : k === 'photo' ? ImageIcon : Video;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setMediaKind(k)}
                  className={`px-2 py-1 border inline-flex items-center gap-1 ${
                    mediaKind === k
                      ? 'bg-foreground text-background border-zinc-900 dark:border-zinc-100'
                      : 'text-muted-foreground border-border'
                  }`}
                >
                  <Icon size={10} />
                  {k === 'text' ? 'Text only' : k === 'photo' ? 'Photo' : 'Reel'}
                </button>
              );
            })}
          </div>
          {mediaKind !== 'text' && (
            <div className="space-y-1.5 border border-border px-3 py-2 bg-card">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="block flex-1 min-w-[180px]">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
                    {mediaKind === 'photo' ? 'Image URL' : 'Video URL (.mp4)'} or upload
                  </span>
                  <input
                    value={mediaUrl}
                    onChange={(e) => {
                      setMediaUrl(e.target.value);
                      setMediaAbsoluteUrl(null);
                    }}
                    disabled={posting || uploading}
                    placeholder={
                      mediaKind === 'photo'
                        ? 'https://… (public image URL)'
                        : 'https://… (public MP4 URL)'
                    }
                    className="w-full bg-card border border-border text-xs text-foreground px-3 py-1.5 focus:outline-none focus:border-blue-600 font-mono break-all"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={posting || uploading}
                  className="inline-flex items-center gap-1 text-[10px] tracking-widest uppercase text-foreground/90 hover:text-primary disabled:opacity-50 px-2 py-1.5 border border-border"
                >
                  <Upload size={11} />
                  {uploading ? 'Uploading…' : 'Upload file'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={mediaKind === 'photo' ? 'image/jpeg,image/png,image/gif,image/webp' : 'video/mp4,video/quicktime'}
                  onChange={handleFileSelected}
                  className="hidden"
                />
              </div>
              {mediaAbsoluteUrl && (
                <p className="text-[10px] text-muted-foreground break-all">
                  Will be fetched by Facebook from <span className="font-mono">{mediaAbsoluteUrl}</span>
                </p>
              )}
              {uploadError && (
                <p className="text-[11px] text-amber-300 break-words">{uploadError}</p>
              )}
              {mediaKind === 'reel' && (
                <p className="text-[10px] text-muted-foreground">
                  Reels must be vertical 9:16 MP4, 3-90s. Facebook re-encodes on its side; the post appears 1-2 min after fire.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest">
            <button
              type="button"
              onClick={() => setMode('now')}
              className={`px-2 py-1 border ${
                mode === 'now'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-muted-foreground border-border'
              }`}
            >
              Post now
            </button>
            <button
              type="button"
              onClick={() => setMode('later')}
              className={`px-2 py-1 border inline-flex items-center gap-1 ${
                mode === 'later'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-muted-foreground border-border'
              }`}
            >
              <Clock size={10} />
              Schedule for later
            </button>
            <button
              type="button"
              onClick={() => setMode('recurring')}
              className={`px-2 py-1 border inline-flex items-center gap-1 ${
                mode === 'recurring'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-muted-foreground border-border'
              }`}
            >
              <Repeat size={10} />
              Recurring weekly
            </button>
          </div>
          {mode === 'later' && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
                Fire at
              </span>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                disabled={scheduling}
                className="bg-card border border-border text-sm text-foreground px-3 py-2 focus:outline-none focus:border-blue-600"
              />
            </label>
          )}
          {mode === 'recurring' && (
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
                  Every
                </span>
                <select
                  value={dow}
                  onChange={(e) => setDow(Number(e.target.value))}
                  disabled={scheduling}
                  className="bg-card border border-border text-sm text-foreground px-3 py-2"
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                  <option value={2}>Tuesday</option>
                  <option value={3}>Wednesday</option>
                  <option value={4}>Thursday</option>
                  <option value={5}>Friday</option>
                  <option value={6}>Saturday</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 block">
                  At
                </span>
                <input
                  type="time"
                  value={hhmm}
                  step={300}
                  onChange={(e) => setHhmm(e.target.value)}
                  disabled={scheduling}
                  className="bg-card border border-border text-sm text-foreground px-3 py-2"
                />
              </label>
              <span className="text-[10px] text-muted-foreground self-center pb-1">
                {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'} time
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {mode === 'now'
                ? 'Publishes immediately to the selected page'
                : mode === 'later'
                ? 'Queued — the scheduler fires it at the chosen time (only while the draft is APPROVED)'
                : 'Fires every chosen weekday until you pause or delete it on /schedules'}
            </span>
            {mode === 'now' ? (
              <button
                onClick={submit}
                disabled={posting || !selectedId || body.trim().length === 0}
                className="bg-primary hover:bg-accent disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
              >
                <Send size={11} />
                {posting ? 'Posting…' : 'Post to Facebook'}
              </button>
            ) : mode === 'later' ? (
              <button
                onClick={schedule}
                disabled={scheduling || !selectedId || body.trim().length === 0}
                className="bg-primary hover:bg-accent disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
              >
                <Clock size={11} />
                {scheduling ? 'Scheduling…' : 'Schedule post'}
              </button>
            ) : (
              <button
                onClick={scheduleRecurring}
                disabled={scheduling || !selectedId || body.trim().length === 0}
                className="bg-primary hover:bg-accent disabled:bg-zinc-300 disabled:text-muted-foreground dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase inline-flex items-center gap-1"
              >
                <Repeat size={11} />
                {scheduling ? 'Saving…' : 'Save recurring'}
              </button>
            )}
          </div>
        </>
      )}

      {postError && (
        <p className="text-xs text-destructive font-mono break-all">{postError}</p>
      )}

      {scheduleResult && (
        <div className="px-3 py-2 text-[11px] font-mono border text-primary bg-primary/10 border-primary/40">
          <span className="font-medium">⧖ Scheduled</span>
          <span className="ml-2">
            fires {new Date(scheduleResult.scheduledAt).toLocaleString()} · id {scheduleResult.id}
          </span>
        </div>
      )}

      {recurringResult && (
        <div className="px-3 py-2 text-[11px] font-mono border text-primary bg-primary/10 border-primary/40">
          <span className="font-medium">↻ Recurring set</span>
          <span className="ml-2">
            first fire {new Date(recurringResult.nextFireAt).toLocaleString()} · id {recurringResult.id}
          </span>
        </div>
      )}

      {result && (
        <div
          className={`px-3 py-2 text-[11px] font-mono border ${
            result.status === 'POSTED'
              ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/60'
              : 'text-amber-300 bg-amber-950/30 border-amber-900/60'
          }`}
        >
          <span className="font-medium">
            {result.status === 'POSTED' ? '✓ Posted' : `✗ ${result.status}`}
          </span>
          {result.providerPostId && (
            <a
              href={`https://www.facebook.com/${result.providerPostId.replace('_', '/posts/')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1 text-blue-700 hover:text-blue-900"
            >
              <ExternalLink size={10} />
              view post
            </a>
          )}
          {result.error && (
            <span className="block mt-1 break-all whitespace-pre-wrap">{result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
