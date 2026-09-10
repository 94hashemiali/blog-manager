import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db.js';
import { buildResearchPlan } from './planner.js';
import { defaultResearchProviders, getWebSearchProvider } from './providers.js';
import { fetchAndCacheSource, addManualSourceToSession, runGroundedResearch } from './packet.js';
import { enqueueJob } from '../jobs/enqueue.js';
import { getResearchSession, listResearchSessions, loadResearchStore } from './store.js';
import { validateResearchUrl } from './urlSafety.js';

export const researchRouter = Router();

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

researchRouter.get('/:siteId/providers', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  res.json({
    success: true,
    providers: defaultResearchProviders(),
    webSearch: getWebSearchProvider().getStatus()
  });
});

researchRouter.post(
  '/:siteId/plan',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const topic = String(req.body?.topic || '').trim();
    if (!topic) return fail(res, 400, 'موضوع الزامی است.');
    const plan = await buildResearchPlan({
      siteId,
      topic,
      primaryKeyword: req.body?.primaryKeyword,
      searchIntent: req.body?.searchIntent,
      enrichWithAi: req.body?.enrichWithAi !== false
    });
    res.json({ success: true, plan, webSearch: getWebSearchProvider().getStatus() });
  })
);

researchRouter.post(
  '/:siteId/sources',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const web = getWebSearchProvider();
    const query = String(req.body?.query || req.body?.topic || '').trim();
    const candidates = query ? await web.search(query) : [];
    res.json({
      success: true,
      candidates,
      provider: web.getStatus(),
      message: web.configured
        ? undefined
        : 'WEB RESEARCH PROVIDER NOT CONFIGURED — از URL دستی یا ایندکس وردپرس استفاده کنید.'
    });
  })
);

researchRouter.post(
  '/:siteId/fetch',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const url = String(req.body?.url || '').trim();
    const validation = validateResearchUrl(url);
    if (!validation.ok) return fail(res, 400, validation.reason || 'URL نامعتبر');

    const result = await fetchAndCacheSource({
      siteId,
      url,
      forceRefresh: Boolean(req.body?.forceRefresh),
      freshnessRequirement: req.body?.freshnessRequirement
    });
    res.json({
      success: true,
      source: result.source,
      evidence: result.evidence,
      fromCache: result.fromCache
    });
  })
);

researchRouter.post(
  '/:siteId/analyze',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const topic = String(req.body?.topic || '').trim();
    if (!topic) return fail(res, 400, 'موضوع الزامی است.');
    const manualUrls = Array.isArray(req.body?.urls)
      ? req.body.urls.map(String)
      : typeof req.body?.url === 'string'
        ? [req.body.url]
        : [];

    // Legacy sync path for tests / explicit wait.
    if (req.body?.wait === true || req.query.wait === '1') {
      const { packet, session } = await runGroundedResearch({
        siteId,
        topic,
        primaryKeyword: req.body?.primaryKeyword,
        searchIntent: req.body?.searchIntent,
        targetAudience: req.body?.targetAudience,
        userProvidedFacts: Array.isArray(req.body?.userProvidedFacts)
          ? req.body.userProvidedFacts.map(String)
          : [],
        manualUrls,
        forceRefreshUrls: Boolean(req.body?.forceRefresh),
        enrichPlanWithAi: req.body?.enrichWithAi !== false
      });
      return res.status(201).json({ success: true, legacy: true, packet, session });
    }

    const { job, created } = enqueueJob({
      siteId,
      type: 'RESEARCH',
      payload: {
        topic,
        primaryKeyword: req.body?.primaryKeyword,
        searchIntent: req.body?.searchIntent,
        targetAudience: req.body?.targetAudience,
        userProvidedFacts: Array.isArray(req.body?.userProvidedFacts)
          ? req.body.userProvidedFacts.map(String)
          : [],
        urls: manualUrls,
        forceRefresh: Boolean(req.body?.forceRefresh),
        enrichWithAi: req.body?.enrichWithAi !== false
      },
      entityKey: `research:${topic}`,
      idempotencyKey: `research-${siteId}-${topic}`,
      triggerReason: 'api:research_analyze'
    });

    res.status(created ? 202 : 200).json({
      success: true,
      jobId: job.id,
      status: job.status,
      created,
      message: 'Research job queued'
    });
  })
);

researchRouter.get('/:siteId/sessions', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  res.json({
    success: true,
    sessions: listResearchSessions(siteId).map((session) => ({
      id: session.id,
      topic: session.topic,
      confidence: session.researchConfidence,
      quality: session.qualityGate.status,
      sourceCount: session.sources.length,
      claimCount: session.claims.length,
      updatedAt: session.updatedAt
    }))
  });
});

researchRouter.get('/:siteId/cache/summary', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const store = loadResearchStore(siteId);
  res.json({
    success: true,
    cachedSources: Object.keys(store.sourcesByUrl).length,
    sessions: store.sessions.length
  });
});

researchRouter.get('/:siteId/:researchId', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const session = getResearchSession(siteId, req.params.researchId);
  if (!session) return fail(res, 404, 'جلسهٔ تحقیق یافت نشد.');
  res.json({ success: true, session });
});

researchRouter.get('/:siteId/:researchId/sources', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const session = getResearchSession(siteId, req.params.researchId);
  if (!session) return fail(res, 404, 'جلسهٔ تحقیق یافت نشد.');
  res.json({ success: true, sources: session.sources });
});

researchRouter.get('/:siteId/:researchId/claims', (req, res) => {
  const siteId = requireSite(req, res);
  if (!siteId) return;
  const session = getResearchSession(siteId, req.params.researchId);
  if (!session) return fail(res, 404, 'جلسهٔ تحقیق یافت نشد.');
  res.json({
    success: true,
    claims: session.claims,
    conflicts: session.conflicts,
    evidence: session.extractedEvidence
  });
});

researchRouter.post(
  '/:siteId/:researchId/refresh',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const session = getResearchSession(siteId, req.params.researchId);
    if (!session) return fail(res, 404, 'جلسهٔ تحقیق یافت نشد.');

    const urls = session.sources.map((row) => row.url).filter(Boolean);
    const { packet, session: next } = await runGroundedResearch({
      siteId,
      topic: session.topic,
      primaryKeyword: session.plan.topic,
      searchIntent: session.plan.searchIntent,
      manualUrls: urls,
      forceRefreshUrls: true,
      enrichPlanWithAi: false
    });
    res.json({ success: true, packet, session: next, previousId: session.id });
  })
);

researchRouter.post(
  '/:siteId/:researchId/add-source',
  asyncRoute(async (req, res) => {
    const siteId = requireSite(req, res);
    if (!siteId) return;
    const session = getResearchSession(siteId, req.params.researchId);
    if (!session) return fail(res, 404, 'جلسهٔ تحقیق یافت نشد.');
    const url = String(req.body?.url || '').trim();
    const validation = validateResearchUrl(url);
    if (!validation.ok) return fail(res, 400, validation.reason || 'URL نامعتبر');

    const next = await addManualSourceToSession({
      siteId,
      session,
      url,
      forceRefresh: Boolean(req.body?.forceRefresh)
    });
    res.json({ success: true, session: next });
  })
);