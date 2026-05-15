'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Pencil, Save, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface TimezoneResponse {
  /// Owner-set override; null when not set.
  override: string | null;
  /// What Restora's /business/profile reports; null when unreachable.
  fromRestora: string | null;
  /// The zone the AI pipeline will use right now.
  effective: string;
  suggestions: string[];
}

export function TimezoneCard() {
  const [state, setState] = useState<TimezoneResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/business/timezone');
      const body = (await res.json()) as TimezoneResponse | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setState(body);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openEditor() {
    if (!state) return;
    setDraft(state.override ?? state.fromRestora ?? '');
    setError(null);
    setEditing(true);
  }

  async function save(value: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/business/timezone', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: value }),
      });
      const body = (await res.json()) as
        | { override: string | null }
        | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setEditing(false);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  const override = state?.override ?? null;
  const fromRestora = state?.fromRestora ?? null;
  const effective = state?.effective ?? null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 py-4">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
          <Clock className="h-4 w-4 text-primary" />
          Timezone
        </CardTitle>
        {!editing && !loading && (
          <Button variant="ghost" size="sm" onClick={openEditor} className="gap-1">
            <Pencil className="h-3.5 w-3.5" />
            {override ? 'Edit' : 'Override'}
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : editing ? (
          <EditView
            state={state}
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            error={error}
            onCancel={() => {
              setEditing(false);
              setError(null);
            }}
            onSave={() => save(draft.trim().length > 0 ? draft.trim() : null)}
            onClear={() => save(null)}
          />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground min-w-[80px]">
                In use
              </span>
              <Badge variant="default" className="font-mono">
                {effective}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground min-w-[80px]">
                From Restora
              </span>
              <span className="text-muted-foreground font-mono text-[12px]">
                {fromRestora ?? 'unreachable'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground min-w-[80px]">
                Override
              </span>
              {override ? (
                <span className="text-foreground font-mono text-[12px]">{override}</span>
              ) : (
                <span className="text-muted-foreground italic text-[12px]">none</span>
              )}
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="font-mono break-all">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditView({
  state,
  draft,
  setDraft,
  saving,
  error,
  onCancel,
  onSave,
  onClear,
}: {
  state: TimezoneResponse | null;
  draft: string;
  setDraft: (v: string) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: () => void;
  onClear: () => void;
}) {
  const suggestions = state?.suggestions ?? [];
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Common zones</Label>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => {
            const active = draft === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(s)}
                disabled={saving}
                className={cn(
                  'px-2 py-1 text-[11px] font-mono tracking-tight border transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'text-muted-foreground border-border hover:border-primary hover:text-primary',
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tz-input">Or type any IANA zone</Label>
        <Input
          id="tz-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Asia/Dhaka"
          disabled={saving}
          className="font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-[10px] text-muted-foreground">
          Used for &quot;today&quot; in audit prompts and rendering plan/draft/schedule timestamps.
          Clear to fall back to whatever Restora reports
          {state?.fromRestora ? ` (currently ${state.fromRestora})` : ''}.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="font-mono break-all">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={saving || !state?.override}
          className="gap-1 text-muted-foreground hover:text-destructive"
        >
          Clear override
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={saving}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={saving || draft.trim().length === 0}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
