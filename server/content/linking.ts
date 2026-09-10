import { jaccard, tokenize, tokenOverlapCount } from '../intelligence/text.js';
import type { ContentClusterRecord, IndexedArticle, IndexedProduct } from '../intelligence/types.js';
import type { InternalLinkSuggestion, LinkRelationshipType } from './types.js';

/** Upper bound on suggestions, so a draft never turns into a link farm. */
export const MAX_INTERNAL_LINKS = 6;
const MIN_RELEVANCE = 20;

function isPillar(article: IndexedArticle, clusters: ContentClusterRecord[]): boolean {
  return clusters.some((cluster) => String(cluster.pillarArticleId) === String(article.id));
}

function relationshipFor(params: {
  target: IndexedArticle;
  proposedIsPillar: boolean;
  sameCluster: boolean;
  targetIsPillar: boolean;
  targetMentionsProducts: boolean;
  proposedMentionsProducts: boolean;
}): LinkRelationshipType {
  if (params.sameCluster && params.targetIsPillar) return 'CLUSTER_TO_PILLAR';
  if (params.sameCluster && params.proposedIsPillar) return 'PILLAR_TO_CLUSTER';
  if (params.targetMentionsProducts && !params.proposedMentionsProducts) return 'GUIDE_TO_PRODUCT';
  if (!params.targetMentionsProducts && params.proposedMentionsProducts) return 'PRODUCT_TO_GUIDE';
  if (params.sameCluster) return 'SUPPORTING_ARTICLE';
  return 'RELATED_CONTENT';
}

function placementFor(relationship: LinkRelationshipType): string {
  switch (relationship) {
    case 'CLUSTER_TO_PILLAR':
      return 'در مقدمه، جایی که موضوع کلی معرفی می‌شود';
    case 'PILLAR_TO_CLUSTER':
      return 'در بخش مربوط به همان زیرموضوع';
    case 'GUIDE_TO_PRODUCT':
      return 'در بخش معیارهای انتخاب، کنار نام محصول';
    case 'PRODUCT_TO_GUIDE':
      return 'در بخش «قبل از خرید بخوانید»';
    case 'SUPPORTING_ARTICLE':
      return 'در بخش مرتبط میانی مقاله';
    default:
      return 'در جمع‌بندی یا بخش مطالب مرتبط';
  }
}

/**
 * Ranks the whole indexed article set for a proposed topic rather than passing
 * the first N articles to the model. Relevance is lexical + cluster + category
 * overlap, so the same input always produces the same suggestions.
 */
export function suggestInternalLinks(params: {
  topic: string;
  primaryKeyword?: string;
  clusterId?: string;
  articles: IndexedArticle[];
  clusters: ContentClusterRecord[];
  products?: IndexedProduct[];
  proposedIsPillar?: boolean;
  max?: number;
}): InternalLinkSuggestion[] {
  const topicTokens = tokenize(`${params.topic} ${params.primaryKeyword || ''}`);
  if (topicTokens.size === 0) return [];

  const proposedMentionsProducts = (params.products || []).some(
    (product) => tokenOverlapCount(topicTokens, tokenize(product.name)) >= 1
  );

  const scored = params.articles
    .map((article) => {
      const sameCluster = Boolean(params.clusterId && article.fingerprint.contentClusterId === params.clusterId);
      const titleScore = jaccard(topicTokens, tokenize(article.title));
      const headingScore = jaccard(topicTokens, tokenize(article.normalized.headings.join(' '))) * 0.5;
      const keywordScore = tokenOverlapCount(topicTokens, tokenize(article.fingerprint.primaryKeyword)) * 8;
      const relevance = Math.round(titleScore + headingScore + keywordScore + (sameCluster ? 25 : 0));
      return { article, relevance, sameCluster };
    })
    .filter((row) => row.relevance >= MIN_RELEVANCE)
    .sort((a, b) => b.relevance - a.relevance);

  const suggestions: InternalLinkSuggestion[] = [];
  const usedAnchors = new Set<string>();
  const clusterCounts = new Map<string, number>();

  for (const row of scored) {
    if (suggestions.length >= (params.max || MAX_INTERNAL_LINKS)) break;

    const clusterKey = row.article.fingerprint.contentClusterId || 'none';
    // Cap per cluster so one cluster cannot absorb every link slot.
    if ((clusterCounts.get(clusterKey) || 0) >= 3) continue;

    const anchor = (row.article.fingerprint.primaryKeyword || row.article.title).trim().slice(0, 60);
    const anchorKey = anchor.toLowerCase();
    if (usedAnchors.has(anchorKey)) continue;

    const targetIsPillar = isPillar(row.article, params.clusters);
    const relationshipType = relationshipFor({
      target: row.article,
      proposedIsPillar: Boolean(params.proposedIsPillar),
      sameCluster: row.sameCluster,
      targetIsPillar,
      targetMentionsProducts: row.article.normalized.productMentions.length > 0,
      proposedMentionsProducts
    });

    usedAnchors.add(anchorKey);
    clusterCounts.set(clusterKey, (clusterCounts.get(clusterKey) || 0) + 1);

    suggestions.push({
      targetArticleId: row.article.id,
      targetTitle: row.article.title,
      targetSlug: row.article.slug,
      anchorText: anchor,
      reason: row.sameCluster
        ? `هم‌خوشه با موضوع پیشنهادی (${row.relevance}٪ ارتباط واژگانی)`
        : `موضوع مرتبط با هم‌پوشانی ${row.relevance}٪ در عنوان و سرتیترها`,
      placement: placementFor(relationshipType),
      relationshipType,
      relevance: row.relevance
    });
  }

  return suggestions;
}

/** Links a finished draft actually contains, matched against the suggestions. */
export function auditDraftLinks(params: {
  content: string;
  suggestions: InternalLinkSuggestion[];
}): { used: InternalLinkSuggestion[]; missing: InternalLinkSuggestion[]; markdownLinkCount: number } {
  const markdownLinkCount = (params.content.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  const lower = params.content.toLowerCase();
  const used = params.suggestions.filter(
    (link) =>
      (link.targetSlug && lower.includes(link.targetSlug.toLowerCase())) ||
      lower.includes(link.anchorText.toLowerCase())
  );
  const usedIds = new Set(used.map((link) => String(link.targetArticleId)));
  return {
    used,
    missing: params.suggestions.filter((link) => !usedIds.has(String(link.targetArticleId))),
    markdownLinkCount
  };
}
