import { recommendNextArticles } from '../content/recommendations.js';
import type { ContentActionRecommendation, PerformanceOpportunity, PerformanceOverview } from './types.js';

function priorityLabel(score: number): ContentActionRecommendation['priority'] {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
}

export function buildImproveActions(
  opportunities: PerformanceOpportunity[]
): ContentActionRecommendation[] {
  // One primary action per article — the highest-priority opportunity.
  const byArticle = new Map<string, PerformanceOpportunity>();
  for (const opportunity of opportunities) {
    const key = String(opportunity.articleId);
    const current = byArticle.get(key);
    if (!current || opportunity.priority > current.priority) byArticle.set(key, opportunity);
  }

  return [...byArticle.values()]
    .map((opportunity) => ({
      id: `improve-${opportunity.id}`,
      siteId: opportunity.siteId,
      articleId: opportunity.articleId,
      title: opportunity.articleTitle,
      group: 'IMPROVE' as const,
      action: opportunity.recommendedAction,
      priority: priorityLabel(opportunity.priority),
      priorityScore: opportunity.priority,
      reasons: [opportunity.reason, ...opportunity.evidence.slice(0, 3)],
      contributingSignals: opportunity.contributingSignals,
      evidence: opportunity.evidence,
      confidence: opportunity.confidence,
      opportunityId: opportunity.id
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

export function buildCreateActions(siteId: string): ContentActionRecommendation[] {
  const { recommendations } = recommendNextArticles({ siteId, limit: 8, currentMonth: new Date().getMonth() });
  return recommendations.map((row) => ({
    id: `create-${row.opportunityId}`,
    siteId,
    title: row.title,
    group: 'CREATE' as const,
    action: 'CREATE' as const,
    priority: priorityLabel(row.priority),
    priorityScore: row.priority,
    reasons: row.whyBullets.slice(0, 4),
    contributingSignals: row.scoringFactors.map((factor) => factor.label),
    evidence: row.scoringFactors.map((factor) => factor.evidence),
    confidence: row.confidence,
    opportunityId: row.opportunityId
  }));
}

export function buildNextActionsOverview(params: {
  siteId: string;
  opportunities: PerformanceOpportunity[];
  decayCounts: PerformanceOverview['counts'];
  providers: PerformanceOverview['providers'];
}): Pick<
  PerformanceOverview,
  'topPriorities' | 'createRecommendations' | 'improveRecommendations' | 'overall' | 'hasSearchPerformance' | 'hasAnalytics'
> {
  const improveRecommendations = buildImproveActions(params.opportunities);
  const createRecommendations = buildCreateActions(params.siteId);
  const topPriorities = [...improveRecommendations, ...createRecommendations]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 8);

  const gsc = params.providers.find((provider) => provider.provider === 'search_console');
  const ga = params.providers.find((provider) => provider.provider === 'analytics');
  const needsAttention =
    params.decayCounts.declining + params.decayCounts.decayed + params.decayCounts.watch > 0;

  return {
    topPriorities,
    createRecommendations,
    improveRecommendations,
    overall: needsAttention
      ? 'attention_needed'
      : params.decayCounts.needsData === params.decayCounts.total && params.decayCounts.total > 0
        ? 'needs_data'
        : 'healthy',
    hasSearchPerformance: gsc?.status === 'connected',
    hasAnalytics: ga?.status === 'connected'
  };
}
