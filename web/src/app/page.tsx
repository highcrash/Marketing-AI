import { AnalysisDashboard } from '@/components/AnalysisDashboard';
import { getOrCreateBusinessFromEnv } from '@/lib/business';
import { getLatestAnalysis, listAnalyses } from '@/lib/analyses';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let bootstrap:
    | { ok: true; businessName: string; latest: { id: string; result: import('@/lib/ai/analyze').AnalysisResult } | null; list: import('@/lib/analyses').AnalysisListItem[] }
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
    <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-red-600 font-medium mb-1">
                Marketing AI · Phase 1.C
              </p>
              <h1 className="text-2xl font-semibold">
                {bootstrap.ok ? bootstrap.businessName : 'Marketing AI'}
              </h1>
            </div>
            <p className="text-xs text-zinc-500 max-w-md text-right">
              Read-only analyst. Pulls business data from your connected endpoint and produces grounded,
              prioritized recommendations.
            </p>
          </div>
        </div>
      </header>

      {bootstrap.ok ? (
        <AnalysisDashboard
          initialLatest={bootstrap.latest}
          initialList={bootstrap.list}
        />
      ) : (
        <div className="max-w-3xl mx-auto p-6 mt-12 border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800">
          <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
            Couldn&apos;t connect a business
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 font-mono">{bootstrap.error}</p>
          <p className="text-xs text-red-600/80 mt-3">
            Set RESTORA_API_BASE, RESTORA_API_KEY, ANTHROPIC_API_KEY in web/.env, then reload.
          </p>
        </div>
      )}
    </main>
  );
}
