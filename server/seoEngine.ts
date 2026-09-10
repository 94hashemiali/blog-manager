import { db } from './db.js';
import { getContentIndex } from './intelligence/store.js';
import { buildOpportunities } from './intelligence/opportunities.js';
import { checkDuplication } from './duplicationGuard.js';
import { listCompetitors, upsertCompetitorDomain, interpretCompetitorGaps } from './intelligence/competitors.js';
import { generateJsonContent } from './aiClient.js';

export function calculatePriorityScore(
  businessValue: number,
  trafficPotential: number,
  conversionPotential: number,
  contentGap: number,
  competitionLevel: 'High' | 'Medium' | 'Low',
  duplicationPenalty: number = 0
): number {
  const compWeight = competitionLevel === 'High' ? 6 : competitionLevel === 'Medium' ? 3.5 : 1.5;
  const rawScore =
    businessValue * 1.5 +
    trafficPotential * 1.2 +
    conversionPotential * 1.3 +
    contentGap * 1.5 -
    compWeight * 0.8 -
    duplicationPenalty * 1.5;
  return Math.max(10, Math.min(99, Math.round(rawScore * 1.8)));
}

export async function discoverKeywordOpportunities(siteId: string, seedTopic?: string): Promise<any[]> {
  const site = db.getSiteById(siteId);
  if (!site) throw new Error('Site not found');
  const index = getContentIndex(siteId);
  let opportunities = index.opportunities.length
    ? index.opportunities
    : buildOpportunities({
        siteId,
        articles: index.articles,
        clusters: index.clusters,
        gaps: index.gaps,
        products: index.products,
        categories: index.categories.map((c) => c.name)
      });

  if (seedTopic) {
    opportunities = opportunities.filter(
      (opp) => opp.title.includes(seedTopic) || opp.primaryKeyword.includes(seedTopic) || opp.whyThisArticle.includes(seedTopic)
    );
    if (opportunities.length === 0) {
      try {
        const result = await generateJsonContent({
          stage: 'keyword_seed',
          systemInstruction: 'Propose angles from the seed topic that do not invent search volume. JSON array.',
          prompt: `Seed: ${seedTopic}\nExisting titles: ${index.articles.map((a) => a.title).slice(0, 20).join(' | ')}\nReturn [{"topic","keyword","searchIntent","contentType","reason"}]`
        });
        if (Array.isArray(result.data)) {
          opportunities = result.data.map((row: any, i: number) => ({
            id: `opp-seed-${i}`,
            siteId,
            title: row.topic,
            primaryKeyword: row.keyword,
            secondaryKeywords: [],
            searchIntent: row.searchIntent || 'informational',
            contentType: row.contentType || 'guide',
            businessValue: { value: 6, confidence: 'low', sourceType: 'estimated' },
            trafficPotential: { value: 'Medium', confidence: 'low', sourceType: 'unknown', reason: 'No keyword provider' },
            conversionPotential: { value: 5, confidence: 'low', sourceType: 'estimated' },
            contentGap: { value: 5, confidence: 'low', sourceType: 'inferred' },
            cannibalizationRisk: { value: 'low', confidence: 'medium', sourceType: 'estimated' },
            productRelevance: { value: 4, confidence: 'low', sourceType: 'inferred' },
            priority: 50,
            confidence: 'low',
            whyThisArticle: row.reason,
            scoring: { score: 50, factors: [], reason: 'Seeded idea pending index evidence' },
            recommendedAction: 'create_new',
            productsToMention: [],
            sourceType: 'estimated'
          }));
        }
      } catch {
        // no invented fallback list
      }
    }
  }

  return opportunities.map((opp) => {
    const dupCheck = checkDuplication({
      siteId,
      title: opp.title,
      keyword: opp.primaryKeyword,
      searchIntent: opp.searchIntent
    });
    return {
      id: opp.id,
      siteId,
      keyword: opp.primaryKeyword,
      topic: opp.title,
      searchIntent: opp.searchIntent,
      contentType: opp.contentType,
      estimatedDemand: opp.trafficPotential.value,
      competitionLevel: 'Unknown',
      businessValue: opp.businessValue.value,
      trafficPotential: typeof opp.trafficPotential.value === 'number' ? opp.trafficPotential.value : 0,
      conversionPotential: opp.conversionPotential.value,
      contentGap: opp.contentGap.value,
      seasonality: 'unknown',
      priorityScore: opp.priority,
      reason: opp.whyThisArticle,
      isEstimate: opp.trafficPotential.sourceType === 'estimated' || opp.trafficPotential.sourceType === 'unknown',
      source: 'content_index',
      sourceType: opp.sourceType,
      confidence: opp.confidence,
      duplicateRisk: dupCheck,
      whyThisArticle: opp.whyThisArticle,
      clusterName: opp.clusterName,
      recommendedAction: opp.recommendedAction,
      scoring: opp.scoring,
      evidence: opp.scoring.factors
    };
  });
}

export async function analyzeCompetitors(siteId: string, customDomain?: string): Promise<any[]> {
  if (customDomain) {
    const record = await upsertCompetitorDomain({ siteId, domain: customDomain });
    const index = getContentIndex(siteId);
    const interpreted = await interpretCompetitorGaps(siteId, record, index.articles.map((a) => a.title));
    const all = db.getCompetitors().filter((c: any) => !(c.siteId === siteId && c.domain === interpreted.domain));
    db.saveCompetitors([interpreted, ...all]);
    return listCompetitors(siteId);
  }
  return listCompetitors(siteId);
}
