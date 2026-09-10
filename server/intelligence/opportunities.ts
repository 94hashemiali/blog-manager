import type {
  ContentClusterRecord,
  ContentGapRecord,
  IndexedArticle,
  IndexedProduct,
  TopicOpportunityRecord
} from './types.js';
import { evaluateCannibalization } from './duplication.js';
import { inferIntent, inferPrimaryKeyword } from './text.js';
import { scoreOpportunity, seasonalityBoost } from './scoring.js';

function contentTypeFromGap(kind: string): TopicOpportunityRecord['contentType'] {
  if (kind === 'missing_comparison') return 'comparison';
  if (kind === 'missing_tutorial') return 'tutorial';
  if (kind === 'product_without_content') return 'review';
  return 'guide';
}

export function buildOpportunities(params: {
  siteId: string;
  articles: IndexedArticle[];
  clusters: ContentClusterRecord[];
  gaps: ContentGapRecord[];
  products: IndexedProduct[];
  categories: string[];
}): TopicOpportunityRecord[] {
  const recs: TopicOpportunityRecord[] = [];

  for (const gap of params.gaps) {
    const cluster = params.clusters.find((c) => c.id === gap.clusterId);
    const title =
      gap.kind === 'outdated_article'
        ? `بازنگری و به‌روزرسانی: ${gap.topic}`
        : gap.kind === 'missing_comparison' && cluster
          ? `مقایسه تخصصی در خوشه ${cluster.name}`
          : gap.topic;
    const keyword = inferPrimaryKeyword(title);
    const intent = inferIntent(title);
    const cannibalization = evaluateCannibalization({
      siteId: params.siteId,
      title,
      keyword,
      searchIntent: intent,
      clusterId: gap.clusterId,
      articles: params.articles
    });
    if (cannibalization.decision === 'do_not_create' && gap.kind !== 'outdated_article') continue;

    const relatedProducts = params.products.filter(
      (p) => title.includes(p.name) || (cluster?.name && p.categories.some((c) => cluster.name.includes(c)))
    );
    const productRelevance = Math.min(10, relatedProducts.length * 3 + (cluster ? 2 : 0));
    const scoring = scoreOpportunity({
      businessValue: Math.min(10, 5 + relatedProducts.length * 2),
      businessSource: relatedProducts.length ? 'observed' : 'inferred',
      trafficBand: gap.kind === 'product_without_content' ? 'Medium' : 'High',
      conversionPotential: intent === 'commercial' || intent === 'transactional' ? 8 : 5,
      conversionSource: 'inferred',
      gapStrength: gap.kind === 'weak_coverage' ? 6 : 9,
      productRelevance,
      productSource: relatedProducts.length ? 'observed' : 'inferred',
      clusterAuthority: cluster ? Math.round(cluster.health.score / 10) : 3,
      linkingValue: Math.min(10, (cluster?.articleIds.length || 1) * 2),
      seasonalityBoost: seasonalityBoost(title),
      cannibalization
    });

    recs.push({
      id: `opp-${gap.id}`,
      siteId: params.siteId,
      title,
      primaryKeyword: keyword,
      secondaryKeywords: cluster?.topics.map((t) => t.keyword).slice(0, 4) || [],
      searchIntent: intent,
      contentType: contentTypeFromGap(gap.kind),
      clusterId: cluster?.id,
      clusterName: cluster?.name,
      businessValue: {
        value: Math.min(10, 5 + relatedProducts.length * 2),
        confidence: relatedProducts.length ? 'high' : 'medium',
        sourceType: relatedProducts.length ? 'observed' : 'inferred'
      },
      trafficPotential: {
        value: gap.kind === 'product_without_content' ? 'Medium' : 'High',
        confidence: 'low',
        sourceType: 'estimated',
        source: 'AI inference',
        reason: 'No keyword-volume provider is configured.'
      },
      conversionPotential: {
        value: intent === 'commercial' || intent === 'transactional' ? 8 : 5,
        confidence: 'medium',
        sourceType: 'inferred'
      },
      contentGap: {
        value: gap.kind === 'weak_coverage' ? 6 : 9,
        confidence: 'high',
        sourceType: 'calculated',
        reason: gap.reason
      },
      cannibalizationRisk: {
        value: cannibalization.cannibalizationRisk,
        confidence: 'high',
        sourceType: 'calculated',
        reason: cannibalization.decisionReason
      },
      productRelevance: {
        value: productRelevance,
        confidence: relatedProducts.length ? 'high' : 'medium',
        sourceType: relatedProducts.length ? 'observed' : 'inferred'
      },
      priority: scoring.score,
      confidence: scoring.factors.filter((f) => f.confidence === 'low').length >= 2 ? 'medium' : 'high',
      whyThisArticle: buildWhy(gap, cluster, relatedProducts, cannibalization.decisionReason),
      scoring,
      recommendedAction: gap.kind === 'outdated_article' ? 'update_existing' : cannibalization.decision,
      productsToMention: relatedProducts.map((p) => p.name),
      sourceType: 'calculated'
    });
  }

  for (const category of params.categories.slice(0, 6)) {
    const covered = params.articles.some((a) => a.categories.includes(category));
    if (covered) continue;
    recs.push(minimalCategoryOpp(params.siteId, category, params.articles));
  }

  return recs
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 20);
}

function buildWhy(
  gap: ContentGapRecord,
  cluster: ContentClusterRecord | undefined,
  products: IndexedProduct[],
  cannibalizationNote: string
): string {
  const clusterBit = cluster
    ? `خوشه «${cluster.name}» ${cluster.articleIds.length} مقاله دارد.`
    : 'این موضوع هنوز خوشه مشخصی ندارد.';
  const productBit = products.length
    ? `به ${products.length} محصول فهرست‌شده مرتبط است (${products.map((p) => p.name).slice(0, 3).join('، ')}).`
    : 'ارتباط محصول مشاهده‌شده محدود است.';
  return `${gap.reason} ${clusterBit} ${productBit} ${cannibalizationNote}`;
}

function minimalCategoryOpp(siteId: string, category: string, articles: IndexedArticle[]): TopicOpportunityRecord {
  const title = `راهنمای شروع ${category}`;
  const cannibalization = evaluateCannibalization({ siteId, title, articles });
  const scoring = scoreOpportunity({
    businessValue: 5,
    businessSource: 'inferred',
    trafficBand: 'Medium',
    conversionPotential: 4,
    conversionSource: 'inferred',
    gapStrength: 7,
    productRelevance: 3,
    productSource: 'inferred',
    clusterAuthority: 2,
    linkingValue: 2,
    seasonalityBoost: 2,
    cannibalization
  });
  return {
    id: `opp-cat-${category}`,
    siteId,
    title,
    primaryKeyword: category,
    secondaryKeywords: [],
    searchIntent: 'informational',
    contentType: 'guide',
    businessValue: { value: 5, confidence: 'medium', sourceType: 'inferred' },
    trafficPotential: { value: 'Medium', confidence: 'low', sourceType: 'estimated', source: 'AI inference' },
    conversionPotential: { value: 4, confidence: 'low', sourceType: 'inferred' },
    contentGap: { value: 7, confidence: 'high', sourceType: 'calculated' },
    cannibalizationRisk: { value: cannibalization.cannibalizationRisk, confidence: 'high', sourceType: 'calculated' },
    productRelevance: { value: 3, confidence: 'low', sourceType: 'inferred' },
    priority: scoring.score,
    confidence: 'medium',
    whyThisArticle: `دسته «${category}» در وردپرس وجود دارد اما مقاله‌ای در ایندکس به آن وصل نشده است.`,
    scoring,
    recommendedAction: cannibalization.decision,
    productsToMention: [],
    sourceType: 'calculated'
  };
}
