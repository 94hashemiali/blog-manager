import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-jobs-'));
process.env.BLOG_MANAGER_DATA_DIR = tmp;

const { db } = await import('../db.js');
const { bootstrapJobHandlers } = await import('./bootstrap.js');
const { enqueueJob } = await import('./enqueue.js');
const { executeJob, requestCancelOpsJob, resumeOpsJob, stopJobRunner } = await import('./runner.js');
const { getOpsJob, listOpsJobs } = await import('./store.js');
const { recoverStaleOpsJobs } = await import('./recovery.js');
const { pickNextQueuedJob } = await import('./queue.js');
const { runDueSchedules, upsertSchedule } = await import('./scheduler.js');
const { emitDomainEvent } = await import('./events.js');
const {
  applyAutomationForEvent,
  updateAutomationSettings,
  upsertAutomationRule
} = await import('./automation.js');
const { sanitizeJobPayload, toJobError } = await import('./errors.js');
const { buildIndexFromLocalArticles } = await import('../intelligence/index.js');
const { saveContentIndex } = await import('../intelligence/store.js');
const { OPS_JOB_SCHEMA_VERSION } = await import('./types.js');

stopJobRunner();
bootstrapJobHandlers();

const SITE = 'site-ops-a';
const SITE_B = 'site-ops-b';

function seed(id: string, name: string) {
  const sites = db.getSites().filter((s: any) => s.id !== id);
  sites.push({
    id,
    name,
    url: `https://${id}.test`,
    wordpress: { baseUrl: `https://${id}.test`, username: 'u', applicationPassword: 'p', hasPassword: true }
  });
  db.saveSites(sites);
}

seed(SITE, 'A');
seed(SITE_B, 'B');
saveContentIndex(
  buildIndexFromLocalArticles(SITE, [
    {
      id: 1,
      title: 'چادر',
      content: '<p>متن</p>',
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

await run('sanitizeJobPayload strips secrets', () => {
  const clean = sanitizeJobPayload({
    topic: 'x',
    applicationPassword: 'secret',
    nested: { apiKey: 'k', ok: 1 }
  });
  assert.equal(clean.applicationPassword, undefined);
  assert.equal((clean.nested as any).apiKey, undefined);
  assert.equal((clean.nested as any).ok, 1);
});

await run('enqueue + idempotency returns same job', () => {
  const a = enqueueJob({
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    idempotencyKey: 'perf-once'
  });
  const b = enqueueJob({
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    idempotencyKey: 'perf-once'
  });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.job.id, b.job.id);
});

await run('duplicate PERFORMANCE_SYNC prevention', () => {
  const again = enqueueJob({ siteId: SITE, type: 'PERFORMANCE_SYNC' });
  assert.equal(again.created, false);
});

await run('priority ordering HIGH before LOW', () => {
  for (const job of listOpsJobs({ siteId: SITE, status: 'QUEUED' })) {
    requestCancelOpsJob(job.id, SITE);
  }
  const low = enqueueJob({
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    priority: 'LOW',
    idempotencyKey: 'ord-low'
  });
  const high = enqueueJob({
    siteId: SITE,
    type: 'RESEARCH',
    priority: 'HIGH',
    payload: { topic: 'موضوع تست اولویت' },
    idempotencyKey: 'ord-high',
    entityKey: 'research:موضوع تست اولویت'
  });
  assert.equal(low.created && high.created, true);
  const next = pickNextQueuedJob();
  assert.equal(next?.id, high.job.id);
});

await run('site isolation for job lookup', () => {
  const job = enqueueJob({
    siteId: SITE,
    type: 'RESEARCH',
    payload: { topic: 'ایزوله' },
    entityKey: 'research:ایزوله',
    idempotencyKey: 'iso-a'
  }).job;
  assert.equal(getOpsJob(job.id, SITE_B), undefined);
  assert.ok(getOpsJob(job.id, SITE));
});

await run('cancel queued job immediately', () => {
  const job = enqueueJob({
    siteId: SITE,
    type: 'RESEARCH',
    payload: { topic: 'لغو' },
    entityKey: 'research:لغو',
    idempotencyKey: 'cancel-q'
  }).job;
  const cancelled = requestCancelOpsJob(job.id, SITE)!;
  assert.equal(cancelled.status, 'CANCELLED');
});

await run('performance sync handler executes via runner', async () => {
  for (const job of listOpsJobs({ siteId: SITE, status: ['QUEUED', 'RUNNING', 'PAUSED'] })) {
    requestCancelOpsJob(job.id, SITE);
  }
  const { job } = enqueueJob({
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    idempotencyKey: `perf-run-${Date.now()}`
  });
  const done = await executeJob(job.id);
  assert.equal(done?.status, 'COMPLETED');
  assert.ok(Number((done?.result as any)?.articleCount) >= 1);
});

await run('retryable error classification', () => {
  const err = toJobError(new Error('ETIMEDOUT talking to provider'));
  assert.equal(err.retryable, true);
  const bad = toJobError(Object.assign(new Error('invalid credentials'), { retryable: false }));
  assert.equal(bad.retryable, false);
});

await run('stale heartbeat recovery marks INTERRUPTED', () => {
  const { job } = enqueueJob({
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    idempotencyKey: `stale-${Date.now()}`
  });
  const staleAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const raw = db.getOpsJobStore() || { schemaVersion: OPS_JOB_SCHEMA_VERSION, jobs: [] };
  raw.jobs = (raw.jobs || []).map((row: any) =>
    row.id === job.id
      ? { ...row, status: 'RUNNING', lastHeartbeatAt: staleAt, updatedAt: staleAt, startedAt: staleAt }
      : row
  );
  db.saveOpsJobStore(raw);

  const recovered = recoverStaleOpsJobs(Date.now());
  assert.ok(recovered.some((row) => row.id === job.id));
  assert.equal(getOpsJob(job.id)?.status, 'INTERRUPTED');
});

await run('scheduler enqueues job instead of doing work', () => {
  for (const job of listOpsJobs({ siteId: SITE, status: ['QUEUED', 'RUNNING', 'PAUSED'] })) {
    requestCancelOpsJob(job.id, SITE);
  }
  upsertSchedule({
    id: `${SITE}-PERFORMANCE_SYNC`,
    siteId: SITE,
    type: 'PERFORMANCE_SYNC',
    enabled: true,
    interval: 'daily',
    nextRunAt: new Date(Date.now() - 1000).toISOString()
  });
  const created = runDueSchedules(Date.now());
  assert.ok(created.length >= 1);
  const queued = listOpsJobs({ siteId: SITE, type: 'PERFORMANCE_SYNC', status: 'QUEUED' });
  assert.ok(queued.length >= 1);
});

await run('automation never publishes; creates recommendation', () => {
  updateAutomationSettings(SITE, { monitoringEnabled: true, automaticPublishing: false });
  upsertAutomationRule({
    siteId: SITE,
    enabled: true,
    trigger: 'SOURCE_CHANGED',
    action: 'CREATE_UPDATE_JOB',
    label: 'Source changed → recommend update'
  });
  const event = emitDomainEvent({ type: 'SOURCE_CHANGED', siteId: SITE, entityId: 'src-1' });
  const results = applyAutomationForEvent(event);
  assert.ok(results.some((r) => r.action === 'RECORD_RECOMMENDATION'));
  assert.ok(!results.some((r) => r.jobId && getOpsJob(r.jobId!)?.type === 'PUBLISH'));
});

await run('resume interrupted job', () => {
  const job = listOpsJobs({ siteId: SITE }).find((j) => j.status === 'INTERRUPTED');
  if (!job) return;
  const resumed = resumeOpsJob(job.id, SITE)!;
  assert.equal(resumed.status, 'QUEUED');
});

console.log('\nops job tests passed');
