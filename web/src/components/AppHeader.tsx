'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import {
  Activity,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Plug,
  Sparkles,
  User,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { HealthBadge } from './HealthBadge';
import { BusinessSwitcher } from './BusinessSwitcher';

const NAV_ITEMS = [
  { href: '/schedules', label: 'Schedules', Icon: Calendar },
  { href: '/completions', label: 'Completions', Icon: CheckCircle2 },
  { href: '/connections', label: 'Connections', Icon: Plug },
] as const;

export function AppHeader() {
  const { data: session, status } = useSession();
  if (status === 'loading') return <HeaderShell />;
  if (!session?.user) return null;

  return (
    <HeaderShell>
      <div className="flex items-center gap-3">
        <BusinessSwitcher />
      </div>

      <nav className="hidden lg:flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => (
          <Button key={href} asChild variant="ghost" size="sm">
            <Link href={href} className="gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          </Button>
        ))}
      </nav>

      <div className="flex items-center gap-2 ml-auto">
        <HealthBadge />
        <Separator orientation="vertical" className="h-6 hidden sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 normal-case tracking-normal">
              <User className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs text-muted-foreground">
                {session.user.email}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{session.user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/schedules" className="cursor-pointer lg:hidden">
                <Calendar className="h-4 w-4" /> Schedules
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/completions" className="cursor-pointer lg:hidden">
                <CheckCircle2 className="h-4 w-4" /> Completions
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/connections" className="cursor-pointer lg:hidden">
                <Plug className="h-4 w-4" /> Connections
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/health" className="cursor-pointer">
                <Activity className="h-4 w-4" /> Health
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </HeaderShell>
  );
}

function HeaderShell({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-[10px] uppercase tracking-[0.3em] font-semibold">Marketing AI</span>
        </Link>
        {children}
      </div>
    </header>
  );
}
