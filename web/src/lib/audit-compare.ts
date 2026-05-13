import { prisma } from './db';
import type { AnalysisResult, Recommendation } from './ai/analyze';

export interface AuditComparison {
  /// Identity of the previous audit being compared to.
  previousId: string;
  previousGeneratedAt: string;
  /// How long elapsed between the two audits.
  daysBetween: number;
  /// Recommendation titles present in the CURRENT audit but not in the
  /// previous. Match is exact-string on title — Claude tends to reuse
  /// titles across runs when the same lever is still relevant, so this
  /// catches what's genuinely new.
  newRecommendationTitles: string[];
  /// Titles in PREVIOUS but not in current — the AI no longer thinks
  /// this is the right move (or the data changed enough that a
  /// different angle dominates).
  removedRecommendationTitles: string[];
  /// Categories with more recs in current than in previous (or vice
  /// versa). Tells you which lever the AI is now leaning on.
  categoryShifts: Array<{
    category: Recommendation['category'];
    previousCount: number;
    currentCount: number;
    delta: number;
  }>;
  /// Summary deltas for the two execs — useful when both have changed
  /// (different snapshot → different exec summary).
  previousSummary: string;
  /// Token deltas for cost tracking.
  tokensDelta: {
    inputDelta: number;
    outputDelta: number;
  };
}

/// Build the comparison between this analysis and the one immediately
/// before it (by createdAt). Returns null when there's no prior audit
/// — first runs have nothing to compare against.
export async function getAuditComparison(
  currentId: string,
  businessId: string,
): Promise<AuditComparison | null> {
  const current = await prisma.analysis.findFirst({
    where: { id: currentId, businessId },
  });
  if (!current) return null;

  const previous = await prisma.analysis.findFirst({
    where: {
      businessId,
      createdAt: { lt: current.createdAt },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!previous) return null;

  const currentPayload = JSON.parse(current.payload) as AnalysisResult;
  const previousPayload = JSON.parse(previous.payload) as AnalysisResult;

  const currentTitles = new Set(currentPayload.recommendations.map((r) => r.title));
  const previousTitles = new Set(previousPayload.recommendations.map((r) => r.title));

  const newTitles = [...currentTitles].filter((t) => !previousTitles.has(t));
  const removedTitles = [...previousTitles].filter((t) => !currentTitles.has(t));

  const byCategory = (recs: Recommendation[]): Map<Recommendation['category'], number> => {
    const m = new Map<Recommendation['category'], number>();
    for (const r of recs) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  };
  const currentByCat = byCategory(currentPayload.recommendations);
  const previousByCat = byCategory(previousPayload.recommendations);
  const allCats = new Set([...currentByCat.keys(), ...previousByCat.keys()]);
  const categoryShifts: AuditComparison['categoryShifts'] = [];
  for (const cat of allCats) {
    const prev = previousByCat.get(cat) ?? 0;
    const curr = currentByCat.get(cat) ?? 0;
    if (prev !== curr) {
      categoryShifts.push({ category: cat, previousCount: prev, currentCount: curr, delta: curr - prev });
    }
  }
  categoryShifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const daysBetween = Math.round(
    (current.createdAt.getTime() - previous.createdAt.getTime()) / 86_400_000,
  );

  return {
    previousId: previous.id,
    previousGeneratedAt: previous.generatedAt.toISOString(),
    daysBetween,
    newRecommendationTitles: newTitles,
    removedRecommendationTitles: removedTitles,
    categoryShifts,
    previousSummary: previousPayload.summary,
    tokensDelta: {
      inputDelta: current.inputTokens - previous.inputTokens,
      outputDelta: current.outputTokens - previous.outputTokens,
    },
  };
}
