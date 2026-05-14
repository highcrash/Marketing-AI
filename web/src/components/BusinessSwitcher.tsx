'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface BusinessSummary {
  id: string;
  organizationId: string | null;
  name: string;
  baseUrl: string;
}

interface OrgSummary {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

/// Active-business picker for the header. Reads /api/businesses (which
/// also auto-adopts any orphan env-bootstrapped business into a default
/// org for the user on first call), highlights the active one, and
/// posts to /api/users/me/active-business when the user picks a new
/// one. Existing audit/draft routes still resolve the business from
/// env until they're migrated to getCurrentBusinessForUser; the
/// switcher persists the choice so it's ready when that migration
/// lands.
export function BusinessSwitcher() {
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [active, setActive] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function reload() {
    try {
      const orgsRes = await fetch('/api/orgs');
      const orgsBody = (await orgsRes.json()) as { orgs?: OrgSummary[] };
      setOrgs(orgsBody.orgs ?? []);
      const res = await fetch('/api/businesses');
      const body = (await res.json()) as { businesses?: BusinessSummary[] };
      const list = body.businesses ?? [];
      setBusinesses(list);
      setActive((prev) => prev ?? list[0] ?? null);
    } catch {
      // Best-effort; switcher just renders empty.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        await reload();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(b: BusinessSummary) {
    if (b.id === active?.id || switching) return;
    setSwitching(true);
    try {
      await fetch('/api/users/me/active-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: b.id }),
      });
      setActive(b);
      // Trigger a re-render of pages that read the active business.
      window.location.reload();
    } finally {
      setSwitching(false);
    }
  }

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 normal-case tracking-normal">
        <Building2 className="h-3.5 w-3.5" />
        Loading…
      </Button>
    );
  }
  if (businesses.length === 0) {
    return null;
  }

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 normal-case tracking-normal max-w-[200px]"
          disabled={switching}
        >
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="truncate font-medium">{active?.name ?? 'Pick a business'}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-60 ml-auto" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuLabel>Switch business</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {businesses.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => pick(b)}
            className={cn('cursor-pointer flex-col items-start gap-0', b.id === active?.id && 'bg-secondary')}
          >
            <div className="flex items-center gap-2 w-full">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm flex-1 truncate">{b.name}</span>
              {b.id === active?.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono ml-5.5 truncate w-full">
              {new URL(b.baseUrl).host}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setShowAdd(true)} className="cursor-pointer">
          <Plus className="h-3.5 w-3.5 text-primary" />
          Add business…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AddBusinessDialog
      open={showAdd}
      orgs={orgs}
      onOpenChange={setShowAdd}
      onAdded={async (b) => {
        await reload();
        setActive(b);
        setShowAdd(false);
      }}
    />
    </>
  );
}

function AddBusinessDialog({
  open,
  orgs,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  orgs: OrgSummary[];
  onOpenChange: (o: boolean) => void;
  onAdded: (b: BusinessSummary) => void;
}) {
  const adminOrgs = orgs.filter((o) => o.role === 'OWNER' || o.role === 'ADMIN');
  const [orgId, setOrgId] = useState(adminOrgs[0]?.id ?? '');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && !orgId && adminOrgs[0]) setOrgId(adminOrgs[0].id);
  }, [open, adminOrgs, orgId]);

  async function submit() {
    if (!orgId || !baseUrl.trim() || !apiKey.trim()) {
      setError('Org + baseUrl + apiKey all required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          baseUrl: baseUrl.trim().replace(/\/$/, ''),
          apiKey: apiKey.trim(),
        }),
      });
      const body = (await res.json()) as { business?: BusinessSummary; error?: string; message?: string };
      if (!res.ok || body.error || !body.business) {
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      onAdded(body.business);
      // Reset for next open.
      setBaseUrl('');
      setApiKey('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Connect another business
          </DialogTitle>
          <DialogDescription>
            Marketing AI calls your Restora API on every audit. Paste the business&apos;s
            /v1/external base URL and an API key with the right scopes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {adminOrgs.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="org">Organization</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger id="org" disabled={submitting}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {adminOrgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="base">Base URL</Label>
            <Input
              id="base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={submitting}
              placeholder="https://api.example.com/api/v1/external"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="key">API key</Label>
            <Input
              id="key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={submitting}
              placeholder="rk_xxxx_xxxxxxxxx"
              className="font-mono text-xs"
              autoComplete="off"
            />
            <p className="text-[10px] text-muted-foreground">
              We&apos;ll validate by calling /business/profile before saving.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="font-mono break-all text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !baseUrl || !apiKey}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
