import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

process.env.BLOG_MANAGER_DATA_DIR =
  process.env.BLOG_MANAGER_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'blog-manager-hardening-'));

const { sanitizeSite } = await import('../http.js');
const { buildHealthPayload } = await import('../providers/status.js');
const { getPerformanceOverview, syncPerformanceForSite } = await import('../performance/sync.js');
const { loadPerformanceStore } = await import('../performance/store.js');
const { db } = await import('../db.js');
const { createProductionJob } = await import('../content/pipeline.js');
const { requestCancelJob, recoverStaleRunningJobs, markJobRunning } = await import('../content/jobOps.js');
const { getJob, saveJob, listJobs } = await import('../content/store.js');
const { putCachedSource, getResearchSession, saveResearchSession, loadResearchStore } = await import('../research/store.js');
const { assessSourceQuality } = await import('../research/sourceQuality.js');
const { buildIndexFromLocalArticles } = await import('../intelligence/sync.js');
const { saveContentIndex } = await import('../intelligence/store.js');

function ok(name: string) {
  console.log(`ok  ${name}`);
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    console.error(`fail  ${name}`);
    throw err;
  }
}

const SITE = 'site-harden-a';
const SITE_B = 'site-harden-b';

db.saveSites([
  {
    id: SITE,
    name: 'A',
    url: 'https://a.example',
    wordpress: { baseUrl: 'https://a.example', username: 'u', applicationPassword: 'secret-pass' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: SITE_B,
    name: 'B',
    url: 'https://b.example',
    wordpress: { baseUrl: 'https://b.example' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]);

const index = buildIndexFromLocalArticles(SITE, [
  {
    id: 1,
    title: 'راهنمای چادر',
    content: '<p>متن</p>',
    date: '2024-01-01',
    modified: '2024-01-01',
    slug: 'tent',
    categories: ['کمپ'],
    tags: []
  }
]);
saveContentIndex(index);
saveContentIndex(buildIndexFromLocalArticles(SITE_B, []));

await run('credential redaction strips applicationPassword', () => {
  const site = db.getSiteById(SITE);
  const sanitized = sanitizeSite(site);
  assert.equal(sanitized.wordpress.applicationPassword, undefined);
  assert.equal(sanitized.wordpress.hasPassword, true);
  assert.ok(!JSON.stringify(sanitized).includes('secret-pass'));
});

await run('health endpoint payload never invents connected GSC', () => {
  const health = buildHealthPayload(SITE);
  assert.ok(health.providers.search_console);
  assert.equal((health.providers.search_console as any).status, 'not_configured');
  assert.equal((health.providers.web_search as any).status, 'not_configured');
  assert.equal((health.providers.search_console as any).configured, false);
  assert.equal((health.providers.web_search as any).configured, false);
  // Creds + local index must NOT imply WP "connected" without a live probe.
  assert.equal((health.providers.wordpress as any).status, 'configured');
  assert.notEqual((health.providers.wordpress as any).status, 'connected');
  assert.ok(['healthy', 'degraded'].includes(health.status));
});

await run('performance GET does not sync empty store', () => {
  const before = loadPerformanceStore(SITE);
  assert.equal(before.records.length, 0);
  const overview = getPerformanceOverview(SITE);
  assert.equal(overview.needsSync, true);
  assert.equal(overview.counts.total, 0);
  assert.equal(loadPerformanceStore(SITE).records.length, 0, 'GET must not write sync data');
  const synced = syncPerformanceForSite(SITE);
  assert.ok(synced.records.length > 0);
  assert.equal(getPerformanceOverview(SITE).needsSync, false);
});

await run('job cancel works for queued jobs', () => {
  const job = createProductionJob({ siteId: SITE, topic: 'موضوع تست لغو کار' });
  assert.equal(job.status, 'QUEUED');
  const cancelled = requestCancelJob(job);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.ok(cancelled.cancelRequestedAt);
  assert.ok(cancelled.cancelledAt);
});

await run('stale RUNNING job recovery marks INTERRUPTED', () => {
  const job = createProductionJob({ siteId: SITE, topic: 'کار قطع‌شده' });
  const running = markJobRunning(job);
  const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  saveJob(
    {
      ...running,
      status: 'RUNNING',
      startedAt: staleAt,
      updatedAt: staleAt
    },
    { preserveTimestamps: true }
  );
  const recovered = recoverStaleRunningJobs(SITE);
  assert.ok(recovered.some((row) => row.id === job.id));
  assert.equal(getJob(SITE, job.id)?.status, 'INTERRUPTED');
});

await run('multi-site job isolation', () => {
  const a = createProductionJob({ siteId: SITE, topic: 'موضوع سایت آ' });
  const b = createProductionJob({ siteId: SITE_B, topic: 'موضوع سایت ب' });
  assert.ok(listJobs(SITE).every((job) => job.siteId === SITE));
  assert.ok(listJobs(SITE_B).every((job) => job.siteId === SITE_B));
  assert.equal(getJob(SITE_B, a.id), undefined);
  assert.equal(getJob(SITE, b.id), undefined);
});

await run('source hash change marks research sessions STALE', () => {
  const url = 'https://maker.example/spec';
  putCachedSource(SITE, {
    id: 'src-1',
    siteId: SITE,
    url,
    title: 'Spec',
    domain: 'maker.example',
    sourceType: 'PRODUCT_MANUFACTURER',
    fetchedAt: new Date().toISOString(),
    content: 'وزن ۲ کیلوگرم',
    contentHash: 'hash-a',
    status: 'ok',
    freshness: 'CURRENT'
  });
  saveResearchSession({
    id: 'rs-stale',
    siteId: SITE,
    topic: 'چادر',
    status: 'READY',
    plan: {
      id: 'p',
      siteId: SITE,
      topic: 'چادر',
      primaryQuestion: 'q',
      supportingQuestions: [],
      searchIntent: 'informational',
      requiredFacts: [],
      requiredProductFacts: [],
      requiredTechnicalFacts: [],
      preferredSourceTypes: [],
      sourceExclusions: [],
      freshnessRequirement: 'medium',
      highRiskTopics: [],
      generatedAt: new Date().toISOString()
    },
    sources: [
      {
        id: 'src-1',
        siteId: SITE,
        url,
        title: 'Spec',
        domain: 'maker.example',
        sourceType: 'PRODUCT_MANUFACTURER',
        fetchedAt: new Date().toISOString(),
        content: 'وزن ۲ کیلوگرم',
        contentHash: 'hash-a',
        status: 'ok',
        freshness: 'CURRENT'
      }
    ],
    extractedEvidence: [],
    claims: [],
    conflicts: [],
    unknownFacts: [],
    qualityGate: { status: 'PASS', reasons: [], blocking: [], warnings: [], assessedAt: new Date().toISOString() },
    providers: [],
    researchConfidence: 'medium',
    packetEvidence: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  const result = putCachedSource(SITE, {
    id: 'src-1',
    siteId: SITE,
    url,
    title: 'Spec',
    domain: 'maker.example',
    sourceType: 'PRODUCT_MANUFACTURER',
    fetchedAt: new Date().toISOString(),
    content: 'وزن ۳ کیلوگرم',
    contentHash: 'hash-b',
    status: 'ok',
    freshness: 'CURRENT'
  });
  assert.equal(result.changed, true);
  assert.equal(getResearchSession(SITE, 'rs-stale')?.status, 'STALE');
  assert.equal(getResearchSession(SITE_B, 'rs-stale'), undefined);
});

await run('source quality marks demo data low', () => {
  const assessment = assessSourceQuality({
    id: 'd',
    siteId: SITE,
    url: 'http://example.com/x',
    title: 'demo',
    domain: 'example.com',
    sourceType: 'UNKNOWN',
    fetchedAt: new Date().toISOString(),
    content: 'short',
    contentHash: 'x',
    status: 'ok',
    freshness: 'UNKNOWN',
    isDemo: true
  });
  assert.equal(assessment.quality, 'low');
  assert.ok(assessment.reasons.includes('DEMO_DATA'));
});

console.log('\nhardening tests passed');
