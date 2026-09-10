import crypto from 'crypto';
import type { ContentFingerprint, IndexedArticle, NormalizedArticle } from './types.js';
import { inferArticleKind, inferIntent, inferPrimaryKeyword, normalizeTitle, tokenize } from './text.js';

export function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text || '').digest('hex').slice(0, 16);
}

export function buildFingerprint(params: {
  siteId: string;
  articleId: string | number;
  title: string;
  slug?: string;
  normalized: NormalizedArticle;
  clusterId?: string;
}): ContentFingerprint {
  const summary =
    params.normalized.paragraphs[0] ||
    params.normalized.plainText.slice(0, 280) ||
    params.title;
  const tokens = tokenize(`${params.title} ${params.normalized.headings.join(' ')}`);
  return {
    articleId: params.articleId,
    siteId: params.siteId,
    normalizedTitle: normalizeTitle(params.title),
    slug: params.slug || '',
    primaryTopic: params.title,
    primaryKeyword: inferPrimaryKeyword(params.title),
    secondaryKeywords: params.normalized.keywords.slice(1, 6),
    entities: params.normalized.entities,
    articleType: inferArticleKind(params.title, params.normalized.plainText),
    searchIntent: inferIntent(params.title, params.normalized.plainText),
    contentClusterId: params.clusterId,
    importantConcepts: params.normalized.headings.slice(0, 8),
    productRelationships: params.normalized.productMentions,
    headingStructure: params.normalized.headings,
    semanticSummary: summary.slice(0, 320),
    contentHash: contentHash(params.normalized.plainText || params.title),
    tokenSet: [...tokens]
  };
}

export function toIndexedArticle(params: {
  siteId: string;
  id: string | number;
  title: string;
  slug?: string;
  url?: string;
  date?: string;
  modified?: string;
  status?: string;
  categories?: string[];
  tags?: string[];
  excerpt?: string;
  content?: string;
  featuredImage?: string;
  author?: string;
  normalized: NormalizedArticle;
  fingerprint: ContentFingerprint;
  freshness: IndexedArticle['freshness'];
  freshnessReason: string;
  sourceType?: IndexedArticle['sourceType'];
}): IndexedArticle {
  return {
    id: params.id,
    siteId: params.siteId,
    wpId: typeof params.id === 'number' ? params.id : undefined,
    title: params.title,
    slug: params.slug || '',
    url: params.url,
    date: params.date,
    modified: params.modified,
    status: params.status,
    categories: params.categories || [],
    tags: params.tags || [],
    excerpt: params.excerpt || '',
    content: params.content || '',
    featuredImage: params.featuredImage,
    author: params.author,
    normalized: params.normalized,
    fingerprint: params.fingerprint,
    freshness: params.freshness,
    freshnessReason: params.freshnessReason,
    wordCount: (params.normalized.plainText || '').split(/\s+/).filter(Boolean).length,
    sourceType: params.sourceType || 'observed'
  };
}
