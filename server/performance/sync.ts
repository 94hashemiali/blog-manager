import { getContentIndex } from '../intelligence/store.js';
import { evaluateCannibalization } from '../intelligence/duplication.js';
import { jaccard, tokenize } from '../intelligence/text.js';
import { buildWordpressBaseline } from './metrics.js';
import { auditFreshness } from './freshness.js';
import { assessDecay } from './decay.js';
import { assessArticleHealth } from './health.js';
import { computeLinkingImpact } from './linkingImpact.js';
import { buildPerformanceOpportunities } from './opportunities.js';
import { buildNextActionsOverview } from './actions.js';
import { calculateTrend } from './trends.js';
import {
  defaultProviderStatuses,
  getAnalyticsProvider,
  getSearchConsoleProvider,
  validateSnapshot
} from './providers.js';
import { loadPerformanceStore, savePerformanceStore } from './store.js';
import {
  MAX_DAILY_SNAPSHOTS_PER_ARTICLE,
  type ContentPerformanceRecord,
  type PerformanceOverview,
  type ProviderStatus
} from './types.js';

function hasNewerSibling(articleId: string | number, articles: ReturnType<typeof getContentIndex>['articles']): boolean {
  const article = articles.find((row) => String(row.id) === String(articleId));
  if (!article) return false;
  const tokens = tokenize(article.title);
  return articles.some((row) => {
    if (String(row.id) === String(articleId)) return false;
    const sim = jaccard(tokens, tokenize(row.title));
    if (sim < 35) return false;
    const aDate = new Date(article.modified || article.date || 0).getTime();
    const bDate = new Date(row.modified || row.date || 0).getTime();
    return bDate > aDate;
  });
}

/**
 * SYNC_REQUEST → providers → normalize → validate → store → trends/decay/opportunities
 */
export function syncPerformanceForSite(siteId: string): {
  overview: PerformanceOverview;
  records: ContentPerformanceRecord[];
  providerStatuses: ReturnType<typeof defaultProviderStatuses>;
} {
  const index = getContentIndex(siteId);
  const previous = loadPerformanceStore(siteId);
  const gsc = getSearchConsoleProvider().getConnectionStatus();
  const ga = getAnalyticsProvider().getConnectionStatus();
  const providers: ProviderStatus[] = defaultProviderStatuses().map((row) => {
    if (row.provider === 'search_console') return { ...gsc, lastSyncedAt: previous.lastSyncedAt };
    if (row.provider === 'analytics') return { ...ga, lastSyncedAt: previous.lastSyncedAt };
    if (row.provider === 'wordpress') {
      return {
        ...row,
        status: (index.articles.length > 0 ? 'connected' : 'misconfigured') as ProviderStatus['status'],
        detail:
          index.articles.length > 0
            ? `${index.articles.length} مقاله در ایندکس محلی`
            : 'ایندکس محتوا خالی است؛ ابتدا همگام‌سازی وردپرس را اجرا کنید.',
        lastSyncedAt: index.indexedAt
      };
    }
    return row;
  });

  // Keep any previously validated imported/manual snapshots; never invent GSC rows.
  const snapshots = previous.snapshots
    .map((snap) => validateSnapshot(snap, siteId))
    .filter(Boolean) as typeof previous.snapshots;

  const records: ContentPerformanceRecord[] = index.articles
    .filter((article) => article.siteId === siteId)
    .map((article) => {
      const baseline = buildWordpressBaseline(article, index.indexedAt);
      // Demo/seed content must never look like live performance.
      if (baseline.quality === 'DEMO_DATA') {
        baseline.freshnessClass = baseline.freshnessClass === 'unknown' ? 'unknown' : baseline.freshnessClass;
      }

      const freshnessIssues = auditFreshness({
        article,
        products: index.products,
        allArticles: index.articles
      });
      const articleSnapshots = snapshots
        .filter((snap) => String(snap.articleId) === String(article.id))
        .slice(-MAX_DAILY_SNAPSHOTS_PER_ARTICLE);
      const trend =
        gsc.status === 'connected' && articleSnapshots.length > 0
          ? calculateTrend(articleSnapshots)
          : calculateTrend([]); // yields INSUFFICIENT_DATA

      const cannibalization = evaluateCannibalization({
        siteId,
        title: article.title,
        keyword: article.fingerprint.primaryKeyword,
        searchIntent: article.fingerprint.searchIntent,
        articles: index.articles.filter((row) => String(row.id) !== String(article.id))
      });

      const decay = assessDecay({
        siteId,
        article,
        baseline,
        freshnessIssues,
        trend: gsc.status === 'connected' ? trend : undefined,
        hasNewerSibling: hasNewerSibling(article.id, index.articles),
        cannibalizationRisk: cannibalization.cannibalizationRisk
      });

      const linkingImpact = computeLinkingImpact({
        siteId,
        article,
        articles: index.articles,
        clusters: index.clusters
      });

      const health = assessArticleHealth({
        siteId,
        article,
        baseline,
        freshnessIssues,
        decay,
        linkingImpact,
        trend: gsc.status === 'connected' ? trend : undefined,
        searchConsoleConnected: gsc.status === 'connected'
      });

      const opportunities = buildPerformanceOpportunities({
        siteId,
        article,
        baseline,
        decay,
        freshnessIssues,
        health,
        linkingImpact,
        trend: gsc.status === 'connected' ? trend : undefined
      });

      return {
        siteId,
        articleId: article.id,
        baseline,
        decay,
        freshnessIssues,
        health,
        trend: gsc.status === 'connected' ? trend : undefined,
        linkingImpact,
        opportunities,
        snapshots: articleSnapshots
      };
    });

  const opportunities = records.flatMap((record) => record.opportunities);
  const counts = {
    healthy: records.filter((record) => record.decay.status === 'HEALTHY').length,
    watch: records.filter((record) => record.decay.status === 'WATCH').length,
    declining: records.filter((record) => record.decay.status === 'DECLINING').length,
    decayed: records.filter((record) => record.decay.status === 'DECAYED').length,
    needsData: records.filter((record) => record.decay.status === 'INSUFFICIENT_DATA').length,
    total: records.length
  };

  const actions = buildNextActionsOverview({
    siteId,
    opportunities,
    decayCounts: counts,
    providers
  });

  const overview: PerformanceOverview = {
    siteId,
    assessedAt: new Date().toISOString(),
    overall: actions.overall,
    counts,
    providers,
    topPriorities: actions.topPriorities,
    createRecommendations: actions.createRecommendations,
    improveRecommendations: actions.improveRecommendations,
    hasSearchPerformance: actions.hasSearchPerformance,
    hasAnalytics: actions.hasAnalytics
  };

  savePerformanceStore({
    schemaVersion: 1,
    siteId,
    providers,
    records,
    snapshots,
    opportunities,
    lastSyncedAt: overview.assessedAt,
    lastSyncSource: 'wordpress',
    syncError: index.syncError
  });

  return { overview, records, providerStatuses: providers };
}

export function getPerformanceOverview(siteId: string): PerformanceOverview {
  const store = loadPerformanceStore(siteId);
  if (store.records.length === 0) {
    return syncPerformanceForSite(siteId).overview;
  }
  const counts = {
    healthy: store.records.filter((record) => record.decay.status === 'HEALTHY').length,
    watch: store.records.filter((record) => record.decay.status === 'WATCH').length,
    declining: store.records.filter((record) => record.decay.status === 'DECLINING').length,
    decayed: store.records.filter((record) => record.decay.status === 'DECAYED').length,
    needsData: store.records.filter((record) => record.decay.status === 'INSUFFICIENT_DATA').length,
    total: store.records.length
  };
  const actions = buildNextActionsOverview({
    siteId,
    opportunities: store.opportunities,
    decayCounts: counts,
    providers: store.providers
  });
  return {
    siteId,
    assessedAt: store.lastSyncedAt || new Date().toISOString(),
    overall: actions.overall,
    counts,
    providers: store.providers,
    topPriorities: actions.topPriorities,
    createRecommendations: actions.createRecommendations,
    improveRecommendations: actions.improveRecommendations,
    hasSearchPerformance: actions.hasSearchPerformance,
    hasAnalytics: actions.hasAnalytics
  };
}
