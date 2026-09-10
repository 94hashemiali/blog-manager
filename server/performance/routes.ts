import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db.js';
import { getContentIndex } from '../intelligence/store.js';
import { createUpdateProductionJob } from '../content/pipeline.js';
import { describeProgress } from '../content/pipeline.js';
import { getPerformanceOverview, syncPerformanceForSite } from './sync.js';
import { loadPerformanceStore } from './store.js';
import { buildDeterministicUpdatePlan, enrichUpdatePlanWithAi } from './updatePlan.js';
import { defaultProviderStatuses, getAnalyticsProvider, getSearchConsoleProvider } from './providers.js';

export const performanceRouter = Router();

function fail(res: Response, status: number, message: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ success: false, error: message, message, ...extra });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function requireSite(req: Request, res: Response): string | null {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) {
    fail(res, 404, 'سایت یافت نشد.');
    return null;
  }
  return siteId;
}

performanceRouter.get('/:siteId/overview', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  res.json({ success: true, overview: getPerformanceOverview(siteId) });
});

performanceRouter.get('/:siteId/articles', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const store = loadPerformanceStore(siteId);
  const records =
    store.records.length > 0 ? store.records : syncPerformanceForSite(siteId).records;
  res.json({
    success: true,
    articles: records.map((record) => ({
      articleId: record.articleId,
      title: record.baseline.title,
      url: record.baseline.url,
      decayStatus: record.decay.status,
      overallHealth: record.health.overallStatus,
      daysSinceModification: record.baseline.daysSinceModification,
      wordCount: record.baseline.wordCount,
      opportunityCount: record.opportunities.length,
      topOpportunity: record.opportunities[0]?.type,
      freshnessIssueCount: record.freshnessIssues.length,
      quality: record.baseline.quality
    }))
  });
});

performanceRouter.get('/:siteId/articles/:articleId', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  let records = loadPerformanceStore(siteId).records;
  if (records.length === 0) records = syncPerformanceForSite(siteId).records;
  const record = records.find((row) => String(row.articleId) === String(req.params.articleId));
  if (!record) return fail(res, 404, 'رکورد عملکرد برای این مقاله یافت نشد.');
  res.json({ success: true, record });
});

performanceRouter.get('/:siteId/opportunities', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const store = loadPerformanceStore(siteId);
  const opportunities =
    store.opportunities.length > 0
      ? store.opportunities
      : syncPerformanceForSite(siteId).records.flatMap((record) => record.opportunities);
  res.json({ success: true, opportunities });
});

performanceRouter.get('/:siteId/decay', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const records =
    loadPerformanceStore(siteId).records.length > 0
      ? loadPerformanceStore(siteId).records
      : syncPerformanceForSite(siteId).records;
  res.json({
    success: true,
    decay: records.map((record) => ({
      articleId: record.articleId,
      title: record.baseline.title,
      status: record.decay.status,
      reasons: record.decay.reasons,
      signals: record.decay.signals
    }))
  });
});

performanceRouter.get('/:siteId/health', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const overview = getPerformanceOverview(siteId);
  res.json({
    success: true,
    health: {
      overall: overview.overall,
      counts: overview.counts,
      providers: overview.providers
    }
  });
});

performanceRouter.get('/:siteId/providers', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const store = loadPerformanceStore(siteId);
  res.json({
    success: true,
    providers: store.providers.length ? store.providers : defaultProviderStatuses(),
    searchConsole: getSearchConsoleProvider().getConnectionStatus(),
    analytics: getAnalyticsProvider().getConnectionStatus()
  });
});

performanceRouter.get('/:siteId/next-actions', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const overview = getPerformanceOverview(siteId);
  res.json({
    success: true,
    create: overview.createRecommendations,
    improve: overview.improveRecommendations,
    topPriorities: overview.topPriorities
  });
});

performanceRouter.post('/:siteId/sync', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const result = syncPerformanceForSite(siteId);
  res.json({
    success: true,
    overview: result.overview,
    articleCount: result.records.length,
    providers: result.providerStatuses
  });
});

performanceRouter.post(
  '/:siteId/articles/:articleId/update-plan',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const index = getContentIndex(siteId);
    const article = index.articles.find((row) => String(row.id) === String(req.params.articleId));
    if (!article) return fail(res, 404, 'مقاله در ایندکس یافت نشد.');

    const synced = syncPerformanceForSite(siteId);
    const record = synced.records.find((row) => String(row.articleId) === String(article.id));
    if (!record) return fail(res, 404, 'رکورد عملکرد یافت نشد.');

    let plan = buildDeterministicUpdatePlan({
      siteId,
      article,
      baseline: record.baseline,
      decay: record.decay,
      freshnessIssues: record.freshnessIssues,
      linkingImpact: record.linkingImpact,
      opportunities: record.opportunities
    });

    if (req.body?.enrichWithAi) {
      plan = await enrichUpdatePlanWithAi(plan, article.title);
    }

    res.json({ success: true, plan, linkingImpact: record.linkingImpact });
  })
);

performanceRouter.post(
  '/:siteId/articles/:articleId/create-update-job',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const index = getContentIndex(siteId);
    const article = index.articles.find((row) => String(row.id) === String(req.params.articleId));
    if (!article) return fail(res, 404, 'مقاله در ایندکس یافت نشد.');

    const synced = syncPerformanceForSite(siteId);
    const record = synced.records.find((row) => String(row.articleId) === String(article.id));
    if (!record) return fail(res, 404, 'رکورد عملکرد یافت نشد.');

    let plan = buildDeterministicUpdatePlan({
      siteId,
      article,
      baseline: record.baseline,
      decay: record.decay,
      freshnessIssues: record.freshnessIssues,
      linkingImpact: record.linkingImpact,
      opportunities: record.opportunities
    });
    if (req.body?.enrichWithAi) {
      plan = await enrichUpdatePlanWithAi(plan, article.title);
    }

    const job = createUpdateProductionJob({
      siteId,
      articleId: article.id,
      updateReason: req.body?.reason || record.opportunities[0]?.reason || record.decay.reasons[0],
      updatePlan: {
        whyUpdateNeeded: plan.whyUpdateNeeded,
        sectionsToPreserve: plan.sectionsToPreserve,
        sectionsToModify: plan.sectionsToModify,
        sectionsToAdd: plan.sectionsToAdd,
        factsToVerify: plan.factsToVerify,
        expectedRisk: plan.expectedRisk,
        requiredHumanReview: plan.requiredHumanReview
      },
      performanceSignals: record.decay.signals.map((signal) => signal.evidence),
      mode: req.body?.mode === 'MERGE' ? 'MERGE' : 'UPDATE'
    });

    res.status(201).json({
      success: true,
      job,
      progress: describeProgress(job),
      plan,
      linkingImpact: record.linkingImpact
    });
  })
);
