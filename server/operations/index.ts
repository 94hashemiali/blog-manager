import { Router } from 'express';
import { db } from '../db.js';
import { buildOperationsSnapshot } from './overview.js';
import { collectAttention } from './attention.js';
import {
  getRecommendation,
  listRecommendations,
  syncRecommendationsFromState,
  updateRecommendationStatus
} from './recommendations.js';
import { executeRecommendation } from './execute.js';
import { buildArticleHealthViews, buildContentHealthSummary } from './health.js';
import { buildContentDiff } from './diff.js';
import { listDomainEvents } from '../jobs/events.js';
import { getJob } from '../content/store.js';
import { listContentImpacts } from '../jobs/impact.js';

export const operationsDomainRouter = Router();

function fail(res: any, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    error: { code, message, retryable: false },
    message
  });
}

operationsDomainRouter.get('/overview/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const snapshot = buildOperationsSnapshot(siteId);
  res.json({ success: true, snapshot });
});

operationsDomainRouter.get('/attention/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  res.json({ success: true, attention: collectAttention(siteId) });
});

operationsDomainRouter.get('/recommendations/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  syncRecommendationsFromState(siteId);
  res.json({ success: true, recommendations: listRecommendations(siteId) });
});

operationsDomainRouter.post('/recommendations/:siteId/:id/acknowledge', (req, res) => {
  const { siteId, id } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const updated = updateRecommendationStatus(siteId, id, 'ACKNOWLEDGED');
  if (!updated) return fail(res, 404, 'not_found', 'Recommendation not found');
  res.json({ success: true, recommendation: updated });
});

operationsDomainRouter.post('/recommendations/:siteId/:id/dismiss', (req, res) => {
  const { siteId, id } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const updated = updateRecommendationStatus(siteId, id, 'DISMISSED');
  if (!updated) return fail(res, 404, 'not_found', 'Recommendation not found');
  res.json({ success: true, recommendation: updated });
});

operationsDomainRouter.post('/recommendations/:siteId/:id/execute', (req, res) => {
  const { siteId, id } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const result = executeRecommendation(siteId, id);
    res.json({ success: true, ...result });
  } catch (err: any) {
    return fail(res, 409, 'execute_failed', err?.message || 'Execute failed');
  }
});

operationsDomainRouter.get('/timeline/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const events = listDomainEvents(siteId, 80);
  res.json({ success: true, timeline: events });
});

operationsDomainRouter.get('/health/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  res.json({
    success: true,
    summary: buildContentHealthSummary(siteId),
    articles: buildArticleHealthViews(siteId)
  });
});

operationsDomainRouter.get('/impacts/:siteId/:impactId', (req, res) => {
  const { siteId, impactId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const impact = listContentImpacts(siteId).find((row) => row.id === impactId);
  if (!impact) return fail(res, 404, 'not_found', 'Impact not found');
  res.json({ success: true, impact });
});

operationsDomainRouter.get('/review/:siteId/diff/:productionJobId', (req, res) => {
  const { siteId, productionJobId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const job = getJob(siteId, productionJobId);
  if (!job || job.siteId !== siteId) return fail(res, 404, 'not_found', 'Production job not found');

  const versions = job.versions || [];
  const baseline = versions[0];
  const newest = versions.length ? versions[versions.length - 1] : undefined;
  const beforeContent = baseline?.content || '';
  const afterContent = job.draft?.content || newest?.content || '';
  const beforeTitle = baseline?.title || job.topic;
  const afterTitle = job.draft?.title || newest?.title || job.topic;

  const diff = buildContentDiff({
    beforeTitle,
    afterTitle,
    beforeContent,
    afterContent,
    beforeMeta: baseline?.metaDescription,
    afterMeta: job.draft?.metaDescription || newest?.metaDescription
  });

  res.json({
    success: true,
    productionJobId: job.id,
    mode: job.mode,
    stage: job.stage,
    recommendationId: undefined,
    diff,
    claims: {
      before: [],
      after: job.research?.claims || [],
      highRiskUnsupported: (job.research?.claims || []).filter(
        (c) => c.highRisk && (c.status === 'UNSUPPORTED' || c.status === 'CONTRADICTED')
      )
    },
    checklist: job.publishingChecklist
  });
});

// Convenience: sync recommendations without full snapshot
operationsDomainRouter.post('/recommendations/:siteId/sync', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const created = syncRecommendationsFromState(siteId);
  res.json({
    success: true,
    created: created.length,
    recommendations: listRecommendations(siteId, ['OPEN', 'IN_PROGRESS', 'ACKNOWLEDGED'])
  });
});
