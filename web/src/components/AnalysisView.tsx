'use client';

import type { AnalysisResult, Recommendation } from '@/lib/ai/analyze';

const PRIORITY_STYLES: Record<Recommendation['priority'], string> = {
  high: 'bg-red-600 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-zinc-400 text-white',
};

const CATEGORY_LABEL: Record<Recommendation['category'], string> = {
  acquisition: 'Acquisition',
  retention: 'Retention',
  pricing: 'Pricing',
  'product-mix': 'Product mix',
  'channel-strategy': 'Channel strategy',
  content: 'Content',
  operations: 'Operations',
  brand: 'Brand',
};

function priorityRank(p: Recommendation['priority']): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2;
}

export function AnalysisView({ result }: { result: AnalysisResult }) {
  const grouped: Record<string, Recommendation[]> = {};
  for (const rec of result.recommendations) {
    (grouped[rec.category] ??= []).push(rec);
  }
  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }

  return (
    <div className="space-y-10">
      <section className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2 className="text-xl font-semibold">{result.business.name}</h2>
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            {new Date(result.generatedAt).toLocaleString()} · {result.model}
          </span>
        </div>
        <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{result.summary}</p>
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <Stat label="Input tokens" value={result.inputTokens.toLocaleString()} />
          <Stat
            label="Cache read"
            value={result.cacheReadTokens.toLocaleString()}
            hint={result.cacheReadTokens > 0 ? 'warm hit' : 'first run'}
          />
          <Stat label="Cache write" value={result.cacheWriteTokens.toLocaleString()} />
          <Stat label="Output tokens" value={result.outputTokens.toLocaleString()} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">
          Inferred goals
        </h3>
        <ul className="space-y-2">
          {result.inferredGoals.map((g, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-red-600 mt-1">●</span>
              <span className="text-zinc-700 dark:text-zinc-300">{g}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-8">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Recommendations · {result.recommendations.length}
        </h3>
        {Object.entries(grouped).map(([category, recs]) => (
          <div key={category}>
            <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-4">
              {CATEGORY_LABEL[category as Recommendation['category']] ?? category}
            </h4>
            <div className="space-y-4">
              {recs.map((rec, i) => (
                <RecommendationCard key={`${category}-${i}`} rec={rec} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <article className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
      <header className="flex items-start gap-3 mb-3">
        <span
          className={`text-[10px] tracking-widest uppercase font-semibold px-2 py-0.5 ${
            PRIORITY_STYLES[rec.priority]
          }`}
        >
          {rec.priority}
        </span>
        <h5 className="flex-1 font-semibold text-zinc-900 dark:text-zinc-100">{rec.title}</h5>
      </header>

      <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
        <span className="font-medium text-zinc-500">Why · </span>
        {rec.rationale}
      </p>

      <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
        <span className="font-medium text-zinc-500">Expected impact · </span>
        {rec.expectedImpact}
      </p>

      {rec.estimatedBudgetBdt != null && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
          <span className="font-medium text-zinc-500">Suggested budget · </span>
          ৳{rec.estimatedBudgetBdt.toLocaleString()}/month
        </p>
      )}

      <div className="mt-3">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          First actions this week
        </p>
        <ul className="space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          {rec.firstActionsThisWeek.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-400">→</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-900 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        {rec.requiresHumanForExecution && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
            ⚠ requires human creative
          </span>
        )}
        {rec.relatedSkills.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {rec.relatedSkills.map((s) => (
              <span
                key={s}
                className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 font-mono text-[10px]"
              >
                {s}
              </span>
            ))}
          </span>
        )}
      </footer>
    </article>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {value}
        {hint && (
          <span className="ml-2 text-[10px] text-zinc-400 normal-case tracking-normal">({hint})</span>
        )}
      </div>
    </div>
  );
}
