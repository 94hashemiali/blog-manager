import type { ContentClusterRecord, IndexedArticle } from '../intelligence/types.js';
import { jaccard, tokenize } from '../intelligence/text.js';
import type { LinkingImpact } from './types.js';

/**
 * Graph relationships derived only from the local content index.
 */
export function computeLinkingImpact(params: {
  siteId: string;
  article: IndexedArticle;
  articles: IndexedArticle[];
  clusters: ContentClusterRecord[];
}): LinkingImpact {
  const { article, articles, clusters } = params;
  const cluster = clusters.find((row) => row.articleIds.some((id) => String(id) === String(article.id)));

  const incoming = articles
    .filter((row) => String(row.id) !== String(article.id))
    .filter((row) =>
      row.normalized.links.some(
        (link) =>
          link.internal &&
          (link.href.includes(article.slug) ||
            link.text.includes(article.fingerprint.primaryKeyword) ||
            link.href.includes(String(article.id)))
      )
    )
    .map((row) => ({ articleId: row.id, title: row.title }));

  const outgoingTargets = article.normalized.links
    .filter((link) => link.internal)
    .map((link) => {
      const target = articles.find(
        (row) => row.slug && link.href.includes(row.slug)
      );
      return target ? { articleId: target.id, title: target.title } : null;
    })
    .filter(Boolean) as Array<{ articleId: string | number; title: string }>;

  const pillar = cluster
    ? articles.find((row) => String(row.id) === String(cluster.pillarArticleId))
    : undefined;

  const supportingTitles = cluster
    ? articles
        .filter((row) => cluster.articleIds.some((id) => String(id) === String(row.id)))
        .filter((row) => String(row.id) !== String(article.id))
        .map((row) => row.title)
        .slice(0, 8)
    : [];

  const tokens = tokenize(article.title);
  const potentialNewLinks = articles
    .filter((row) => String(row.id) !== String(article.id))
    .filter((row) => !outgoingTargets.some((link) => String(link.articleId) === String(row.id)))
    .filter((row) => !incoming.some((link) => String(link.articleId) === String(row.id)))
    .map((row) => ({
      row,
      score:
        (cluster && cluster.articleIds.some((id) => String(id) === String(row.id)) ? 30 : 0) +
        jaccard(tokens, tokenize(row.title))
    }))
    .filter((entry) => entry.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => ({
      articleId: entry.row.id,
      title: entry.row.title,
      reason: cluster && cluster.articleIds.some((id) => String(id) === String(entry.row.id))
        ? 'هم‌خوشه بدون لینک متقابل'
        : 'موضوع نزدیک بدون لینک'
    }));

  return {
    siteId: params.siteId,
    articleId: article.id,
    incoming,
    outgoing: outgoingTargets,
    clusterName: cluster?.name,
    pillarTitle: pillar?.title,
    supportingTitles,
    potentialNewLinks,
    isOrphan: incoming.length === 0 && outgoingTargets.length === 0
  };
}
