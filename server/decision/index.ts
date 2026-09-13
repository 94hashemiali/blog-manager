import { Router } from 'express';
import { db } from '../db.js';
import { runDecisionEngine } from './engine.js';
import { getDecision, listDecisions } from './store.js';
import { applyPolicyToDecision } from './policy.js';
import { BATCH_ACTION_LIMIT } from './types.js';
import { executeRecommendation } from '../operations/execute.js';
import { getRecommendation } from '../operations/recommendations.js';
import { loadAutomation } from '../jobs/automation.js';

export const decisionRouter = Router();

function fail(res: any, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    error: { code, message, retryable: false },
    message
  });
}

decisionRouter.get('/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const result = runDecisionEngine(siteId, { persist: true, topN: 5 });
  res.json({
    success: true,
    nextBest: result.nextBest,
    topActions: result.topActions,
    decisionEngineVersion: result.decisionEngineVersion,
    generatedAt: result.generatedAt,
    signalCount: result.signals.length
  });
});

decisionRouter.get('/:siteId/all', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const result = runDecisionEngine(siteId, { persist: true, topN: 20 });
  res.json({ success: true, result });
});

decisionRouter.get('/:siteId/detail/:decisionId', (req, res) => {
  const { siteId, decisionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  let decision = getDecision(siteId, decisionId);
  if (!decision) {
    const result = runDecisionEngine(siteId, { persist: true, topN: 20 });
    decision = result.decisions.find((d) => d.id === decisionId);
  }
  if (!decision || decision.siteId !== siteId) return fail(res, 404, 'not_found', 'Decision not found');
  res.json({ success: true, decision });
});

decisionRouter.get('/:siteId/article/:articleId', (req, res) => {
  const { siteId, articleId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const result = runDecisionEngine(siteId, { persist: false, topN: 20 });
  const context = result.articleContexts.find((c) => String(c.articleId) === String(articleId));
  const decisions = result.decisions.filter((d) => d.articleId != null && String(d.articleId) === String(articleId));
  res.json({
    success: true,
    context: context || null,
    decisions,
    nextBest: decisions[0] || null
  });
});

decisionRouter.post('/:siteId/batch', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const ids = Array.isArray(req.body?.recommendationIds) ? req.body.recommendationIds.map(String) : [];
  if (!ids.length) return fail(res, 400, 'bad_request', 'recommendationIds required');
  const limited = ids.slice(0, BATCH_ACTION_LIMIT);
  const results: Array<{ id: string; ok: boolean; message: string; opsJobId?: string }> = [];
  for (const id of limited) {
    const rec = getRecommendation(siteId, id);
    if (!rec || rec.siteId !== siteId) {
      results.push({ id, ok: false, message: 'not found or wrong site' });
      continue;
    }
    try {
      const out = executeRecommendation(siteId, id);
      results.push({
        id,
        ok: true,
        message: out.message,
        opsJobId: out.opsJobId
      });
    } catch (err: any) {
      results.push({ id, ok: false, message: err?.message || 'failed' });
    }
  }
  res.json({
    success: true,
    limit: BATCH_ACTION_LIMIT,
    requested: ids.length,
    executed: limited.length,
    results
  });
});

decisionRouter.post('/:siteId/apply-policy', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const automation = loadAutomation(siteId);
  const policy = automation.settings.policy || 'RECOMMEND';
  const result = runDecisionEngine(siteId, { persist: true, topN: 5 });
  const applied = result.topActions.slice(0, 3).map((d) => applyPolicyToDecision(siteId, d, policy));
  res.json({
    success: true,
    policy,
    applied,
    note: 'Automatic publishing remains OFF.'
  });
});

export { runDecisionEngine, listDecisions };
