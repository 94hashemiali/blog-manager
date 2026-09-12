import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-center-'));
process.env.BLOG_MANAGER_DATA_DIR = tmp;

const { db } = await import('../db.js');
const { collectAttention } = await import('./attention.js');
const {
  recommendationDedupeKey,
  upsertRecommendation,
  syncRecommendationsFromState,
  updateRecommendationStatus,
  listRecommendations
} = await import('./recommendations.js');
const { executeRecommendation } = await import('./execute.js');
const { buildOperationsSnapshot } = await import('./overview.js');
const { buildContentDiff } = await import('./diff.js');
const { assessClaimRisk } = await import('./claimRisk.js');
const { classifyResearchFreshness } = await import('./researchFreshness.js');
const { buildArticleHealthViews, buildContentHealthSummary } = await import('./health.js');
const { enqueueJob } = await import('../jobs/enqueue.js');
const { stopJobRunner } = await import('../jobs/runner.js');
const { saveOpsJob } = await import('../jobs/store.js');
const { emitDomainEvent } = await import('../jobs/events.js');
const {
  applyAutomationForEvent,
  updateAutomationSettings,
  upsertAutomationRule,
  loadAutomation,
  saveAutomation
} = await import('../jobs/automation.js');
const { runDueSchedules, upsertSchedule } = await import('../jobs/scheduler.js');
const { upsertContentImpact, listContentImpacts } = await import('../jobs/impact.js');
const { saveResearchSession } = await import('../research/store.js');
const { loadPerformanceStore, savePerformanceStore } = await import('../performance/store.js');
const { buildIndexFromLocalArticles } = await import('../intelligence/index.js');
const { saveContentIndex } = await import('../intelligence/store.js');
const { bootstrapJobHandlers } = await import('../jobs/bootstrap.js');

stopJobRunner();
bootstrapJobHandlers();

const SITE = 'site-ops-center-a';
const SITE_B = 'site-ops-center-b';

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
      id: 42,
      title: 'چادر ۴ فصل',
      content: '<p>متن قدیمی</p><h2>وزن</h2><p>۲ کیلو</p>',
      date: '2024-01-01',
      modified: '2024-01-01',
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

await run('attention severity from failed job', () => {
  const job = enqueueJob({
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    priority: 'LOW'
  }).job;
  job.status = 'FAILED';
  job.lastError = { code: 'x', message: 'boom', retryable: true };
  saveOpsJob(job);
  const items = collectAttention(SITE);
  const hit = items.find((i) => i.jobId === job.id);
  assert.ok(hit);
  assert.equal(hit!.severity, 'HIGH');
  assert.equal(hit!.type, 'JOB_FAILED');
});

await run('attention recovery is CRITICAL', () => {
  const job = enqueueJob({
    siteId: SITE,
    type: 'PUBLISH',
    priority: 'HIGH'
  }).job;
  job.status = 'RECOVERY_REQUIRED';
  saveOpsJob(job);
  const hit = collectAttention(SITE).find((i) => i.jobId === job.id);
  assert.equal(hit?.severity, 'CRITICAL');
});

await run('recommendation deduplication', () => {
  const key = recommendationDedupeKey({
    siteId: SITE,
    type: 'UPDATE_ARTICLE',
    entityId: '42',
    reasonCategory: 'UPDATE_ARTICLE'
  });
  const a = upsertRecommendation({
    siteId: SITE,
    type: 'UPDATE_ARTICLE',
    priority: 'HIGH',
    title: 'Update 42',
    explanation: 'decay',
    entityId: '42',
    articleId: 42,
    suggestedAction: 'UPDATE',
    dedupeKey: key
  });
  const b = upsertRecommendation({
    siteId: SITE,
    type: 'UPDATE_ARTICLE',
    priority: 'HIGH',
    title: 'Update 42 again',
    explanation: 'decay2',
    entityId: '42',
    articleId: 42,
    suggestedAction: 'UPDATE',
    dedupeKey: key
  });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.recommendation.id, b.recommendation.id);
});

await run('source change → impact → recommendation', () => {
  saveResearchSession(
    minimalSession({
      id: 'rs-impact-1',
      siteId: SITE,
      topic: 'چادر',
      status: 'STALE',
      sources: [
        {
          id: 's1',
          url: 'https://example.com/src',
          title: 'src',
          freshness: 'STALE',
          status: 'ok'
        }
      ]
    })
  );

  upsertContentImpact({
    id: 'imp-1',
    siteId: SITE,
    sourceUrl: 'https://example.com/src',
    affectedSessionIds: ['rs-impact-1'],
    affectedProductionJobIds: ['prod-1'],
    affectedEntityIds: [],
    detectedAt: new Date().toISOString(),
    status: 'OPEN',
    note: 'hash changed'
  });

  syncRecommendationsFromState(SITE);
  assert.ok(listRecommendations(SITE).some((r) => r.type === 'REVIEW_SOURCE'));
  assert.ok(listContentImpacts(SITE).some((i) => i.id === 'imp-1'));
});

await run('stale research → refresh recommendation', () => {
  saveResearchSession(
    minimalSession({
      id: 'rs-stale-2',
      siteId: SITE,
      topic: 'کیسه خواب',
      status: 'STALE'
    })
  );
  syncRecommendationsFromState(SITE);
  const rec = listRecommendations(SITE).find((r) => r.entityId === 'rs-stale-2');
  assert.equal(rec?.type, 'RESEARCH_REFRESH');
});

await run('performance opportunity → recommendation', () => {
  const store = loadPerformanceStore(SITE);
  store.opportunities = [
    {
      id: 'opp-1',
      siteId: SITE,
      type: 'UPDATE_ARTICLE',
      severity: 'high',
      articleId: 42,
      articleTitle: 'چادر ۴ فصل',
      reason: 'impressions declining',
      evidence: ['gsc'],
      contributingSignals: ['decay'],
      confidence: 'medium',
      recommendedAction: 'UPDATE',
      priority: 10,
      quality: 'ESTIMATED'
    }
  ];
  store.lastSyncedAt = new Date().toISOString();
  savePerformanceStore(store);
  syncRecommendationsFromState(SITE);
  const rec = listRecommendations(SITE).find(
    (r) => r.type === 'UPDATE_ARTICLE' && String(r.articleId) === '42'
  );
  assert.ok(rec);
});

await run('recommendation lifecycle + execute update context', () => {
  const { recommendation } = upsertRecommendation({
    siteId: SITE,
    type: 'UPDATE_ARTICLE',
    priority: 'HIGH',
    title: 'Update tent',
    explanation: 'decay + source',
    entityId: '42',
    articleId: 42,
    suggestedAction: 'UPDATE',
    dedupeKey: recommendationDedupeKey({
      siteId: SITE,
      type: 'UPDATE_ARTICLE',
      entityId: '42-exec',
      reasonCategory: 'TEST_EXEC'
    }),
    metadata: { contributingSignals: ['decay'] }
  });
  updateRecommendationStatus(SITE, recommendation.id, 'ACKNOWLEDGED');
  const result = executeRecommendation(SITE, recommendation.id);
  assert.ok(result.productionJobId);
  assert.ok(result.opsJobId);
  assert.equal(result.recommendation.status, 'IN_PROGRESS');
  assert.equal(result.recommendation.linkedProductionJobId, result.productionJobId);
});

await run('claim risk deterministic', () => {
  const high = assessClaimRisk({
    claim: {
      id: 'c1',
      siteId: SITE,
      text: 'safe below -20',
      type: 'SAFETY',
      status: 'UNSUPPORTED',
      evidenceIds: [],
      sourceIds: [],
      confidence: 'low',
      reason: 'none',
      highRisk: true
    } as any
  });
  assert.ok(high.level === 'HIGH' || high.level === 'CRITICAL');

  const low = assessClaimRisk({
    claim: {
      id: 'c2',
      siteId: SITE,
      text: 'nice view',
      type: 'GENERAL',
      status: 'SUPPORTED',
      evidenceIds: ['e1'],
      sourceIds: ['s1'],
      confidence: 'high',
      reason: 'ok',
      highRisk: false
    } as any
  });
  assert.equal(low.level, 'LOW');
});

await run('research freshness classes', () => {
  const now = Date.now();
  assert.equal(
    classifyResearchFreshness(
      minimalSession({
        id: 'f',
        siteId: SITE,
        topic: 't',
        status: 'READY',
        updatedAt: new Date(now).toISOString()
      })
    ).class,
    'FRESH'
  );
  assert.equal(
    classifyResearchFreshness(
      minimalSession({
        id: 's',
        siteId: SITE,
        topic: 't',
        status: 'STALE',
        updatedAt: new Date(now).toISOString()
      })
    ).class,
    'STALE'
  );
  assert.equal(
    classifyResearchFreshness(
      minimalSession({
        id: 'a',
        siteId: SITE,
        topic: 't',
        status: 'READY',
        updatedAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString()
      }),
      now
    ).class,
    'AGING'
  );
});

await run('content diff deterministic', () => {
  const diff = buildContentDiff({
    beforeTitle: 'A',
    afterTitle: 'B',
    beforeContent: '<h2>Old</h2><p>one</p>',
    afterContent: '<h2>New</h2><p>one</p><p>two</p>'
  });
  assert.equal(diff.titleChanged, true);
  assert.ok(diff.sections.some((s) => s.change !== 'unchanged'));
});

await run('operations overview assembles stores', () => {
  const snap = buildOperationsSnapshot(SITE);
  assert.equal(snap.siteId, SITE);
  assert.ok(Array.isArray(snap.attention));
  assert.ok(Array.isArray(snap.recommendations));
  assert.ok(snap.health.providers);
});

await run('site isolation', () => {
  const a = collectAttention(SITE);
  const b = collectAttention(SITE_B);
  assert.ok(a.every((i) => i.siteId === SITE));
  assert.ok(b.every((i) => i.siteId === SITE_B));
});

await run('automation loop protection', () => {
  updateAutomationSettings(SITE, {
    monitoringEnabled: true,
    policy: 'RECOMMEND',
    maxActionsPerHour: 50
  });
  upsertAutomationRule({
    siteId: SITE,
    enabled: true,
    trigger: 'SOURCE_CHANGED',
    action: 'RECORD_RECOMMENDATION',
    label: 'Source changed rule'
  });
  const event = emitDomainEvent({
    type: 'SOURCE_CHANGED',
    siteId: SITE,
    entityId: 'src-1',
    metadata: { topic: 'چادر' }
  });
  const first = applyAutomationForEvent(event);
  const second = applyAutomationForEvent(event);
  assert.ok(first.length >= 1);
  assert.equal(second.length, 0);
});

await run('automation rate limit', () => {
  updateAutomationSettings(SITE, {
    monitoringEnabled: true,
    policy: 'RECOMMEND',
    maxActionsPerHour: 1
  });
  const store = loadAutomation(SITE);
  store.actionLog = [
    {
      at: new Date().toISOString(),
      ruleId: 'r',
      eventId: 'e0',
      action: 'RECORD_RECOMMENDATION'
    }
  ];
  saveAutomation(SITE, store);

  upsertAutomationRule({
    id: 'rule-rate',
    siteId: SITE,
    enabled: true,
    trigger: 'PERFORMANCE_SYNCED',
    action: 'CREATE_PERFORMANCE_SYNC',
    label: 'perf'
  });
  const event = emitDomainEvent({
    type: 'PERFORMANCE_SYNCED',
    siteId: SITE
  });
  const results = applyAutomationForEvent(event);
  assert.ok(results.some((r) => r.action === 'AUTOMATION_RATE_LIMITED'));
});

await run('automation never publishes', () => {
  updateAutomationSettings(SITE, {
    monitoringEnabled: true,
    automaticPublishing: true as any,
    policy: 'AUTO_UPDATE_DRAFT'
  });
  assert.equal(loadAutomation(SITE).settings.automaticPublishing, false);
});

await run('research refresh schedule batches max 5', () => {
  for (let i = 0; i < 8; i++) {
    saveResearchSession(
      minimalSession({
        id: `rs-batch-${i}`,
        siteId: SITE,
        topic: `topic-${i}`,
        status: 'STALE'
      })
    );
  }
  upsertSchedule({
    id: `${SITE}-RESEARCH_REFRESH`,
    siteId: SITE,
    type: 'RESEARCH_REFRESH',
    enabled: true,
    interval: 'daily',
    nextRunAt: new Date(Date.now() - 1000).toISOString()
  });
  const created = runDueSchedules();
  const researchJobs = created.filter((c) => c.scheduleId.includes('RESEARCH_REFRESH'));
  assert.ok(researchJobs.length <= 5);
  assert.ok(researchJobs.length >= 1);
});

await run('content health insufficient without data on empty site', () => {
  const summary = buildContentHealthSummary(SITE_B);
  assert.equal(summary.status, 'insufficient_data');
  assert.equal(buildArticleHealthViews(SITE_B).length, 0);
});

await run('provider health from snapshot is structured', () => {
  const snap = buildOperationsSnapshot(SITE);
  assert.ok(typeof snap.health.providers === 'object');
  for (const row of Object.values(snap.health.providers)) {
    assert.ok('status' in row);
    assert.ok('configured' in row);
  }
});

console.log('\nAll operations tests passed.');
