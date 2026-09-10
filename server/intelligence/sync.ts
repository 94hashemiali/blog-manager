import { generateJsonContent } from '../aiClient.js';
import { db } from '../db.js';
import { buildClustersFromIndex } from './clusters.js';
import { applyFreshness } from './decay.js';
import { detectGaps } from './gaps.js';
import { toIndexedArticle, buildFingerprint } from './fingerprint.js';
import { recommendInternalLinks } from './linking.js';
import { normalizeWordpressHtml } from './normalize.js';
import { buildOpportunities } from './opportunities.js';
import { getContentIndex, saveContentIndex } from './store.js';
import type { IndexedArticle, SiteContentIndex, SyncProgress } from './types.js';
import { crawlWordpress, diffIncremental } from './wordpress.js';

export async function syncSiteIntelligence(params: {
  siteId: string;
  mode?: 'full' | 'incremental';
  fetchImpl?: typeof fetch;
  onProgress?: (p: SyncProgress) => void;
}): Promise<SiteContentIndex> {
  const site = db.getSiteById(params.siteId);
  if (!site) throw new Error('Site not found');
  const report = (stage: string, extra?: Partial<SyncProgress>) => params.onProgress?.({ stage, ...extra });
  const previous = getContentIndex(params.siteId);
  const baseUrl = site.wordpress?.baseUrl || site.url;
  report('connecting', { detail: baseUrl });

  const crawl = await crawlWordpress({
    baseUrl,
    auth:
      site.wordpress?.username && site.wordpress?.applicationPassword
        ? { username: site.wordpress.username, password: site.wordpress.applicationPassword }
        : undefined,
    fetchImpl: params.fetchImpl,
    onProgress: params.onProgress
  });

  const incomingMeta = crawl.posts.map((p) => ({ id: p.id, modified: p.modified, slug: p.slug }));
  const mode = params.mode || (previous.lastFullSyncAt ? 'incremental' : 'full');
  let selectedPosts = crawl.posts;
  if (mode === 'incremental' && previous.articles.length > 0) {
    const diff = diffIncremental(
      previous.articles.map((a) => ({ id: a.id, modified: a.modified, slug: a.slug })),
      incomingMeta
    );
    const keep = new Map(previous.articles.map((a) => [String(a.id), a]));
    const changed = new Set([...diff.newIds, ...diff.changedIds].map(String));
    selectedPosts = crawl.posts.filter((p) => changed.has(String(p.id)));
    const nextArticles: IndexedArticle[] = previous.articles.filter((a) => !diff.removedIds.some((id) => String(id) === String(a.id)));
    const rebuilt = selectedPosts.map((post) => indexPost(params.siteId, post, crawl.products.map((p) => p.name)));
    for (const article of rebuilt) {
      const idx = nextArticles.findIndex((a) => String(a.id) === String(article.id));
      if (idx >= 0) nextArticles[idx] = article;
      else nextArticles.push(article);
    }
    return finalizeIndex({
      siteId: params.siteId,
      wordpressUrl: baseUrl,
      articles: nextArticles,
      categories: crawl.categories,
      tags: crawl.tags,
      products: crawl.products,
      woocommerceAvailable: crawl.woocommerceAvailable,
      articleTotalFromWp: crawl.articleTotalFromWp,
      previous,
      mode: 'incremental',
      onProgress: params.onProgress
    });
  }

  report('normalizing', { done: 0, total: crawl.posts.length });
  const articles = crawl.posts.map((post, idx) => {
    report('normalizing', { done: idx + 1, total: crawl.posts.length });
    return indexPost(params.siteId, post, crawl.products.map((p) => p.name));
  });

  return finalizeIndex({
    siteId: params.siteId,
    wordpressUrl: baseUrl,
    articles,
    categories: crawl.categories,
    tags: crawl.tags,
    products: crawl.products,
    woocommerceAvailable: crawl.woocommerceAvailable,
    articleTotalFromWp: crawl.articleTotalFromWp,
    previous,
    mode: 'full',
    onProgress: params.onProgress
  });
}

function indexPost(siteId: string, post: ReturnType<typeof import('./wordpress.js').mapWpPost>, knownProducts: string[]): IndexedArticle {
  const normalized = normalizeWordpressHtml(post.title, post.content, {
    category: post.categories[0],
    tags: post.tags
  });
  const fingerprint = buildFingerprint({
    siteId,
    articleId: post.id,
    title: post.title,
    slug: post.slug,
    normalized
  });
  const article = toIndexedArticle({
    siteId,
    id: post.id,
    title: post.title,
    slug: post.slug,
    url: post.url,
    date: post.date,
    modified: post.modified,
    status: post.status,
    categories: post.categories,
    tags: post.tags,
    excerpt: post.excerpt,
    content: post.content,
    featuredImage: post.featuredImage,
    author: post.author,
    normalized,
    fingerprint,
    freshness: 'healthy',
    freshnessReason: '',
    sourceType: 'observed'
  });
  return applyFreshness([article], knownProducts)[0];
}

async function finalizeIndex(params: {
  siteId: string;
  wordpressUrl: string;
  articles: IndexedArticle[];
  categories: SiteContentIndex['categories'];
  tags: SiteContentIndex['tags'];
  products: SiteContentIndex['products'];
  woocommerceAvailable: boolean;
  articleTotalFromWp?: number;
  previous: SiteContentIndex;
  mode: 'full' | 'incremental';
  onProgress?: (p: SyncProgress) => void;
}): Promise<SiteContentIndex> {
  params.onProgress?.({ stage: 'fingerprints' });
  let clusters = buildClustersFromIndex(params.siteId, params.articles);
  params.articles = params.articles.map((article) => {
    const cluster = clusters.find((c) => c.articleIds.some((id) => String(id) === String(article.id)));
    return {
      ...article,
      fingerprint: { ...article.fingerprint, contentClusterId: cluster?.id }
    };
  });
  clusters = buildClustersFromIndex(params.siteId, params.articles);

  params.onProgress?.({ stage: 'clusters' });
  const competitorTopics = db
    .getCompetitors(params.siteId)
    .filter((c: any) => c.verified && c.siteId === params.siteId)
    .flatMap((c: any) => c.topicCoverage || c.topTopics || []);

  params.onProgress?.({ stage: 'gaps' });
  const gaps = detectGaps({
    siteId: params.siteId,
    articles: params.articles,
    clusters,
    products: params.products,
    competitorTopics
  });
  const opportunities = buildOpportunities({
    siteId: params.siteId,
    articles: params.articles,
    clusters,
    gaps,
    products: params.products,
    categories: params.categories.map((c) => c.name)
  });
  const internalLinks = recommendInternalLinks(params.articles);

  const now = new Date().toISOString();
  const index: SiteContentIndex = {
    schemaVersion: 1,
    siteId: params.siteId,
    indexedAt: now,
    lastSyncedAt: now,
    lastFullSyncAt: params.mode === 'full' ? now : params.previous.lastFullSyncAt,
    lastIncrementalSyncAt: params.mode === 'incremental' ? now : params.previous.lastIncrementalSyncAt,
    wordpressUrl: params.wordpressUrl,
    woocommerceAvailable: params.woocommerceAvailable,
    articleTotalFromWp: params.articleTotalFromWp,
    articles: params.articles,
    categories: params.categories,
    tags: params.tags,
    products: params.products,
    internalLinks,
    clusters,
    gaps,
    opportunities,
    fingerprints: params.articles.map((a) => a.fingerprint)
  };

  params.onProgress?.({ stage: 'updating_intelligence' });
  saveContentIndex(index);
  await updateSiteProfileFromIndex(params.siteId, index);
  return index;
}

async function updateSiteProfileFromIndex(siteId: string, index: SiteContentIndex) {
  const sites = db.getSites();
  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx < 0) return;
  const titles = index.articles.map((a) => a.title).slice(0, 40);
  let aiBits: any = null;
  try {
    const result = await generateJsonContent({
      stage: 'site_profile',
      systemInstruction: 'Summarize the website from observed article titles only. Do not invent search volume, rankings, or competitor traffic. JSON only.',
      prompt: `Site: ${sites[idx].name}\nObserved titles:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\nReturn {"niche","audience":[],"mainTopics":[],"brandVoice","contentStyle"}`
    });
    aiBits = result.data;
  } catch {
    aiBits = null;
  }

  sites[idx].profile = {
    ...sites[idx].profile,
    niche: aiBits?.niche || sites[idx].profile?.niche || sites[idx].description,
    audience: aiBits?.audience || sites[idx].profile?.audience || [],
    mainTopics: aiBits?.mainTopics || index.categories.map((c) => c.name),
    subTopics: index.tags.map((t) => t.name).slice(0, 12),
    products: index.products.map((p) => p.name).slice(0, 20),
    categories: index.categories.map((c) => c.name),
    contentStyle: aiBits?.contentStyle || sites[idx].profile?.contentStyle,
    brandVoice: aiBits?.brandVoice || sites[idx].profile?.brandVoice,
    existingContentCount: index.articles.length,
    contentClusters: index.clusters.map((c) => ({
      id: c.id,
      name: c.name,
      pillarTopic: c.pillarTopic,
      existingArticlesCount: c.articleIds.length,
      missingArticlesCount: c.topics.filter((t) => t.status === 'missing').length,
      topics: c.topics
    })),
    contentGaps: index.gaps.slice(0, 12).map((g) => ({
      id: g.id,
      topic: g.topic,
      competitorsCovering: g.kind === 'competitor_covers_we_dont' ? 1 : 0,
      siteCoverage: g.kind === 'weak_coverage' ? 1 : 0,
      businessValue: 7,
      trafficPotential: 0,
      gapScore: 0,
      reason: g.reason,
      kind: g.kind,
      sourceType: g.sourceType,
      confidence: g.confidence
    })),
    lastAnalyzedAt: index.indexedAt,
    sourceType: 'calculated',
    isSeed: false,
    indexedArticleCount: index.articles.length,
    woocommerceAvailable: index.woocommerceAvailable
  };
  sites[idx].updatedAt = new Date().toISOString();
  db.saveSites(sites);
}

export function buildIndexFromLocalArticles(siteId: string, posts: Array<{
  id: string | number;
  title: string;
  content?: string;
  slug?: string;
  date?: string;
  modified?: string;
  categories?: string[];
  tags?: string[];
}>): SiteContentIndex {
  const articles = posts.map((post) => {
    const title = typeof post.title === 'string' ? post.title : String((post as any).title?.rendered || '');
    const content = typeof post.content === 'string' ? post.content : String((post as any).content?.rendered || '');
    const normalized = normalizeWordpressHtml(title, content, { tags: post.tags, category: post.categories?.[0] });
    const fingerprint = buildFingerprint({ siteId, articleId: post.id, title, slug: post.slug, normalized });
    return applyFreshness([
      toIndexedArticle({
        siteId,
        id: post.id,
        title,
        slug: post.slug,
        date: post.date,
        modified: post.modified,
        categories: post.categories,
        tags: post.tags,
        content,
        normalized,
        fingerprint,
        freshness: 'healthy',
        freshnessReason: '',
        sourceType: 'observed'
      })
    ])[0];
  });
  const clusters = buildClustersFromIndex(siteId, articles).map((c) => c);
  const withCluster = articles.map((article) => {
    const cluster = clusters.find((c) => c.articleIds.some((id) => String(id) === String(article.id)));
    return { ...article, fingerprint: { ...article.fingerprint, contentClusterId: cluster?.id } };
  });
  const rebuilt = buildClustersFromIndex(siteId, withCluster);
  const gaps = detectGaps({ siteId, articles: withCluster, clusters: rebuilt, products: [] });
  const opportunities = buildOpportunities({
    siteId,
    articles: withCluster,
    clusters: rebuilt,
    gaps,
    products: [],
    categories: [...new Set(withCluster.flatMap((a) => a.categories))]
  });
  const index: SiteContentIndex = {
    schemaVersion: 1,
    siteId,
    indexedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    lastFullSyncAt: new Date().toISOString(),
    woocommerceAvailable: false,
    articles: withCluster,
    categories: [],
    tags: [],
    products: [],
    internalLinks: recommendInternalLinks(withCluster),
    clusters: rebuilt,
    gaps,
    opportunities,
    fingerprints: withCluster.map((a) => a.fingerprint)
  };
  saveContentIndex(index);
  return index;
}
