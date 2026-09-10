import type { IndexedArticle, InternalLinkRec } from './types.js';
import { jaccard, tokenize } from './text.js';

export function recommendInternalLinks(articles: IndexedArticle[], maxPerArticle = 3): InternalLinkRec[] {
  const recs: InternalLinkRec[] = [];
  for (const source of articles) {
    const ranked = articles
      .filter((target) => String(target.id) !== String(source.id))
      .map((target) => ({
        target,
        score:
          (source.fingerprint.contentClusterId && source.fingerprint.contentClusterId === target.fingerprint.contentClusterId
            ? 40
            : 0) +
          jaccard(tokenize(source.title), tokenize(target.title)) +
          (source.categories.some((c) => target.categories.includes(c)) ? 15 : 0)
      }))
      .filter((row) => row.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerArticle);

    const usedAnchors = new Set<string>();
    for (const row of ranked) {
      const anchor = row.target.fingerprint.primaryKeyword || row.target.title.slice(0, 42);
      if (usedAnchors.has(anchor)) continue;
      usedAnchors.add(anchor);
      recs.push({
        sourceArticleId: source.id,
        sourceTitle: source.title,
        targetArticleId: row.target.id,
        targetTitle: row.target.title,
        anchorText: anchor,
        reason:
          source.fingerprint.contentClusterId === row.target.fingerprint.contentClusterId
            ? 'Sibling in the same content cluster'
            : 'Related topic with overlapping entities'
      });
    }
  }
  return recs;
}

export function linksForTopic(articles: IndexedArticle[], topic: string, clusterId?: string): InternalLinkRec[] {
  const tokens = tokenize(topic);
  return articles
    .map((article) => ({
      article,
      score:
        (clusterId && article.fingerprint.contentClusterId === clusterId ? 30 : 0) + jaccard(tokens, tokenize(article.title))
    }))
    .filter((row) => row.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((row) => ({
      sourceArticleId: 'proposed',
      sourceTitle: topic,
      targetArticleId: row.article.id,
      targetTitle: row.article.title,
      anchorText: row.article.fingerprint.primaryKeyword || row.article.title.slice(0, 42),
      reason: 'Proposed article should cite this existing page'
    }));
}
