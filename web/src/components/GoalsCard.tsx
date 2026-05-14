'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Save, Target, X } from 'lucide-react';

import type { BusinessGoals, StandardGoalTag } from '@/lib/business';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 py-4">
        <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground font-semibold">
          <Target className="h-4 w-4 text-primary" />
          Marketing goals
        </CardTitle>
        {!editing && !loading && (
          <Button variant="ghost" size="sm" onClick={openEditor} className="gap-1">
            {goals.tags.length === 0 && !goals.notes ? (
              <>
                <Plus className="h-3.5 w-3.5" />
                Set
              </>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </>
            )}
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>What outcomes matter most? (pick any)</Label>
              <div className="flex flex-wrap gap-1.5">
                {options.map((tag) => {
                  const active = draftTags.has(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      disabled={saving}
                      className={cn(
                        'px-2.5 py-1 text-[11px] tracking-wider border transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'text-muted-foreground border-border hover:border-primary hover:text-primary',
                      )}
                    >
                      {TAG_LABEL[tag] ?? tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-notes">Context the audit should know about (optional)</Label>
              <Textarea
                id="goal-notes"
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                disabled={saving}
                placeholder="e.g. Opening a second branch in July. Eid week is our biggest spike. Budget tight, prefer organic over paid."
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {draftNotes.length}/1000
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="font-mono break-all">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={saving}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={saving} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving…' : 'Save goals'}
              </Button>
            </div>
          </div>
        ) : goals.tags.length === 0 && !goals.notes ? (
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            No goals set — the next audit lets Claude infer goals from your data. Set goals here
            to bias recommendations toward what you actually care about.
          </p>
        ) : (
          <div className="space-y-3">
            {goals.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {goals.tags.map((tag) => (
                  <Badge key={tag} variant="default">
                    {TAG_LABEL[tag] ?? tag}
                  </Badge>
                ))}
              </div>
            )}
            {goals.notes && (
              <p className="text-sm text-foreground/90 leading-relaxed border-l-2 border-primary pl-3 py-0.5 italic">
                {goals.notes}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
