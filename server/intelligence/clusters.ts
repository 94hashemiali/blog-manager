import type {
  ClusterHealth,
  ContentClusterRecord,
  IndexedArticle,
  SearchIntent
} from './types.js';
import { inferArticleKind, jaccard, tokenize } from './text.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'cluster';
}

function intentOf(article: IndexedArticle): SearchIntent {
  return article.fingerprint.searchIntent;
}

export function buildClustersFromIndex(
  siteId: string,
  articles: IndexedArticle[]
): ContentClusterRecord[] {
  const buckets = new Map<string, IndexedArticle[]>();

  for (const article of articles) {
    const key = article.categories[0] || article.normalized.productMentions[0] || article.fingerprint.primaryKeyword || 'عمومی';
    const list = buckets.get(key) || [];
    list.push(article);
    buckets.set(key, list);
  }

  // Merge tiny buckets into nearest larger cluster by title similarity
  const named = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
  const merged: Array<[string, IndexedArticle[]]> = [];
  for (const [name, list] of named) {
    if (list.length === 1 && merged.length > 0) {
      const tokens = tokenize(list[0].title);
      let best = 0;
      let bestIdx = -1;
      merged.forEach(([, existing], idx) => {
        const sim = Math.max(...existing.map((a) => jaccard(tokens, tokenize(a.title))));
        if (sim > best) {
          best = sim;
          bestIdx = idx;
        }
      });
      if (best >= 18 && bestIdx >= 0) {
        merged[bestIdx][1].push(list[0]);
        continue;
      }
    }
    merged.push([name, list]);
  }

  return merged.map(([name, list]) => {
    const kinds = list.map((a) => inferArticleKind(a.title, a.normalized.plainText));
    const pillar = list.find((a) => /راهنمای جامع|راهنمای کامل|pillar/i.test(a.title)) || list[0];
    const health = scoreClusterHealth(list, kinds);
    const existingTopics = list.map((a) => ({
      title: a.title,
      keyword: a.fingerprint.primaryKeyword,
      status: 'existing' as const,
      articleId: a.id
    }));
    const missing: ContentClusterRecord['topics'] = [];
    if (!kinds.includes('comparison')) {
      missing.push({ title: `مقایسه تخصصی در خوشه ${name}`, keyword: `${name} مقایسه`, status: 'missing' });
    }
    if (!kinds.includes('tutorial') && !kinds.includes('how_to')) {
      missing.push({ title: `آموزش کاربردی ${name}`, keyword: `${name} آموزش`, status: 'missing' });
    }
    return {
      id: `cluster-${slugify(name)}`,
      siteId,
      name,
      pillarTopic: pillar.title,
      pillarArticleId: pillar.id,
      articleIds: list.map((a) => a.id),
      topics: [...existingTopics, ...missing],
      health,
      sourceType: 'calculated'
    };
  });
}

export function scoreClusterHealth(
  articles: IndexedArticle[],
  kinds = articles.map((a) => inferArticleKind(a.title, a.normalized.plainText))
): ClusterHealth {
  const supportingCount = Math.max(0, articles.length - 1);
  const pillarExists = articles.some((a) => /راهنما|جامع|guide/i.test(a.title));
  const intents = {
    informational: articles.filter((a) => intentOf(a) === 'informational').length,
    commercial: articles.filter((a) => intentOf(a) === 'commercial' || intentOf(a) === 'transactional').length,
    comparison: kinds.filter((k) => k === 'comparison').length,
    tutorial: kinds.filter((k) => k === 'tutorial' || k === 'how_to').length
  };
  const productCoverage = articles.filter((a) => a.normalized.productMentions.length > 0).length;
  const depth = articles.reduce((s, a) => s + a.wordCount, 0) / Math.max(1, articles.length);
  const titles = articles.map((a) => a.fingerprint.normalizedTitle);
  const dupPairs = titles.filter((t, i) => titles.some((o, j) => i !== j && (t === o || jaccard(tokenize(t), tokenize(o)) > 70))).length;
  const cannibalizationRisk = dupPairs > 2 ? 'severe' : dupPairs > 0 ? 'moderate' : 'none';
  const linking = articles.reduce((s, a) => s + a.normalized.links.filter((l) => l.internal).length, 0);

  const missingContent: string[] = [];
  if (!pillarExists) missingContent.push('pillar article');
  if (intents.comparison === 0) missingContent.push('comparison content');
  if (intents.tutorial === 0) missingContent.push('tutorial / how-to');
  if (intents.commercial === 0) missingContent.push('commercial intent coverage');
  if (linking < articles.length) missingContent.push('internal links between cluster siblings');

  const weaknesses = [...missingContent];
  const strengths: string[] = [];
  if (pillarExists) strengths.push('pillar-like article present');
  if (articles.length >= 3) strengths.push(`${articles.length} supporting articles`);
  if (depth >= 700) strengths.push('adequate average depth');

  let score = 40;
  if (pillarExists) score += 15;
  score += Math.min(20, supportingCount * 5);
  if (intents.comparison) score += 8;
  if (intents.tutorial) score += 8;
  if (intents.commercial) score += 6;
  score += Math.min(10, Math.round(depth / 200));
  if (cannibalizationRisk !== 'none') score -= 12;
  score = Math.max(5, Math.min(100, score));

  const recommendedNextActions = missingContent.slice(0, 4).map((m) => `Add ${m}`);

  return {
    score,
    strengths,
    weaknesses,
    missingContent,
    recommendedNextActions,
    pillarExists,
    supportingCount,
    productCoverage,
    intentCoverage: intents,
    cannibalizationRisk,
    contentDepth: Math.round(depth),
    internalLinkingCompleteness: articles.length === 0 ? 0 : Math.min(100, Math.round((linking / articles.length) * 40))
  };
}
