import type { ContentGapRecord, IndexedArticle, IndexedProduct, ContentClusterRecord } from './types.js';
import { inferArticleKind } from './text.js';

export function detectGaps(params: {
  siteId: string;
  articles: IndexedArticle[];
  clusters: ContentClusterRecord[];
  products: IndexedProduct[];
  competitorTopics?: string[];
}): ContentGapRecord[] {
  const gaps: ContentGapRecord[] = [];
  let i = 0;
  const nextId = () => `gap-${params.siteId}-${++i}`;

  for (const cluster of params.clusters) {
    for (const missing of cluster.health.missingContent) {
      const kind =
        missing === 'comparison content'
          ? 'missing_comparison'
          : missing === 'tutorial / how-to'
            ? 'missing_tutorial'
            : missing === 'commercial intent coverage'
              ? 'missing_commercial'
              : missing === 'pillar article'
                ? 'weak_coverage'
                : missing === 'internal links between cluster siblings'
                  ? 'poor_internal_linking'
                  : 'missing_supporting';
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind,
        topic: `${cluster.name}: ${missing}`,
        clusterId: cluster.id,
        reason: `Cluster “${cluster.name}” is missing ${missing}.`,
        evidence: cluster.health.weaknesses,
        sourceType: 'calculated',
        confidence: 'high'
      });
    }
  }

  for (const article of params.articles) {
    if (article.freshness === 'likely_outdated' || article.freshness === 'needs_review') {
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind: 'outdated_article',
        topic: article.title,
        articleId: article.id,
        reason: article.freshnessReason,
        evidence: [article.freshness, `modified ${article.modified || article.date || 'unknown'}`],
        sourceType: 'calculated',
        confidence: article.freshness === 'likely_outdated' ? 'medium' : 'medium'
      });
    }
    if (article.wordCount < 350) {
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind: 'thin_article',
        topic: article.title,
        articleId: article.id,
        reason: `Thin article (${article.wordCount} words).`,
        evidence: [`wordCount=${article.wordCount}`],
        sourceType: 'observed',
        confidence: 'high'
      });
    }
  }

  const mentioned = new Set(params.articles.flatMap((a) => a.normalized.productMentions));
  const uncovered = params.products.filter((product) => {
    const tokens = product.name.toLowerCase();
    const covered = params.articles.some(
      (a) => a.title.toLowerCase().includes(product.name.toLowerCase()) || a.normalized.plainText.toLowerCase().includes(tokens)
    );
    return !covered && !mentioned.has(product.slug);
  });
  if (uncovered.length > 5) {
    const byCategory = new Map<string, IndexedProduct[]>();
    for (const product of uncovered) {
      const category = product.categories[0] || 'محصولات';
      const list = byCategory.get(category) || [];
      list.push(product);
      byCategory.set(category, list);
    }
    const ranked = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
    for (const [category, products] of ranked) {
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind: 'product_without_content',
        topic: `راهنمای خرید ${category} (${products.length} محصول بدون محتوای پشتیبان)`,
        productName: products[0]?.name,
        reason: `${products.length} catalog products in “${category}” have no supporting article.`,
        evidence: products.slice(0, 6).map((p) => `product:${p.name}`),
        sourceType: 'observed',
        confidence: 'high'
      });
    }
  } else {
    for (const product of uncovered) {
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind: 'product_without_content',
        topic: `محتوای پشتیبان برای ${product.name}`,
        productName: product.name,
        reason: `Product “${product.name}” is in the catalog but no supporting article was found.`,
        evidence: [`product:${product.name}`],
        sourceType: 'observed',
        confidence: 'high'
      });
    }
  }

  for (const topic of params.competitorTopics || []) {
    const covered = params.articles.some((a) => a.fingerprint.normalizedTitle.includes(topic.toLowerCase()) || a.title.includes(topic));
    if (!covered) {
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind: 'competitor_covers_we_dont',
        topic,
        reason: `A verified competitor covers “${topic}” and this site does not.`,
        evidence: [`competitor_topic:${topic}`],
        sourceType: 'observed',
        confidence: 'medium'
      });
    }
  }

  const kinds = params.articles.map((a) => inferArticleKind(a.title, a.normalized.plainText));
  if (params.articles.length > 0 && !kinds.includes('comparison')) {
    const already = gaps.some((g) => g.kind === 'missing_comparison');
    if (!already) {
      gaps.push({
        id: nextId(),
        siteId: params.siteId,
        kind: 'missing_comparison',
        topic: 'محتوای مقایسه‌ای در سایت وجود ندارد',
        reason: 'No comparison articles were detected in the index.',
        evidence: ['articleType scan'],
        sourceType: 'calculated',
        confidence: 'high'
      });
    }
  }

  return gaps;
}
