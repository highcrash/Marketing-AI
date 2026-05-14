'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface BusinessSummary {
  id: string;
  organizationId: string | null;
  name: string;
  baseUrl: string;
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
  const [active, setActive] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Hit /api/orgs first so any orphan business gets adopted before
      // /api/businesses is asked which businesses the user owns.
      try {
        await fetch('/api/orgs');
        const res = await fetch('/api/businesses');
        const body = (await res.json()) as { businesses?: BusinessSummary[] };
        if (cancelled) return;
        const list = body.businesses ?? [];
        setBusinesses(list);
        setActive(list[0] ?? null);
      } catch {
        // Best-effort; switcher just renders empty.
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
        <DropdownMenuItem
          disabled
          className="cursor-not-allowed opacity-60 text-[11px]"
          title="Onboarding UI for adding a new business arrives in the next UI pass"
        >
          <Plus className="h-3.5 w-3.5" />
          Add business…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
