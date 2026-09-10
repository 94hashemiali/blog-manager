import type { IndexedArticle } from '../intelligence/types.js';
import type { WordpressArticleBaseline } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from?: string, to: Date = new Date()): number | null {
  if (!from) return null;
  const start = new Date(from).getTime();
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.floor((to.getTime() - start) / DAY_MS));
}

function countImages(content: string): number {
  const html = (content.match(/<img\b/gi) || []).length;
  const md = (content.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  return html + md;
}

/**
 * Builds the WordPress/content-index baseline. These are content metadata
 * fields, not SEO performance metrics.
 */
export function buildWordpressBaseline(
  article: IndexedArticle,
  lastIndexedAt: string
): WordpressArticleBaseline {
  const internalLinkCount = article.normalized.links.filter((link) => link.internal).length;
  const outboundLinkCount = article.normalized.links.filter((link) => !link.internal).length;
  const daysSinceModification = daysBetween(article.modified || article.date);
  const contentAgeDays = daysBetween(article.date);

  return {
    siteId: article.siteId,
    articleId: article.id,
    wpId: article.wpId,
    url: article.url,
    title: article.title,
    slug: article.slug,
    status: article.status,
    publishDate: article.date,
    modifiedDate: article.modified || article.date,
    categories: article.categories,
    tags: article.tags,
    wordCount: article.wordCount,
    internalLinkCount,
    outboundLinkCount,
    imageCount: countImages(article.content) + (article.featuredImage ? 1 : 0),
    hasFeaturedImage: Boolean(article.featuredImage),
    lastIndexedAt,
    contentAgeDays,
    daysSinceModification,
    freshnessClass: article.freshness || 'unknown',
    quality: article.sourceType === 'seed' ? 'DEMO_DATA' : 'VERIFIED'
  };
}
