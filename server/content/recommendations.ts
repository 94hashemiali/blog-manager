import { getContentIndex } from '../intelligence/store.js';
import { buildOpportunities } from '../intelligence/opportunities.js';
import { tokenize, tokenOverlapCount } from '../intelligence/text.js';
import type { ContentClusterRecord, IndexedArticle, IndexedProduct, TopicOpportunityRecord } from '../intelligence/types.js';
import { decideDifferentiation } from './differentiation.js';
import type { ConfidenceLevel, DifferentiationDecision } from './types.js';

export interface NextArticleRecommendation {
  opportunityId: string;
  title: string;
  primaryKeyword: string;
  searchIntent: string;
  contentType: string;
  clusterName?: string;
  priority: number;
  confidence: ConfidenceLevel;
  /** Every bullet here is derived from indexed data, never from a guess. */
  whyBullets: string[];
  decision: DifferentiationDecision['recommendation'];
  cannibalizationRisk: DifferentiationDecision['cannibalizationRisk'];
  evidenceAvailability: {
    relatedArticles: number;
    relatedProducts: number;
    verifiableFacts: number;
    status: 'strong' | 'partial' | 'thin';
  };
  clusterHealthScore?: number;
  seasonalNote?: string;
  scoringFactors: Array<{ label: string; contribution: number; sourceType: string; evidence: string }>;
}

function countRelated<T>(items: T[], topicTokens: Set<string>, textOf: (item: T) => string): number {
  return items.filter((item) => tokenOverlapCount(topicTokens, tokenize(textOf(item))) >= 1).length;
}

function evidenceStatus(articles: number, products: number): 'strong' | 'partial' | 'thin' {
  if (articles >= 2 && products >= 2) return 'strong';
  if (articles >= 1 || products >= 1) return 'partial';
  return 'thin';
}

function buildWhyBullets(params: {
  opportunity: TopicOpportunityRecord;
  decision: DifferentiationDecision;
  cluster?: ContentClusterRecord;
  relatedArticles: number;
  relatedProducts: number;
  staleRelated: number;
}): string[] {
  const bullets: string[] = [];
  const { opportunity, decision, cluster } = params;

  if (opportunity.contentGap.value >= 7) {
    bullets.push(`این موضوع در پوشش فعلی سایت غایب است (${opportunity.contentGap.reason || 'شکاف محتوایی محاسبه‌شده'}).`);
  }
  if (cluster) {
    bullets.push(
      `خوشهٔ «${cluster.name}» با امتیاز سلامت ${cluster.health.score} ${
        cluster.health.missingContent.length > 0 ? `این کمبودها را دارد: ${cluster.health.missingContent.slice(0, 2).join('، ')}` : 'نیاز به تقویت دارد'
      }.`
    );
  }
  if (opportunity.productRelevance.value >= 6 && params.relatedProducts > 0) {
    bullets.push(`${params.relatedProducts} محصول مرتبط در کاتالوگ این سایت ثبت شده است.`);
  }
  if (decision.recommendation === 'CREATE_NEW') {
    bullets.push(
      params.relatedArticles > 0
        ? `مقالهٔ نزدیکی وجود دارد اما نیت یا قالب متفاوت است (شباهت ${decision.similarityScore}٪).`
        : 'هیچ مقالهٔ مشابهی در ایندکس این سایت پیدا نشد.'
    );
  } else {
    bullets.push(`توجه: تصمیم موتور تمایز «${decision.recommendation}» است — ${decision.reasons[0] || ''}`);
  }
  if (params.relatedArticles > 0) {
    bullets.push(`${params.relatedArticles} مقالهٔ موجود می‌تواند به این مقاله لینک بدهد.`);
  }
  if (params.staleRelated > 0) {
    bullets.push(`${params.staleRelated} مقالهٔ مرتبط برای بازبینی علامت خورده است؛ این مقاله می‌تواند نقش محتوای تازه را بگیرد.`);
  }
  if (opportunity.whyThisArticle) bullets.push(opportunity.whyThisArticle);

  return [...new Set(bullets.filter(Boolean))];
}

/**
 * Answers "what should I write next?" from the local content index. Priority
 * and confidence come from the intelligence scoring layer; this module adds the
 * production-side signals (differentiation decision, evidence availability) and
 * a human-readable reason for every row. No search volume or traffic estimate
 * is produced anywhere in this path.
 */
export function recommendNextArticles(params: {
  siteId: string;
  limit?: number;
  currentMonth?: number;
}): { recommendations: NextArticleRecommendation[]; indexEmpty: boolean; indexedAt: string } {
  const index = getContentIndex(params.siteId);
  const opportunities: TopicOpportunityRecord[] = index.opportunities.length
    ? index.opportunities
    : buildOpportunities({
        siteId: params.siteId,
        articles: index.articles,
        clusters: index.clusters,
        gaps: index.gaps,
        products: index.products,
        categories: index.categories.map((category) => category.name)
      });

  const recommendations = opportunities
    .map((opportunity) => enrich(opportunity, index.articles, index.products, index.clusters, params))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, params.limit || 12);

  return {
    recommendations,
    indexEmpty: index.articles.length === 0,
    indexedAt: index.indexedAt
  };
}

function enrich(
  opportunity: TopicOpportunityRecord,
  articles: IndexedArticle[],
  products: IndexedProduct[],
  clusters: ContentClusterRecord[],
  params: { siteId: string; currentMonth?: number }
): NextArticleRecommendation {
  const topicTokens = tokenize(`${opportunity.title} ${opportunity.primaryKeyword}`);
  const relatedArticles = countRelated(articles, topicTokens, (article) => article.title);
  const relatedProducts = countRelated(products, topicTokens, (product) => `${product.name} ${product.categories.join(' ')}`);
  const staleRelated = articles.filter(
    (article) => article.freshness !== 'healthy' && tokenOverlapCount(topicTokens, tokenize(article.title)) >= 1
  ).length;

  const decision = decideDifferentiation({
    siteId: params.siteId,
    topic: opportunity.title,
    primaryKeyword: opportunity.primaryKeyword,
    searchIntent: opportunity.searchIntent,
    clusterId: opportunity.clusterId,
    articles
  });

  const cluster = clusters.find((row) => row.id === opportunity.clusterId);

  // Verifiable facts = article + product records the writer can actually cite.
  const verifiableFacts = relatedArticles + relatedProducts;

  return {
    opportunityId: opportunity.id,
    title: opportunity.title,
    primaryKeyword: opportunity.primaryKeyword,
    searchIntent: opportunity.searchIntent,
    contentType: opportunity.contentType,
    clusterName: opportunity.clusterName || cluster?.name,
    // Duplicate-risk topics are pushed down instead of being hidden, so the
    // user can still see and override the call.
    priority:
      decision.recommendation === 'REJECT_DUPLICATE'
        ? Math.max(1, opportunity.priority - 40)
        : decision.recommendation === 'NEEDS_REVIEW'
          ? Math.max(1, opportunity.priority - 15)
          : opportunity.priority,
    confidence: opportunity.confidence,
    whyBullets: buildWhyBullets({ opportunity, decision, cluster, relatedArticles, relatedProducts, staleRelated }),
    decision: decision.recommendation,
    cannibalizationRisk: decision.cannibalizationRisk,
    evidenceAvailability: {
      relatedArticles,
      relatedProducts,
      verifiableFacts,
      status: evidenceStatus(relatedArticles, relatedProducts)
    },
    clusterHealthScore: cluster?.health.score,
    seasonalNote: seasonalNote(opportunity, articles, params.currentMonth),
    scoringFactors: opportunity.scoring.factors.map((factor) => ({
      label: factor.label,
      contribution: factor.contribution,
      sourceType: factor.sourceType,
      evidence: factor.evidence
    }))
  };
}

/**
 * Seasonality is only mentioned when the site's own publishing history shows a
 * seasonal pattern for this topic. Otherwise nothing is claimed.
 */
function seasonalNote(
  opportunity: TopicOpportunityRecord,
  articles: IndexedArticle[],
  currentMonth?: number
): string | undefined {
  if (currentMonth == null) return undefined;
  const topicTokens = tokenize(`${opportunity.title} ${opportunity.primaryKeyword}`);
  const related = articles.filter(
    (article) => article.date && tokenOverlapCount(topicTokens, tokenize(article.title)) >= 1
  );
  if (related.length < 2) return undefined;

  const months = related
    .map((article) => new Date(article.date as string).getMonth())
    .filter((month) => !Number.isNaN(month));
  const hits = months.filter((month) => Math.abs(month - currentMonth) <= 1 || Math.abs(month - currentMonth) >= 11).length;
  if (hits < 2) return undefined;
  return `این سایت ${hits} مقالهٔ مرتبط را در همین بازهٔ فصلی منتشر کرده است (بر اساس تاریخ انتشار خودِ سایت، نه دادهٔ جستجو).`;
}
