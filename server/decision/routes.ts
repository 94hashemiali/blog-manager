import { Router } from 'express';
import { db } from '../db.js';
import {
  getNextBestActions,
  reEvaluateRecommendation,
  runDecisionEngine
} from './engine.js';
import { explainDecision } from './explain.js';
import { getDecision, listDecisions, loadDecisionStore } from './store.js';
import { applyPolicyToDecision } from './policy.js';
import { BATCH_ACTION_LIMIT } from './types.js';
import { executeRecommendation } from '../operations/execute.js';
import { getRecommendation, syncRecommendationsFromState } from '../operations/recommendations.js';
import { loadAutomation } from '../jobs/automation.js';

export const decisionRouter = Router();

function fail(res: any, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    error: { code, message, retryable: false },
    message
  });
}

export function executeDecisionById(siteId: string, decisionId: string) {
  let decision = getDecision(siteId, decisionId);
  if (!decision) {
    const result = runDecisionEngine(siteId, { persist: true, topN: 20 });
    decision = result.decisions.find((d) => d.id === decisionId);
  }
  if (!decision || decision.siteId !== siteId) {
    throw new Error('Decision not found');
  }
  if (
    decision.recommendedAction === 'DEFER' ||
    decision.feasibilityStatus === 'BLOCKED' ||
    decision.feasibilityStatus === 'INSUFFICIENT_DATA'
  ) {
    throw new Error(
      `Decision not executable (${decision.feasibilityStatus || decision.recommendedAction})`
    );
  }
  const applied = applyPolicyToDecision(siteId, decision, 'RECOMMEND');
  if (!applied.recommendationId) {
    throw new Error(applied.message || 'Could not materialize recommendation');
  }
  const out = executeRecommendation(siteId, applied.recommendationId);
  return { decision, ...out };
}

/** GET …/next — read persisted top actions (no silent write). */
decisionRouter.get('/:siteId/next', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const rows = listDecisions(siteId, ['OPEN', 'SELECTED'])
    .filter(
      (d) =>
        d.recommendedAction !== 'DEFER' &&
        d.feasibilityStatus !== 'BLOCKED' &&
        d.feasibilityStatus !== 'INSUFFICIENT_DATA'
    )
    .sort((a, b) => b.score - a.score);
  const actions = rows.slice(0, 5);
  const nextBest = actions.find((d) => d.status === 'SELECTED') || actions[0] || null;
  const store = loadDecisionStore(siteId);
  res.json({
    success: true,
    siteId,
    generatedAt: store.lastRunAt || null,
    nextBest,
    actions,
    decisionEngineVersion: store.decisionEngineVersion,
    note: 'Read-only. POST /re-evaluate to refresh.'
  });
});

decisionRouter.get('/:siteId/history', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const history = listDecisions(siteId)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 50)
    .map((d) => ({
      id: d.id,
      type: d.type,
      recommendedAction: d.recommendedAction,
      title: d.title,
      score: d.score,
      confidence: d.confidence,
      expectedImpact: d.expectedImpact,
      status: d.status,
      feasibilityStatus: d.feasibilityStatus,
      blockers: d.blockers,
      signals: d.signals.map((s) => ({
        id: s.id,
        type: s.type,
        entityType: s.entityType,
        severity: s.severity,
        confidence: s.confidence,
        evidence: s.evidence
      })),
      selectedAction: d.recommendedAction,
      recommendationId: d.recommendationId,
      decisionEngineVersion: d.decisionEngineVersion,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      explanation: explainDecision(d)
    }));
  res.json({ success: true, history });
});

decisionRouter.get('/:siteId/all', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const result = runDecisionEngine(siteId, { persist: false, topN: 20 });
  res.json({ success: true, result });
});

decisionRouter.get('/:siteId/detail/:decisionId', (req, res) => {
  const { siteId, decisionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const decision = getDecision(siteId, decisionId);
  if (!decision || decision.siteId !== siteId) return fail(res, 404, 'not_found', 'Decision not found');
  const recommendation = decision.recommendationId
    ? getRecommendation(siteId, decision.recommendationId)
    : undefined;
  res.json({
    success: true,
    decision,
    explanation: explainDecision(decision),
    recommendation: recommendation || null
  });
});

decisionRouter.get('/:siteId/article/:articleId', (req, res) => {
  const { siteId, articleId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const result = runDecisionEngine(siteId, { persist: false, topN: 20 });
  const context = result.articleContexts.find((c) => String(c.articleId) === String(articleId));
  const decisions = result.decisions.filter(
    (d) => d.articleId != null && String(d.articleId) === String(articleId)
  );
  res.json({
    success: true,
    context: context || null,
    decisions,
    nextBest: decisions[0] || null
  });
});

decisionRouter.get('/:siteId/:decisionId', (req, res) => {
  const { siteId, decisionId } = req.params;
  if (
    ['next', 'history', 'all', 'article', 'detail', 'batch', 'apply-policy', 're-evaluate'].includes(
      decisionId
    )
  ) {
    return fail(res, 404, 'not_found', 'Decision not found');
  }
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const decision = getDecision(siteId, decisionId);
  if (!decision || decision.siteId !== siteId) return fail(res, 404, 'not_found', 'Decision not found');
  res.json({ success: true, decision, explanation: explainDecision(decision) });
});

decisionRouter.get('/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const store = loadDecisionStore(siteId);
  const actions = listDecisions(siteId, ['OPEN', 'SELECTED'])
    .filter(
      (d) =>
        d.recommendedAction !== 'DEFER' &&
        d.feasibilityStatus !== 'BLOCKED' &&
        d.feasibilityStatus !== 'INSUFFICIENT_DATA'
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (!actions.length) {
    const live = getNextBestActions(siteId, 5);
    return res.json({
      success: true,
      nextBest: live.nextBest,
      topActions: live.actions,
      actions: live.actions,
      decisionEngineVersion: live.decisionEngineVersion,
      generatedAt: live.generatedAt,
      persisted: false
    });
  }
  const nextBest = actions.find((d) => d.status === 'SELECTED') || actions[0] || null;
  res.json({
    success: true,
    nextBest,
    topActions: actions,
    actions,
    decisionEngineVersion: store.decisionEngineVersion,
    generatedAt: store.lastRunAt || null,
    persisted: true
  });
});

decisionRouter.post('/:siteId/re-evaluate', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const result = runDecisionEngine(siteId, { persist: true, topN: 8 });
  const recs = syncRecommendationsFromState(siteId);
  res.json({
    success: true,
    nextBest: result.nextBest,
    topActions: result.topActions,
    recommendationIds: recs.map((r) => r.id),
    decisionEngineVersion: result.decisionEngineVersion,
    generatedAt: result.generatedAt,
    signalCount: result.signals.length
  });
});

decisionRouter.post('/:siteId/:decisionId/re-evaluate', (req, res) => {
  const { siteId, decisionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const decision = getDecision(siteId, decisionId);
  if (!decision || decision.siteId !== siteId) return fail(res, 404, 'not_found', 'Decision not found');
  try {
    if (decision.recommendationId) {
      const out = reEvaluateRecommendation(siteId, decision.recommendationId);
      return res.json({ success: true, ...out });
    }
    const result = runDecisionEngine(siteId, { persist: true, topN: 20 });
    const refreshed = result.decisions.find((d) => d.id === decisionId) || result.nextBest;
    res.json({
      success: true,
      decision: refreshed,
      explanation: refreshed ? explainDecision(refreshed) : null,
      stillNeeded: Boolean(refreshed)
    });
  } catch (err: any) {
    return fail(res, 400, 'reeval_failed', err?.message || 'Re-evaluate failed');
  }
});

decisionRouter.post('/:siteId/:decisionId/execute', (req, res) => {
  const { siteId, decisionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  if (['batch', 'apply-policy', 're-evaluate'].includes(decisionId)) {
    return fail(res, 404, 'not_found', 'Invalid decision id');
  }
  try {
    const out = executeDecisionById(siteId, decisionId);
    res.json({
      success: true,
      decision: out.decision,
      recommendation: out.recommendation,
      opsJobId: out.opsJobId,
      productionJobId: out.productionJobId,
      message: out.message
    });
  } catch (err: any) {
    return fail(res, 400, 'execute_failed', err?.message || 'Execute failed');
  }
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
      results.push({ id, ok: true, message: out.message, opsJobId: out.opsJobId });
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
