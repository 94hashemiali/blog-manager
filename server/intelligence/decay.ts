import type { FreshnessStatus, IndexedArticle } from './types.js';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function classifyFreshness(article: {
  date?: string;
  modified?: string;
  wordCount?: number;
  productMentions?: string[];
  knownProducts?: string[];
}): { status: FreshnessStatus; reason: string } {
  const modified = article.modified || article.date;
  const ageMs = modified ? Date.now() - new Date(modified).getTime() : 0;
  const years = ageMs / YEAR_MS;
  const known = (article.knownProducts || []).map((p) => p.toLowerCase());
  const mentioned = (article.productMentions || []).map((p) => p.toLowerCase());
  const specificMentions = mentioned.filter((m) => m.length > 8 && !/tent|boot|backpack|stove|pad/.test(m));
  const staleReferences =
    specificMentions.length > 0 &&
    known.length > 0 &&
    specificMentions.filter((m) => !known.some((k) => k.includes(m) || m.includes(k))).length >= 2;

  if (years >= 3 && (article.wordCount || 0) < 400) {
    return {
      status: 'likely_outdated',
      reason: 'Article is more than 3 years old and thin; treat as likely outdated pending editor review.'
    };
  }
  if (years >= 2 || staleReferences) {
    return {
      status: 'needs_review',
      reason: years >= 2
        ? 'Last modified more than 2 years ago; review for current product specs.'
        : 'Article names products that are not in the current catalog; review for outdated references.'
    };
  }
  return { status: 'healthy', reason: 'Recently maintained or no aging evidence.' };
}

export function applyFreshness(articles: IndexedArticle[], knownProducts: string[] = []): IndexedArticle[] {
  return articles.map((article) => {
    const result = classifyFreshness({
      date: article.date,
      modified: article.modified,
      wordCount: article.wordCount,
      productMentions: article.normalized.productMentions,
      knownProducts
    });
    return { ...article, freshness: result.status, freshnessReason: result.reason };
  });
}
