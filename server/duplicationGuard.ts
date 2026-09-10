import { getContentIndex } from './intelligence/store.js';
import { evaluateCannibalization, type CannibalizationResult } from './intelligence/duplication.js';
import { normalizeWordpressHtml } from './intelligence/normalize.js';
import { buildFingerprint } from './intelligence/fingerprint.js';
import { db } from './db.js';

export interface DuplicateCheckParams {
  siteId: string;
  title: string;
  keyword?: string;
  searchIntent?: string;
  content?: string;
}

export type DuplicateCheckResult = CannibalizationResult;

export function checkDuplication(params: DuplicateCheckParams): DuplicateCheckResult {
  const index = getContentIndex(params.siteId);
  let articles = index.articles;
  if (articles.length === 0) {
    articles = db.getArticles(params.siteId).map((article) => {
      const title = article.title?.rendered || article.title || '';
      const content = article.content?.rendered || article.content || params.content || '';
      const normalized = normalizeWordpressHtml(title, content, { tags: article.tag_names || [] });
      const fingerprint = buildFingerprint({
        siteId: params.siteId,
        articleId: article.id,
        title,
        slug: article.slug,
        normalized
      });
      return {
        id: article.id,
        siteId: params.siteId,
        title,
        slug: article.slug || '',
        categories: article.category_names || [],
        tags: article.tag_names || [],
        excerpt: '',
        content,
        normalized,
        fingerprint,
        freshness: 'healthy' as const,
        freshnessReason: '',
        wordCount: normalized.plainText.split(/\s+/).length,
        sourceType: 'observed' as const
      };
    });
  }
  return evaluateCannibalization({
    siteId: params.siteId,
    title: params.title,
    keyword: params.keyword,
    searchIntent: params.searchIntent,
    articles
  });
}
