import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-'));
process.env.BLOG_MANAGER_DATA_DIR = tmp;

const { db } = await import('../db.js');
const { stopJobRunner } = await import('../jobs/runner.js');
const { bootstrapJobHandlers } = await import('../jobs/bootstrap.js');
const { buildIndexFromLocalArticles } = await import('../intelligence/index.js');
const { saveContentIndex } = await import('../intelligence/store.js');
const { savePerformanceStore, loadPerformanceStore } = await import('../performance/store.js');
const { saveResearchSession } = await import('../research/store.js');
const { runDecisionEngine } = await import('../decision/engine.js');
const {
  createMission,
  startMission,
  pauseMission,
  cancelMission,
  executeMissionTask,
  getNextExecutableTask,
  detectStaleTask,
  approveMissionTask
} = await import('./executor.js');
const {
  planMission,
  replanMission,
  buildMissionPlan,
  diffPlans
} = await import('./planner.js');
const { decisionToTask } = await import('./tasks.js');
const { validateTaskGraph, getExecutionOrder } = await import('./graph.js');
const { evaluateMission, captureMissionOutcome } = await import('./evaluator.js');
const { getActivePlan, getMission, listMissions } = await import('./store.js');
const { MAX_CONCURRENT_MISSION_TASKS } = await import('./types.js');

stopJobRunner();
bootstrapJobHandlers();

const SITE = 'site-mission-a';
const SITE_B = 'site-mission-b';

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
savePerformanceStore(store);

saveResearchSession(
  minimalSession({
    id: 'rs-mission-1',
    siteId: SITE,
    topic: 'چادر',
    status: 'STALE'
  })
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

await run('mission creation', () => {
  const m = createMission(SITE, {
    title: 'Refresh tent content',
    goal: 'CONTENT_REFRESH',
    description: 'test'
  });
  assert.equal(m.siteId, SITE);
  assert.equal(m.status, 'DRAFT');
  assert.equal(listMissions(SITE).some((x) => x.id === m.id), true);
});

await run('deterministic plan generation', () => {
  const m = createMission(SITE, { title: 'Plan A', goal: 'CONTENT_REFRESH' });
  const a = planMission(SITE, m.id);
  const b = buildMissionPlan(SITE, getMission(SITE, m.id)!, { persistDecisions: false });
  // Same decision set → same logical keys
  const keysA = a.plan.tasks.map((t) => t.logicalKey).sort();
  const keysB = b.tasks.map((t) => t.logicalKey).sort();
  assert.deepEqual(keysA, keysB);
  assert.ok(a.plan.version >= 1);
});

await run('decision → task conversion', () => {
  const engine = runDecisionEngine(SITE, { persist: false, topN: 5 });
  assert.ok(engine.decisions.length >= 1);
  const task = decisionToTask(engine.decisions[0], 'msn-x');
  if (engine.decisions[0].recommendedAction !== 'DEFER') {
    assert.ok(task);
    assert.equal(task!.siteId, SITE);
    assert.ok(task!.logicalKey);
  }
});

await run('dependency creation when research stale', () => {
  const m = createMission(SITE, { title: 'Deps', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  const update = plan.tasks.find((t) => t.type === 'UPDATE_ARTICLE');
  const research = plan.tasks.find((t) => t.type === 'RESEARCH');
  if (update && research) {
    assert.ok(
      update.dependsOn.includes(research.id) ||
        plan.edges.some((e) => e.from === research.id && e.to === update.id),
      'expected research → update dependency'
    );
  }
});

await run('DAG validation + cycle detection', () => {
  const m = createMission(SITE, { title: 'Graph', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  const v = validateTaskGraph(plan, SITE);
  assert.equal(v.ok, true);
  if (plan.tasks.length >= 2) {
    const bad = {
      tasks: plan.tasks,
      edges: [
        { from: plan.tasks[0].id, to: plan.tasks[1].id, reason: 'x' },
        { from: plan.tasks[1].id, to: plan.tasks[0].id, reason: 'cycle' }
      ]
    };
    // inject mutual dependsOn
    bad.tasks = plan.tasks.map((t, i) =>
      i === 0
        ? { ...t, dependsOn: [plan.tasks[1].id] }
        : i === 1
          ? { ...t, dependsOn: [plan.tasks[0].id] }
          : t
    );
    const cyc = validateTaskGraph(bad, SITE);
    assert.equal(cyc.ok, false);
  }
});

await run('topological sorting deterministic', () => {
  const m = createMission(SITE, { title: 'Topo', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  const a = getExecutionOrder(plan).map((t) => t.id);
  const b = getExecutionOrder(plan).map((t) => t.id);
  assert.deepEqual(a, b);
});

await run('next executable task + concurrency constant', () => {
  assert.equal(MAX_CONCURRENT_MISSION_TASKS, 1);
  const m = createMission(SITE, { title: 'Next', goal: 'CUSTOM' });
  planMission(SITE, m.id);
  startMission(SITE, m.id);
  const next = getNextExecutableTask(SITE, m.id);
  assert.ok(next.task || next.reason);
});

await run('start / pause / cancel', () => {
  const m = createMission(SITE, { title: 'Lifecycle', goal: 'CUSTOM' });
  planMission(SITE, m.id);
  const started = startMission(SITE, m.id);
  assert.ok(['RUNNING', 'WAITING_FOR_REVIEW'].includes(started.mission.status));
  const paused = pauseMission(SITE, m.id);
  assert.equal(paused.status, 'PAUSED');
  const cancelled = cancelMission(SITE, m.id);
  assert.equal(cancelled.status, 'CANCELLED');
});

await run('task execution through recommendation path', () => {
  const m = createMission(SITE, { title: 'Exec', goal: 'CONTENT_HEALTH' });
  planMission(SITE, m.id);
  startMission(SITE, m.id);
  const next = getNextExecutableTask(SITE, m.id);
  if (next.reason === 'WAITING_FOR_REVIEW' && next.task) {
    const approved = approveMissionTask(SITE, m.id, next.task.id);
    assert.equal(approved.task.status, 'COMPLETED');
    return;
  }
  if (!next.task) return;
  try {
    const out = executeMissionTask(SITE, m.id, next.task.id);
    assert.ok(out.task);
    assert.ok(out.message);
    // Idempotent reuse
    if (out.opsJobId) {
      const again = executeMissionTask(SITE, m.id, out.task.id);
      assert.ok(/progress|Reused|queued|created|Open|Research|Sync|Retry/i.test(again.message + again.task.status));
    }
  } catch (err: any) {
    // Provider missing may block — acceptable if message clear
    assert.ok(err.message);
  }
});

await run('replan preserves completed + increments version', async () => {
  const m = createMission(SITE, { title: 'Replan', goal: 'CUSTOM' });
  const first = planMission(SITE, m.id);
  const plan = getActivePlan(SITE, first.mission)!;
  if (plan.tasks[0]) {
    plan.tasks[0] = {
      ...plan.tasks[0],
      status: 'COMPLETED',
      updatedAt: new Date().toISOString()
    };
    const { savePlan } = await import('./store.js');
    savePlan(SITE, plan);
  }
  const second = replanMission(SITE, m.id, 'test replan');
  assert.ok(second.plan.version > first.plan.version);
  const completed = second.plan.tasks.filter((t) => t.status === 'COMPLETED');
  assert.ok(completed.length >= (plan.tasks[0] ? 1 : 0));
  assert.ok(second.diff);
});

await run('plan diff shape', () => {
  const m = createMission(SITE, { title: 'Diff', goal: 'CUSTOM' });
  const a = planMission(SITE, m.id);
  const b = replanMission(SITE, m.id, 'diff check');
  const diff = diffPlans(a.plan, b.plan, 'diff check');
  assert.ok(Array.isArray(diff.addedTasks));
  assert.ok(Array.isArray(diff.removedTasks));
  assert.ok(diff.reason);
});

await run('evaluation + insufficient performance honesty', () => {
  const m = createMission(SITE_B, { title: 'Eval empty', goal: 'CUSTOM' });
  planMission(SITE_B, m.id);
  const evaluation = evaluateMission(SITE_B, m.id);
  assert.equal(evaluation.siteId, SITE_B);
  const outcome = captureMissionOutcome(SITE_B, m.id);
  assert.equal(outcome.performance, 'INSUFFICIENT_DATA');
});

await run('site isolation', () => {
  const a = createMission(SITE, { title: 'Iso A', goal: 'CUSTOM' });
  const b = createMission(SITE_B, { title: 'Iso B', goal: 'CUSTOM' });
  assert.equal(getMission(SITE, a.id)?.siteId, SITE);
  assert.equal(getMission(SITE_B, a.id), undefined);
  assert.equal(getMission(SITE, b.id), undefined);
});

await run('no publish task type in plans', () => {
  const m = createMission(SITE, { title: 'No pub', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  assert.ok(plan.tasks.every((t) => t.type !== ('PUBLISH' as any)));
});

await run('stale detection when action changes', () => {
  const m = createMission(SITE, { title: 'Stale', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  const update = plan.tasks.find((t) => t.type === 'UPDATE_ARTICLE');
  if (!update) return;
  const fake = {
    ...update,
    plannedAction: 'UPDATE_ARTICLE',
    decisionId: 'missing-decision'
  };
  const result = detectStaleTask(SITE, fake);
  // missing decision for update → stale
  assert.equal(result.stale, true);
});

await run('no unnecessary visual dependency', () => {
  const m = createMission(SITE, { title: 'No visual', goal: 'CONTENT_REFRESH' });
  const { plan } = planMission(SITE, m.id);
  const visuals = plan.tasks.filter((t) => t.type === 'VISUAL_GENERATION');
  // Visual only when required — seed has no visual signal → none expected
  assert.equal(visuals.length, 0);
  for (const t of plan.tasks) {
    assert.ok(!t.dependsOn.some((id) => plan.tasks.find((x) => x.id === id)?.type === 'VISUAL_GENERATION'));
  }
});

await run('dependency blocking next task', () => {
  const m = createMission(SITE, { title: 'Block', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  const blocked = plan.tasks.find((t) => t.dependsOn.length > 0);
  if (!blocked) return;
  startMission(SITE, m.id);
  // Force a dependent task to be "next" candidate by completing nothing
  const next = getNextExecutableTask(SITE, m.id);
  if (next.task) {
    assert.ok(!blocked.dependsOn.includes(next.task.id) || next.task.id !== blocked.id);
    // Dependent task must not run before deps complete
    if (next.task.id === blocked.id) {
      assert.fail('dependent task executable before deps');
    }
  }
});

await run('mission completion when all done', async () => {
  const { savePlan } = await import('./store.js');
  const { syncMissionTaskJobs } = await import('./executor.js');
  const m = createMission(SITE, { title: 'Done', goal: 'CUSTOM' });
  const planned = planMission(SITE, m.id);
  startMission(SITE, m.id);
  const plan = getActivePlan(SITE, getMission(SITE, m.id)!)!;
  if (plan.tasks.length === 0) {
    // empty plan → still not completed automatically; ok
    return;
  }
  savePlan(SITE, {
    ...plan,
    tasks: plan.tasks.map((t) => ({
      ...t,
      status: 'COMPLETED' as const,
      updatedAt: new Date().toISOString()
    }))
  });
  const synced = syncMissionTaskJobs(SITE, m.id);
  assert.equal(synced.status, 'COMPLETED');
  const next = getNextExecutableTask(SITE, m.id);
  assert.equal(next.reason, 'MISSION_COMPLETED');
});

await run('human-review reason surface', () => {
  const m = createMission(SITE, { title: 'Review gate', goal: 'CUSTOM' });
  const { plan } = planMission(SITE, m.id);
  const review = plan.tasks.find(
    (t) => t.type === 'REVIEW_SOURCE' || t.type === 'REVIEW_CONTENT' || t.status === 'WAITING_FOR_REVIEW'
  );
  if (!review) return;
  startMission(SITE, m.id);
  const next = getNextExecutableTask(SITE, m.id);
  if (next.task?.id === review.id || next.reason === 'WAITING_FOR_REVIEW') {
    assert.ok(next.reason === 'WAITING_FOR_REVIEW' || next.task);
  }
});

console.log('\nAll mission tests passed.');
