'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Plus, Tag, TrendingUp } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CampaignCodeRow {
  id: string;
  code: string;
  draftId: string;
  pieceIndex: number;
  label: string | null;
  redemptionCount: number;
  totalAmountMinor: number;
  totalQty: number;
}

interface CampaignRedemptionRow {
  id: string;
  codeId: string;
  amountMinor: number;
  qty: number;
  source: string;
  notes: string | null;
  redeemedAt: string;
}

/// Inline panel under a draft piece that mints a tracking code, lets
/// the user log redemptions manually, and surfaces revenue attribution.
/// Renders nothing until expanded — saves vertical space on dense
/// dashboards.
export function CampaignCodePanel({ draftId, pieceIndex }: { draftId: string; pieceIndex: number }) {
  const [codes, setCodes] = useState<CampaignCodeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeRedeem, setActiveRedeem] = useState<CampaignCodeRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns/codes');
      const body = (await res.json()) as { codes?: CampaignCodeRow[] };
      const all = body.codes ?? [];
      setCodes(all.filter((c) => c.draftId === draftId && c.pieceIndex === pieceIndex));
    } catch {
      // Best-effort.
    } finally {
      setLoading(false);
    }
  }, [draftId, pieceIndex]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function mint() {
    setMinting(true);
    setError(null);
    try {
      const res = await fetch('/api/campaigns/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, pieceIndex }),
      });
      const body = (await res.json()) as { code?: CampaignCodeRow; error?: string; message?: string };
      if (!res.ok || body.error || !body.code) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      setCodes((prev) => [body.code!, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setMinting(false);
    }
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="border-t border-border/60 bg-secondary/30 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
          <Tag className="h-3 w-3 text-primary" />
          Tracking codes
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={mint}
          disabled={minting}
          className="h-7 gap-1.5 text-[10px]"
        >
          {minting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Mint code
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-[11px] font-mono break-all">{error}</AlertDescription>
        </Alert>
      )}

      {loading && codes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">Loading…</p>
      ) : codes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          No tracking codes yet. Mint one and weave it into your message body — every redemption
          logged here gets attributed back to this piece.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {codes.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[12px]">
              <button
                onClick={() => copy(c.code)}
                className="inline-flex items-center gap-1.5 px-2 py-1 font-mono bg-card border border-border hover:border-primary hover:text-primary transition-colors"
                title="Click to copy"
              >
                {copied === c.code ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{c.code}</span>
              </button>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {c.redemptionCount > 0 ? (
                  <>
                    {c.totalQty} redemption{c.totalQty === 1 ? '' : 's'} · ৳
                    {(c.totalAmountMinor / 100).toLocaleString()}
                  </>
                ) : (
                  '0 redemptions'
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveRedeem(c)}
                className="h-6 ml-auto text-[10px]"
              >
                Log redemption
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LogRedemptionDialog
        code={activeRedeem}
        onClose={() => setActiveRedeem(null)}
        onLogged={() => {
          void refresh();
          setActiveRedeem(null);
        }}
      />
    </div>
  );
}

function LogRedemptionDialog({
  code,
  onClose,
  onLogged,
}: {
  code: CampaignCodeRow | null;
  onClose: () => void;
  onLogged: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (code) {
      setAmount('');
      setQty('1');
      setNotes('');
      setError(null);
    }
  }, [code]);

  async function submit() {
    if (!code) return;
    const amountMinor = Math.max(0, Math.round(Number(amount) * 100));
    const qtyNum = Math.max(1, Math.floor(Number(qty)));
    if (!Number.isFinite(amountMinor) || !Number.isFinite(qtyNum)) {
      setError('Amount and quantity must be numbers');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/codes/${encodeURIComponent(code.code)}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMinor,
          qty: qtyNum,
          source: 'manual',
          notes: notes.trim() || null,
        }),
      });
      const body = (await res.json()) as { redemption?: CampaignRedemptionRow; error?: string; message?: string };
      if (!res.ok || body.error) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      onLogged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!code} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">
            Log redemption · {code?.code}
          </DialogTitle>
          <DialogDescription>
            Record the revenue + customer count for code redemptions seen at POS. Track manually
            today; a future Restora webhook will push these automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="amt">Revenue (৳)</Label>
            <Input
              id="amt"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting}
              placeholder="1400"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qty">Customers / orders</Label>
            <Input
              id="qty"
              type="number"
              step="1"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={2}
            maxLength={500}
            placeholder="e.g. Tuesday lunch rush, 3 separate parties used the code"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="font-mono text-xs break-all">{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logging
              </>
            ) : (
              'Log redemption'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
