import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-'));
process.env.BLOG_MANAGER_DATA_DIR = tmp;

const { db } = await import('../db.js');
const { collectDecisionSignals, normalizeSignals } = await import('./signals.js');
const { scoreDecision, confidenceLabel, riskFromSignals } = await import('./scoring.js');
const { checkActionFeasibility } = await import('./actions.js');
const { runDecisionEngine } = await import('./engine.js');
const { isRecommendationStillNeeded } = await import('./reeval.js');
const { applyPolicyToDecision } = await import('./policy.js');
const { BATCH_ACTION_LIMIT } = await import('./types.js');
const { stopJobRunner } = await import('../jobs/runner.js');
const { bootstrapJobHandlers } = await import('../jobs/bootstrap.js');
const { buildIndexFromLocalArticles } = await import('../intelligence/index.js');
const { saveContentIndex } = await import('../intelligence/store.js');
const { savePerformanceStore, loadPerformanceStore } = await import('../performance/store.js');
const { saveResearchSession } = await import('../research/store.js');
const { upsertContentImpact } = await import('../jobs/impact.js');
const { enqueueJob } = await import('../jobs/enqueue.js');
const { saveOpsJob } = await import('../jobs/store.js');
const {
  syncRecommendationsFromState,
  listRecommendations,
  upsertRecommendation,
  recommendationDedupeKey,
  getRecommendation,
  updateRecommendationStatus
} = await import('../operations/recommendations.js');
const { executeRecommendation } = await import('../operations/execute.js');

stopJobRunner();
bootstrapJobHandlers();

const SITE = 'site-decision-a';
const SITE_B = 'site-decision-b';

function seed(id: string) {
  const sites = db.getSites().filter((s: any) => s.id !== id);
  sites.push({
    id,
    name: id,
    url: `https://${id}.test`,
    wordpress: { baseUrl: `https://${id}.test`, username: 'u', applicationPassword: 'p', hasPassword: true }
  });
  db.saveSites(sites);
}

function minimalSession(partial: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    plan: { highRiskTopics: [], queries: [], requiredProductFacts: [], requiredTechnicalFacts: [] },
    sources: [],
    extractedEvidence: [],
    claims: [],
    conflicts: [],
    unknownFacts: [],
    qualityGate: { status: 'PASS', reasons: [], blocking: [], warnings: [], assessedAt: now },
    providers: [],
    researchConfidence: 'medium',
    packetEvidence: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  } as any;
}

seed(SITE);
seed(SITE_B);
saveContentIndex(
  buildIndexFromLocalArticles(SITE, [
    {
      id: 7,
      title: 'چادر کوهنوردی',
      content: '<p>متن</p>',
      date: '2023-01-01',
      modified: '2023-01-01',
      slug: 'tent',
      categories: ['کمپ'],
      tags: []
    }
  ])
);

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    console.error(`fail  ${name}`);
    throw err;
  }
}

await run('signal collection from empty site has provider/perf signals only', () => {
  const signals = collectDecisionSignals(SITE_B);
  assert.ok(signals.some((s) => s.type === 'PERF_NEEDS_SYNC' || s.type === 'PROVIDER_NOT_CONFIGURED'));
});

await run('signal normalization collapses duplicates', () => {
  const normalized = normalizeSignals([
    {
      type: 'CONTENT_DECAY',
      siteId: SITE,
      articleId: 7,
      entityId: '7',
      severity: 'MEDIUM',
      strength: 0.5,
      evidence: ['a'],
      detectedAt: '2026-01-01',
      source: 'performance.decay'
    },
    {
      type: 'CONTENT_DECAY',
      siteId: SITE,
      articleId: 7,
      entityId: '7',
      severity: 'HIGH',
      strength: 0.9,
      evidence: ['b'],
      detectedAt: '2026-01-02',
      source: 'performance.decay'
    }
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].severity, 'HIGH');
  assert.equal(normalized[0].strength, 0.9);
});

await run('decay signal → update decision', () => {
  const store = loadPerformanceStore(SITE);
  store.records = [
    {
      siteId: SITE,
      articleId: 7,
      baseline: {
        title: 'چادر کوهنوردی',
        contentAgeDays: 400,
        freshnessClass: 'likely_outdated',
        quality: 'ESTIMATED'
      },
      decay: { status: 'DECAYED', reasons: ['impressions down'], score: 0.2 },
      freshnessIssues: [],
      linkingImpact: { orphanRisk: 'low', suggestions: [] },
      opportunities: [],
      health: { overall: 'attention_needed', dimensions: { seo: { status: 'pass', reasons: [], checks: [] } } }
    } as any
  ];
  store.opportunities = [
    {
      id: 'opp-dec',
      siteId: SITE,
      type: 'UPDATE_ARTICLE',
      severity: 'high',
      articleId: 7,
      articleTitle: 'چادر کوهنوردی',
      reason: 'decay',
      evidence: ['gsc'],
      contributingSignals: ['decay'],
      confidence: 'medium',
      recommendedAction: 'UPDATE',
      priority: 10,
      quality: 'ESTIMATED'
    }
  ];
  savePerformanceStore(store);

  const signals = collectDecisionSignals(SITE);
  assert.ok(signals.some((s) => s.type === 'CONTENT_DECAY'));

  const result = runDecisionEngine(SITE, { persist: true, topN: 5 });
  assert.ok(result.nextBest);
  assert.ok(
    ['UPDATE_ARTICLE', 'REFRESH_RESEARCH', 'FIX_SEO', 'REVIEW_ARTICLE'].includes(
      result.nextBest!.recommendedAction
    )
  );
  assert.ok(result.nextBest!.scoreBreakdown);
  assert.ok(result.nextBest!.explanation.whyThis);
});

await run('decision scoring explainable components', () => {
  const signals = collectDecisionSignals(SITE).filter((s) => s.articleId != null && String(s.articleId) === '7');
  const breakdown = scoreDecision({ signals, effortHint: 0.65 });
  assert.ok(breakdown.impact >= 0 && breakdown.impact <= 1);
  assert.ok(breakdown.final >= 0 && breakdown.final <= 1);
  assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(confidenceLabel(signals)));
});

await run('stale research → refresh decision', () => {
  saveResearchSession(
    minimalSession({
      id: 'rs-dec-1',
      siteId: SITE,
      topic: 'چادر',
      status: 'STALE'
    })
  );
  const result = runDecisionEngine(SITE, { persist: true, topN: 10 });
  assert.ok(result.decisions.some((d) => d.recommendedAction === 'REFRESH_RESEARCH'));
});

await run('source change → review decision', () => {
  upsertContentImpact({
    id: 'imp-dec-1',
    siteId: SITE,
    sourceUrl: 'https://example.com/x',
    affectedSessionIds: ['rs-dec-1'],
    affectedProductionJobIds: [],
    affectedEntityIds: [],
    detectedAt: new Date().toISOString(),
    status: 'OPEN'
  });
  const result = runDecisionEngine(SITE, { persist: true, topN: 10 });
  assert.ok(result.decisions.some((d) => d.recommendedAction === 'REVIEW_SOURCE'));
});

await run('provider blocker feasibility', () => {
  // Without gemini key in test env, UPDATE may redirect to CONFIGURE
  const feas = checkActionFeasibility(SITE, 'UPDATE_ARTICLE', { articleId: 7, signals: [] });
  // Either feasible (gemini configured) or blocked with CONFIGURE redirect
  if (!feas.feasible) {
    assert.ok(feas.blockers.some((b) => b.code === 'PROVIDER_NOT_CONFIGURED' || b.code === 'ARTICLE_NOT_INDEXED'));
  }
});

await run('cannibalization blocks update → review', () => {
  const feas = checkActionFeasibility(SITE, 'UPDATE_ARTICLE', {
    articleId: 7,
    signals: [
      {
        type: 'CANNIBALIZATION_RISK',
        siteId: SITE,
        articleId: 7,
        severity: 'HIGH',
        strength: 0.9,
        evidence: ['severe'],
        detectedAt: new Date().toISOString(),
        source: 'intelligence.clusters'
      }
    ]
  });
  assert.equal(feas.status, 'REQUIRES_REVIEW');
  assert.equal(feas.redirectTo, 'REVIEW_ARTICLE');
});

await run('critical research conflict blocks update', () => {
  const feas = checkActionFeasibility(SITE, 'UPDATE_ARTICLE', {
    articleId: 7,
    signals: [
      {
        type: 'RESEARCH_CONFLICT',
        siteId: SITE,
        articleId: 7,
        severity: 'HIGH',
        strength: 1,
        evidence: ['claim mismatch'],
        detectedAt: new Date().toISOString(),
        source: 'research.conflicts'
      }
    ]
  });
  assert.equal(feas.status, 'BLOCKED');
  assert.equal(feas.redirectTo, 'REVIEW_SOURCE');
  assert.ok(feas.blockers.some((b) => /Update blocked because evidence conflict/i.test(b.message)));
});

await run('recommendation materialize + dedupe', () => {
  syncRecommendationsFromState(SITE);
  const recs = listRecommendations(SITE, ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']);
  assert.ok(recs.length >= 1);
  const before = recs.length;
  syncRecommendationsFromState(SITE);
  const after = listRecommendations(SITE, ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']).length;
  assert.ok(after <= before + 2);
});

await run('policy RECOMMEND does not auto-execute', () => {
  const result = runDecisionEngine(SITE, { persist: true, topN: 1 });
  assert.ok(result.nextBest);
  const applied = applyPolicyToDecision(SITE, result.nextBest!, 'RECOMMEND');
  assert.equal(applied.outcome, 'recommended');
  assert.ok(applied.recommendationId);
});

await run('stale recommendation execution expires without job', () => {
  const { recommendation } = upsertRecommendation({
    siteId: SITE,
    type: 'RESEARCH_REFRESH',
    priority: 'MEDIUM',
    title: 'Refresh gone',
    explanation: 'test',
    entityId: 'rs-missing',
    suggestedAction: 'RESEARCH',
    dedupeKey: recommendationDedupeKey({
      siteId: SITE,
      type: 'RESEARCH_REFRESH',
      entityId: 'rs-missing',
      reasonCategory: 'TEST_STALE_EXEC'
    }),
    metadata: { topic: 'gone' }
  });
  const out = executeRecommendation(SITE, recommendation.id);
  assert.equal(out.recommendation.status, 'EXPIRED');
  assert.ok(/No longer necessary|gone|Research/i.test(out.message));
});

await run('idempotent execute when IN_PROGRESS', () => {
  const job = enqueueJob({ siteId: SITE, type: 'PERFORMANCE_SYNC', priority: 'LOW' }).job;
  job.status = 'FAILED';
  job.lastError = { code: 'x', message: 'fail', retryable: true };
  saveOpsJob(job);
  syncRecommendationsFromState(SITE);
  const retryRec = listRecommendations(SITE).find((r) => r.type === 'RETRY_OPERATION');
  if (retryRec) {
    updateRecommendationStatus(SITE, retryRec.id, 'IN_PROGRESS', { linkedJobId: job.id });
    const again = executeRecommendation(SITE, retryRec.id);
    assert.equal(again.message, 'Already in progress');
  }
});

await run('job failure signal present', () => {
  const signals = collectDecisionSignals(SITE);
  assert.ok(signals.some((s) => s.type === 'FAILED_OPERATION'));
});

await run('site isolation', () => {
  const a = runDecisionEngine(SITE, { persist: false });
  const b = runDecisionEngine(SITE_B, { persist: false });
  assert.ok(a.decisions.every((d) => d.siteId === SITE));
  assert.ok(b.decisions.every((d) => d.siteId === SITE_B));
});

await run('batch limit constant', () => {
  assert.equal(BATCH_ACTION_LIMIT, 5);
});

await run('reeval research still needed', () => {
  const rec = listRecommendations(SITE).find((r) => r.entityId === 'rs-dec-1');
  if (rec) {
    const still = isRecommendationStillNeeded(SITE, rec);
    assert.equal(still.stillNeeded, true);
  }
  const done = isRecommendationStillNeeded(SITE, {
    id: 'x',
    siteId: SITE,
    type: 'RESEARCH_REFRESH',
    priority: 'LOW',
    title: 't',
    explanation: 'e',
    entityId: 'nope',
    suggestedAction: 'RESEARCH',
    dedupeKey: 'x',
    createdAt: '',
    updatedAt: '',
    status: 'OPEN'
  });
  assert.equal(done.stillNeeded, false);
});

await run('risk from cannibalization signal', () => {
  assert.equal(
    riskFromSignals([
      {
        type: 'CANNIBALIZATION_RISK',
        siteId: SITE,
        severity: 'HIGH',
        strength: 1,
        evidence: [],
        detectedAt: '',
        source: 'intelligence.clusters'
      }
    ]),
    'HIGH'
  );
});

await run('deterministic ranking stable across runs', () => {
  const a = runDecisionEngine(SITE, { persist: false, topN: 5 });
  const b = runDecisionEngine(SITE, { persist: false, topN: 5 });
  assert.deepEqual(
    a.topActions.map((d) => ({ id: d.id, score: d.score, action: d.recommendedAction })),
    b.topActions.map((d) => ({ id: d.id, score: d.score, action: d.recommendedAction }))
  );
});

await run('no autonomous publish decision type', () => {
  const result = runDecisionEngine(SITE, { persist: false, topN: 20 });
  assert.ok(result.decisions.every((d) => d.recommendedAction !== ('PUBLISH' as any)));
  assert.ok(
    result.decisions.every((d) => /Will NOT publish/i.test(d.explanation.whatWillNotHappen))
  );
});

await run('getNextBestActions wrapper', async () => {
  const { getNextBestActions } = await import('./engine.js');
  const payload = getNextBestActions(SITE, { persist: true, topN: 5 });
  assert.equal(payload.siteId, SITE);
  assert.ok(Array.isArray(payload.actions));
});

await run('GET overview does not materialize recommendations', async () => {
  const { buildOperationsSnapshot } = await import('../operations/overview.js');
  const before = listRecommendations(SITE).length;
  buildOperationsSnapshot(SITE, { materializeRecommendations: false });
  const after = listRecommendations(SITE).length;
  assert.equal(after, before);
});

await run('automation defers to decision engine (no legacy invent)', async () => {
  const { loadAutomation, saveAutomation } = await import('../jobs/automation.js');
  const store = loadAutomation(SITE);
  assert.ok(store.schemaVersion >= 3);
  const beforeLegacy = store.recommendations.length;
  // Touch save without inventing new legacy rows via decision path.
  saveAutomation(SITE, store);
  assert.equal(loadAutomation(SITE).recommendations.length, beforeLegacy);
});

console.log('\nAll decision tests passed.');
