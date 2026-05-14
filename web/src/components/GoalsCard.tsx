'use client';

import { useCallback, useEffect, useState } from 'react';
import { Target, X } from 'lucide-react';

import type { BusinessGoals, StandardGoalTag } from '@/lib/business';

interface GoalsResponse {
  goals: BusinessGoals;
  options: readonly StandardGoalTag[];
}

const TAG_LABEL: Record<StandardGoalTag, string> = {
  acquisition: 'Acquisition',
  retention: 'Retention',
  reach: 'Reach',
  engagement: 'Engagement',
  conversions: 'Conversions',
  'brand-awareness': 'Brand awareness',
  'lead-generation': 'Lead generation',
  'increase-sales': 'Increase sales',
};

export function GoalsCard() {
  const [goals, setGoals] = useState<BusinessGoals>({ tags: [], notes: null });
  const [options, setOptions] = useState<readonly StandardGoalTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftTags, setDraftTags] = useState<Set<StandardGoalTag>>(new Set());
  const [draftNotes, setDraftNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/business/goals');
      const body = (await res.json()) as GoalsResponse | { error: string; message: string };
      if (!res.ok || 'error' in body) {
        throw new Error('message' in body ? body.message : `HTTP ${res.status}`);
      }
      setGoals(body.goals);
      setOptions(body.options);
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
    setDraftTags(new Set(goals.tags));
    setDraftNotes(goals.notes ?? '');
    setError(null);
    setEditing(true);
  }

  function toggleTag(tag: StandardGoalTag) {
    setDraftTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/business/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: Array.from(draftTags),
          notes: draftNotes.trim().length > 0 ? draftNotes.trim() : null,
        }),
      });
      const body = (await res.json()) as { goals?: BusinessGoals; error?: string; message?: string };
      if (!res.ok || body.error) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      if (body.goals) setGoals(body.goals);
      setEditing(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-red-600" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Marketing goals
          </h3>
        </div>
        {!editing && !loading && (
          <button
            onClick={openEditor}
            className="text-[10px] tracking-widest uppercase text-zinc-500 hover:text-red-600"
          >
            {goals.tags.length === 0 && !goals.notes ? '+ Set goals' : 'Edit'}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : editing ? (
        <div className="space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
              What outcomes matter most? (pick any)
            </p>
            <div className="flex flex-wrap gap-1">
              {options.map((tag) => {
                const active = draftTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    disabled={saving}
                    className={`px-2 py-1 text-[11px] tracking-wider border ${
                      active
                        ? 'bg-red-600 text-white border-red-600'
                        : 'text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-red-600 hover:text-red-600'
                    }`}
                  >
                    {TAG_LABEL[tag] ?? tag}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
              Context the audit should know about (optional)
            </p>
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              disabled={saving}
              placeholder="e.g. Opening a second branch in July. Eid week is our biggest spike. Budget tight, prefer organic over paid."
              className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 px-3 py-2 placeholder:text-zinc-400 focus:outline-none focus:border-red-600 resize-y"
            />
            <div className="text-[10px] text-zinc-500 mt-1 text-right">
              {draftNotes.length}/1000
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
              className="text-[10px] tracking-widest uppercase text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1"
            >
              <X size={11} className="inline mr-1" />
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800 text-white px-3 py-1.5 text-[10px] font-medium tracking-widest uppercase"
            >
              {saving ? 'Saving…' : 'Save goals'}
            </button>
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">{error}</p>
          )}
        </div>
      ) : goals.tags.length === 0 && !goals.notes ? (
        <p className="text-xs text-zinc-500 italic">
          No goals set — the next audit will let Claude infer goals from your data.
          Set goals here to bias recommendations toward what you actually care about.
        </p>
      ) : (
        <div className="space-y-2">
          {goals.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {goals.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900"
                >
                  {TAG_LABEL[tag] ?? tag}
                </span>
              ))}
            </div>
          )}
          {goals.notes && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words border-l-2 border-red-300 dark:border-red-800 pl-3 py-0.5 italic">
              {goals.notes}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
