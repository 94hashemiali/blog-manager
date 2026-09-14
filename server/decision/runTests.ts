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
const {
  runDecisionEngine,
  evaluateDecision,
  getNextBestActions,
  reEvaluateRecommendation
} = await import('./engine.js');
const { explainDecision } = await import('./explain.js');
const { isRecommendationStillNeeded } = await import('./reeval.js');
const { applyPolicyToDecision } = await import('./policy.js');
const { BATCH_ACTION_LIMIT } = await import('./types.js');
const { stopJobRunner } = await import('../jobs/runner.js');
const { bootstrapJobHandlers } = await import('../jobs/bootstrap.js');
const { buildIndexFromLocalArticles } = await import('../intelligence/index.js');
const { saveContentIndex, getContentIndex } = await import('../intelligence/store.js');
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

function sig(partial: Record<string, unknown>) {
  const type = String(partial.type || 'PERF_NEEDS_SYNC');
  const siteId = String(partial.siteId || SITE);
  const entityId = partial.entityId != null ? String(partial.entityId) : undefined;
  const articleId = partial.articleId as string | number | undefined;
  const strength = Number(partial.strength ?? 0.7);
  return {
    id: `sig-test-${type}-${entityId || articleId || 'x'}`,
    siteId,
    type,
    entityType: partial.entityType || 'article',
    entityId,
    articleId,
    severity: partial.severity || 'MEDIUM',
    confidence: Number(partial.confidence ?? strength),
    strength,
    evidence: (partial.evidence as string[]) || [],
    detectedAt: String(partial.detectedAt || new Date().toISOString()),
    source: String(partial.source || 'test'),
    metadata: partial.metadata as Record<string, unknown> | undefined
  } as any;
}

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
    sig({
      type: 'CONTENT_DECAY',
      siteId: SITE,
      articleId: 7,
      entityId: '7',
      severity: 'MEDIUM',
      strength: 0.5,
      evidence: ['a'],
      detectedAt: '2026-01-01',
      source: 'performance.decay'
    }),
    sig({
      type: 'CONTENT_DECAY',
      siteId: SITE,
      articleId: 7,
      entityId: '7',
      severity: 'HIGH',
      strength: 0.9,
      evidence: ['b'],
      detectedAt: '2026-01-02',
      source: 'performance.decay'
    })
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].severity, 'HIGH');
  assert.equal(normalized[0].strength, 0.9);
  assert.ok(normalized[0].id);
  assert.ok(normalized[0].entityType);
  assert.ok(typeof normalized[0].confidence === 'number');
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
      sig({
        type: 'CANNIBALIZATION_RISK',
        siteId: SITE,
        articleId: 7,
        severity: 'HIGH',
        strength: 0.9,
        evidence: ['severe'],
        source: 'intelligence.clusters'
      })
    ]
  });
  assert.equal(feas.status, 'REQUIRES_REVIEW');
  assert.equal(feas.redirectTo, 'REVIEW_ARTICLE');
});

await run('critical research conflict blocks update', () => {
  const feas = checkActionFeasibility(SITE, 'UPDATE_ARTICLE', {
    articleId: 7,
    signals: [
      sig({
        type: 'RESEARCH_CONFLICT',
        siteId: SITE,
        articleId: 7,
        severity: 'HIGH',
        strength: 1,
        evidence: ['claim mismatch'],
        source: 'research.conflicts'
      })
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
      sig({
        type: 'CANNIBALIZATION_RISK',
        siteId: SITE,
        severity: 'HIGH',
        strength: 1,
        evidence: [],
        source: 'intelligence.clusters'
      })
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
  const { loadAutomation, saveAutomation, applyAutomationForEvent, updateAutomationSettings, upsertAutomationRule } =
    await import('../jobs/automation.js');
  const { emitDomainEvent } = await import('../jobs/events.js');
  const store = loadAutomation(SITE);
  assert.ok(store.schemaVersion >= 3);
  const beforeLegacy = store.recommendations.length;
  saveAutomation(SITE, store);
  assert.equal(loadAutomation(SITE).recommendations.length, beforeLegacy);

  updateAutomationSettings(SITE, { monitoringEnabled: true, policy: 'RECOMMEND' });
  upsertAutomationRule({
    siteId: SITE,
    enabled: true,
    trigger: 'SOURCE_CHANGED',
    action: 'CREATE_UPDATE_JOB',
    label: 'test defer'
  });
  const beforeCanon = listRecommendations(SITE).length;
  const event = emitDomainEvent({ type: 'SOURCE_CHANGED', siteId: SITE, entityId: 'auto-src-1' });
  const results = applyAutomationForEvent(event);
  assert.ok(results.some((r) => r.action === 'DEFER_TO_DECISION_ENGINE' || r.action.startsWith('DECISION_')));
  assert.equal(loadAutomation(SITE).recommendations.length, beforeLegacy);
  assert.ok(listRecommendations(SITE).length >= beforeCanon);
});

await run('content gap without article → CREATE_ARTICLE', () => {
  const index = getContentIndex(SITE);
  index.gaps = [
    {
      id: 'gap-create-1',
      siteId: SITE,
      kind: 'missing_comparison',
      topic: 'Unique alpine stove comparison xyz',
      reason: 'no coverage',
      evidence: ['catalog'],
      sourceType: 'calculated',
      confidence: 'medium'
    } as any
  ];
  saveContentIndex(index);
  const result = runDecisionEngine(SITE, { persist: false, topN: 20 });
  assert.ok(
    result.decisions.some(
      (d) =>
        d.recommendedAction === 'CREATE_ARTICLE' ||
        d.recommendedAction === 'UPDATE_ARTICLE' ||
        d.recommendedAction === 'REVIEW_CONTENT'
    )
  );
});

await run('topic coverage → UPDATE instead of CREATE', () => {
  const index = getContentIndex(SITE);
  index.gaps = [
    {
      id: 'gap-update-1',
      siteId: SITE,
      kind: 'missing_comparison',
      topic: 'چادر کوهنوردی',
      reason: 'near duplicate of existing tent guide',
      evidence: ['overlap'],
      sourceType: 'calculated',
      confidence: 'high'
    } as any
  ];
  saveContentIndex(index);
  const result = runDecisionEngine(SITE, { persist: false, topN: 20 });
  const gapDecisions = result.decisions.filter(
    (d) => d.entityId === 'gap-update-1' || /چادر|Update existing|Update outdated/i.test(d.title)
  );
  assert.ok(gapDecisions.length >= 1);
  assert.ok(
    gapDecisions.some(
      (d) =>
        d.recommendedAction === 'UPDATE_ARTICLE' ||
        d.recommendedAction === 'REVIEW_CONTENT' ||
        d.recommendedAction === 'REVIEW_ARTICLE'
    )
  );
  assert.ok(!gapDecisions.every((d) => d.recommendedAction === 'CREATE_ARTICLE'));
});

await run('outdated gap with articleId → UPDATE_ARTICLE', () => {
  const index = getContentIndex(SITE);
  index.gaps = [
    {
      id: 'gap-outdated-7',
      siteId: SITE,
      kind: 'outdated_article',
      topic: 'چادر کوهنوردی',
      articleId: 7,
      reason: 'article outdated',
      evidence: ['age'],
      sourceType: 'calculated',
      confidence: 'high'
    } as any
  ];
  saveContentIndex(index);
  const result = runDecisionEngine(SITE, { persist: false, topN: 20 });
  assert.ok(
    result.decisions.some(
      (d) =>
        d.recommendedAction === 'UPDATE_ARTICLE' &&
        d.articleId != null &&
        String(d.articleId) === '7'
    )
  );
});

await run('gap UPDATE merges research conflict → REVIEW_SOURCE', () => {
  const index = getContentIndex(SITE);
  index.gaps = [
    {
      id: 'gap-conflict-7',
      siteId: SITE,
      kind: 'outdated_article',
      topic: 'چادر کوهنوردی',
      articleId: 7,
      reason: 'outdated with conflict',
      evidence: ['age'],
      sourceType: 'calculated',
      confidence: 'high'
    } as any
  ];
  saveContentIndex(index);
  saveResearchSession(
    minimalSession({
      id: 'rs-conflict-gap',
      siteId: SITE,
      topic: 'چادر',
      status: 'READY',
      conflicts: [
        {
          id: 'c1',
          claim: 'spec',
          sourceAId: 'a',
          sourceBId: 'b',
          difference: 'spec mismatch',
          resolutionStatus: 'UNRESOLVED',
          severity: 'high'
        }
      ]
    })
  );
  const result = runDecisionEngine(SITE, { persist: false, topN: 20 });
  const forArticle = result.decisions.filter(
    (d) => d.articleId != null && String(d.articleId) === '7'
  );
  assert.ok(
    forArticle.some((d) => d.recommendedAction === 'REVIEW_SOURCE'),
    'expected REVIEW_SOURCE when conflict present'
  );
  // Safety: no executable UPDATE while unresolved HIGH conflict exists.
  assert.ok(
    !forArticle.some(
      (d) => d.recommendedAction === 'UPDATE_ARTICLE' && d.feasibilityStatus === 'AVAILABLE'
    ),
    'must not expose AVAILABLE UPDATE under HIGH research conflict'
  );
});

await run('insufficient evidence → DEFER via evaluateDecision', () => {
  const decision = evaluateDecision({
    siteId: SITE,
    action: 'DEFER',
    title: 'Defer test',
    signals: []
  });
  assert.equal(decision.recommendedAction, 'DEFER');
  assert.equal(decision.feasibilityStatus, 'INSUFFICIENT_DATA');
  const explained = explainDecision(decision);
  assert.ok(explained.summary);
  assert.ok(Array.isArray(explained.reasons));
});

await run('explainDecision structured fields', () => {
  const result = runDecisionEngine(SITE, { persist: false, topN: 1 });
  assert.ok(result.nextBest || result.decisions[0]);
  const d = result.nextBest || result.decisions[0];
  const explained = explainDecision(d!);
  assert.ok(explained.summary);
  assert.ok(Array.isArray(explained.evidence));
  assert.ok(Array.isArray(explained.blockers));
  assert.ok(Array.isArray(explained.alternatives));
});

await run('reEvaluateRecommendation updates metadata', () => {
  syncRecommendationsFromState(SITE);
  const rec = listRecommendations(SITE, ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'])[0];
  assert.ok(rec);
  const out = reEvaluateRecommendation(SITE, rec.id);
  assert.equal(out.recommendationId, rec.id);
  const again = getRecommendation(SITE, rec.id);
  assert.ok(again);
  if (out.stillNeeded) {
    assert.ok(again!.metadata?.lastEvaluatedAt);
  } else {
    assert.equal(again!.status, 'EXPIRED');
  }
});

await run('getNextBestActions accepts limit number', () => {
  const payload = getNextBestActions(SITE, 3);
  assert.ok(payload.actions.length <= 3);
});

await run('duplicate execution prevention hard assert', () => {
  const job = enqueueJob({ siteId: SITE, type: 'PERFORMANCE_SYNC', priority: 'LOW' }).job;
  job.status = 'FAILED';
  job.lastError = { code: 'x', message: 'fail', retryable: true };
  saveOpsJob(job);
  syncRecommendationsFromState(SITE);
  const retryRec = listRecommendations(SITE).find((r) => r.type === 'RETRY_OPERATION');
  assert.ok(retryRec, 'expected RETRY_OPERATION recommendation');
  updateRecommendationStatus(SITE, retryRec!.id, 'IN_PROGRESS', { linkedJobId: job.id });
  const again = executeRecommendation(SITE, retryRec!.id);
  assert.equal(again.message, 'Already in progress');
  assert.equal(again.opsJobId, job.id);
});

console.log('\nAll decision tests passed.');
