import { AlertTriangle } from 'lucide-react';

import { AnalysisDashboard } from '@/components/AnalysisDashboard';
import { AppHeader } from '@/components/AppHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { getLatestAnalysis, listAnalyses } from '@/lib/analyses';

export const dynamic = 'force-dynamic';

export default async function Home() {
  type Latest = NonNullable<Awaited<ReturnType<typeof getLatestAnalysis>>>;
  let bootstrap:
    | { ok: true; businessName: string; latest: Latest | null; list: import('@/lib/analyses').AnalysisListItem[] }
    | { ok: false; error: string };

  try {
    const business = await getOrCreateBusinessFromEnv();
    const [latest, list] = await Promise.all([
      getLatestAnalysis(business.id),
      listAnalyses(business.id),
    ]);
    bootstrap = { ok: true, businessName: business.name, latest, list };
  } catch (err: unknown) {
    bootstrap = {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to bootstrap business',
    };
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-6 py-8">
        {bootstrap.ok ? (
          <>
            <div className="mb-8 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">
                Audit & campaigns
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {bootstrap.businessName}
              </h1>
              <p className="text-sm text-muted-foreground max-w-2xl">
                AI marketing analyst — pulls business data, drafts campaigns, sends through your
                connected channels.
              </p>
            </div>
            <AnalysisDashboard
              initialLatest={bootstrap.latest}
              initialList={bootstrap.list}
            />
          </>
        ) : (
          <Alert variant="destructive" className="mt-12">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn&apos;t connect a business</AlertTitle>
            <AlertDescription className="font-mono break-all mt-2">
              {bootstrap.error}
              <div className="mt-3 text-xs opacity-80">
                Set RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC_API_KEY in web/.env, then reload.
              </div>
            </AlertDescription>
          </Alert>
        )}
      </main>
    </div>
  );
}
