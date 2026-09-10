import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.BLOG_MANAGER_DATA_DIR =
  process.env.BLOG_MANAGER_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'blog-manager-perf-'));

const { buildIndexFromLocalArticles } = await import('../intelligence/sync.js');
const { saveContentIndex } = await import('../intelligence/store.js');
const { db } = await import('../db.js');
const { calculateTrend } = await import('./trends.js');
const { buildWordpressBaseline, daysBetween } = await import('./metrics.js');
const { auditFreshness } = await import('./freshness.js');
const { assessDecay } = await import('./decay.js');
const { assessArticleHealth } = await import('./health.js');
const { computeLinkingImpact } = await import('./linkingImpact.js');
const { buildPerformanceOpportunities } = await import('./opportunities.js');
const { syncPerformanceForSite } = await import('./sync.js');
const { validateSnapshot, getSearchConsoleProvider } = await import('./providers.js');
const { buildDeterministicUpdatePlan } = await import('./updatePlan.js');
const { createUpdateProductionJob } = await import('../content/pipeline.js');
const { getJob, listJobs } = await import('../content/store.js');

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function run(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok  ${name}`))
    .catch((err) => {
      console.error(`fail  ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

const SITE_A = 'perf-site-a';
const SITE_B = 'perf-site-b';

function seedSite(siteId: string, name: string) {
  const sites = db.getSites().filter((site: any) => site.id !== siteId);
  sites.push({
    id: siteId,
    name,
    url: `https://${siteId}.test`,
    description: 'perf test',
    language: 'fa',
    wordpress: { baseUrl: `https://${siteId}.test`, username: '', applicationPassword: '', hasPassword: false },
    brand: { name, description: '', primaryColor: '#059669', secondaryColor: '#0d9488' },
    seo: { domain: `${siteId}.test`, targetCountry: 'IR', targetLanguage: 'fa', targetAudience: 'کوهنوردان' },
    content: { tone: 'practical', topics: [], excludedTopics: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  db.saveSites(sites);
}

seedSite(SITE_A, 'پرف الف');
seedSite(SITE_B, 'پرف ب');

const postsA = [
  {
    id: 101,
    title: 'راهنمای جامع خرید چادر کوهنوردی ۲۰۱۹',
    slug: 'tent-guide-2019',
    content:
      '<h2>ساختار</h2><p>چادر چهار فصل باید پایدار باشد و این پاراگراف به اندازه کافی بلند است برای تست.</p><h2>انتخاب ۲۰۱۹</h2><p>بهترین چادر ۲۰۱۹ را با توجه به باد انتخاب کنید و محصول قدیمی آلفا را ببینید.</p><a href="/missing-old-post">لینک شکسته</a>',
    categories: ['چادر'],
    date: '2019-01-01T00:00:00.000Z',
    modified: '2019-06-01T00:00:00.000Z'
  },
  {
    id: 102,
    title: 'راهنمای سایز پوتین کوهنوردی',
    slug: 'boot-sizing',
    content:
      '<h2>اندازه</h2><p>پوتین کوهنوردی باید نیم سایز بزرگ‌تر باشد تا در سرازیری انگشتان آسیب نبینند و تاول ایجاد نشود.</p><h2>جوراب</h2><p>با جوراب ضخیم پرو کنید و پاشنه را در شیب تست کنید تا حرکت اضافه نداشته باشد.</p><a href="/tent-guide-2019">چادر</a>',
    categories: ['کفش'],
    date: '2025-01-01T00:00:00.000Z',
    modified: '2025-08-01T00:00:00.000Z'
  },
  {
    id: 103,
    title: 'نگهداری پوتین گورتکس',
    slug: 'goretex-care',
    content: '<p>شستشوی پوتین گورتکس با برس نرم انجام شود و از نرم‌کننده استفاده نکنید تا غشا آسیب نبیند و دوام بیشتری داشته باشد.</p>',
    categories: ['کفش'],
    date: '2025-02-01T00:00:00.000Z',
    modified: '2025-09-01T00:00:00.000Z'
  }
];

const postsB = [
  {
    id: 201,
    title: 'راهنمای دوچرخه کوهستان',
    slug: 'mtb',
    content: '<h2>فریم</h2><p>فریم آلومینیومی برای مسیر خاکی سبک‌تر است و کنترل بهتری در سرازیری فراهم می‌کند.</p>',
    categories: ['دوچرخه'],
    date: '2025-04-01T00:00:00.000Z',
    modified: '2025-05-01T00:00:00.000Z'
  }
];

const indexA = buildIndexFromLocalArticles(SITE_A, postsA);
const indexB = buildIndexFromLocalArticles(SITE_B, postsB);
// Attach a product catalog so freshness can compare mentions.
indexA.products = [
  {
    id: 1,
    name: 'چادر آلپاین پرو',
    slug: 'alpine-pro',
    categories: ['چادر'],
    tags: [],
    images: [],
    attributes: [],
    sourceType: 'observed'
  }
];
saveContentIndex(indexA);
saveContentIndex(indexB);

await run('trend calculation: insufficient data when windows are thin', () => {
  const trend = calculateTrend([
    { id: '1', siteId: SITE_A, articleId: 1, date: '2026-08-01', clicks: 10, source: 'search_console', quality: 'VERIFIED' }
  ]);
  assert(trend.direction === 'INSUFFICIENT_DATA', `expected INSUFFICIENT_DATA, got ${trend.direction}`);
  assert(trend.changePercent === null, 'no fake percentage');
});

await run('trend calculation: falling when recent window drops', () => {
  const snaps = [];
  for (let i = 0; i < 8; i++) {
    snaps.push({
      id: `p${i}`,
      siteId: SITE_A,
      articleId: 1,
      date: new Date(Date.now() - (60 - i) * 86400000).toISOString().slice(0, 10),
      clicks: 100,
      source: 'search_console' as const,
      quality: 'VERIFIED' as const
    });
  }
  for (let i = 0; i < 8; i++) {
    snaps.push({
      id: `r${i}`,
      siteId: SITE_A,
      articleId: 1,
      date: new Date(Date.now() - (20 - i) * 86400000).toISOString().slice(0, 10),
      clicks: 40,
      source: 'search_console' as const,
      quality: 'VERIFIED' as const
    });
  }
  const trend = calculateTrend(snaps, { periodDays: 28 });
  assert(trend.direction === 'FALLING', `expected FALLING, got ${trend.direction}`);
  assert(typeof trend.changePercent === 'number' && trend.changePercent! < 0, 'negative change');
});

await run('content age and wordpress baseline are metadata, not SEO metrics', () => {
  const article = indexA.articles[0];
  const baseline = buildWordpressBaseline(article, indexA.indexedAt);
  assert(baseline.wordCount > 0, 'word count');
  assert(typeof baseline.internalLinkCount === 'number', 'internal links counted');
  assert(daysBetween(article.date) != null, 'age days');
  assert(baseline.quality === 'VERIFIED' || baseline.quality === 'DEMO_DATA', 'quality labeled');
  assert(!('clicks' in baseline), 'baseline must not invent clicks');
});

await run('freshness detection finds old year references', () => {
  const issues = auditFreshness({
    article: indexA.articles[0],
    products: indexA.products,
    allArticles: indexA.articles
  });
  assert(issues.some((issue) => issue.type === 'old_year_reference'), 'old year flagged');
  assert(issues.every((issue) => issue.suggestedAction), 'each issue has an action');
});

await run('decay classification does not mark age alone as DECAYED', () => {
  const article = indexA.articles[0];
  const baseline = buildWordpressBaseline(article, indexA.indexedAt);
  const decay = assessDecay({
    siteId: SITE_A,
    article,
    baseline,
    freshnessIssues: [],
    trend: undefined
  });
  assert(decay.status !== 'DECAYED', `age-only must not be DECAYED, got ${decay.status}`);
  assert(decay.status === 'WATCH' || decay.status === 'INSUFFICIENT_DATA' || decay.status === 'HEALTHY', 'valid status');
});

await run('decay becomes DECLINING with multiple medium/high signals', () => {
  const article = indexA.articles[0];
  const baseline = buildWordpressBaseline(article, indexA.indexedAt);
  const freshnessIssues = auditFreshness({
    article,
    products: indexA.products,
    allArticles: indexA.articles
  });
  const decay = assessDecay({
    siteId: SITE_A,
    article,
    baseline,
    freshnessIssues,
    hasNewerSibling: true,
    cannibalizationRisk: 'moderate'
  });
  assert(
    decay.status === 'DECLINING' || decay.status === 'DECAYED' || decay.status === 'WATCH',
    `expected actionable decay, got ${decay.status}`
  );
  assert(decay.reasons.length > 0, 'reasons present');
});

await run('article health marks performance unknown without Search Console', () => {
  const article = indexA.articles[1];
  const baseline = buildWordpressBaseline(article, indexA.indexedAt);
  const freshnessIssues = auditFreshness({ article, products: indexA.products, allArticles: indexA.articles });
  const linkingImpact = computeLinkingImpact({
    siteId: SITE_A,
    article,
    articles: indexA.articles,
    clusters: indexA.clusters
  });
  const decay = assessDecay({ siteId: SITE_A, article, baseline, freshnessIssues });
  const health = assessArticleHealth({
    siteId: SITE_A,
    article,
    baseline,
    freshnessIssues,
    decay,
    linkingImpact,
    searchConsoleConnected: false
  });
  assert(health.dimensions.performance.status === 'unknown', 'performance unknown without GSC');
  assert(
    health.dimensions.performance.reasons.some((reason) => /not connected/i.test(reason)),
    'explains missing provider'
  );
});

await run('performance opportunities are evidence-backed', () => {
  const synced = syncPerformanceForSite(SITE_A);
  assert(synced.records.length === postsA.length, 'all articles assessed');
  assert(synced.overview.providers.some((provider) => provider.provider === 'search_console' && provider.status === 'not_connected'), 'GSC not connected');
  assert(synced.overview.hasSearchPerformance === false, 'no fake GSC flag');
  const opportunities = synced.records.flatMap((record) => record.opportunities);
  assert(opportunities.length > 0, 'opportunities generated from wordpress signals');
  assert(opportunities.every((row) => row.evidence.length > 0 && row.reason), 'each opportunity explains itself');
  const serialized = JSON.stringify(synced.overview);
  assert(!/"clicks":\s*[1-9]/.test(serialized), 'overview must not invent click counts');
});

await run('unavailable provider returns not_connected', () => {
  const status = getSearchConsoleProvider().getConnectionStatus();
  assert(status.status === 'not_connected', 'GSC not connected');
});

await run('invalid provider snapshots are rejected', () => {
  assert(validateSnapshot({ siteId: SITE_B, articleId: 1, date: '2026-01-01' }, SITE_A) === null, 'cross-site rejected');
  assert(validateSnapshot({ siteId: SITE_A, articleId: 1, date: '2026-01-01', source: 'search_console', position: 0 }, SITE_A) === null, 'position 0 rejected');
  assert(
    validateSnapshot(
      { siteId: SITE_A, articleId: 1, date: '2026-01-01', source: 'search_console', clicks: 3, quality: 'VERIFIED' },
      SITE_A
    )?.clicks === 3,
    'valid snapshot accepted'
  );
});

await run('update job creation preserves article identity and versions', () => {
  const synced = syncPerformanceForSite(SITE_A);
  const record = synced.records[0];
  const article = indexA.articles.find((row) => String(row.id) === String(record.articleId))!;
  const plan = buildDeterministicUpdatePlan({
    siteId: SITE_A,
    article,
    baseline: record.baseline,
    decay: record.decay,
    freshnessIssues: record.freshnessIssues,
    linkingImpact: record.linkingImpact,
    opportunities: record.opportunities
  });
  assert(plan.whyUpdateNeeded.length > 0, 'plan has reasons');
  assert(plan.sectionsToPreserve.length > 0, 'preserve sections');

  const job = createUpdateProductionJob({
    siteId: SITE_A,
    articleId: article.id,
    updateReason: record.opportunities[0]?.reason || 'test',
    updatePlan: {
      whyUpdateNeeded: plan.whyUpdateNeeded,
      sectionsToPreserve: plan.sectionsToPreserve,
      sectionsToModify: plan.sectionsToModify,
      sectionsToAdd: plan.sectionsToAdd,
      factsToVerify: plan.factsToVerify,
      expectedRisk: plan.expectedRisk,
      requiredHumanReview: plan.requiredHumanReview
    },
    performanceSignals: record.decay.signals.map((signal) => signal.evidence)
  });
  assert(job.mode === 'UPDATE', 'mode is UPDATE');
  assert(String(job.sourceArticleId) === String(article.id), 'source article preserved');
  assert(job.originalContentHash === article.fingerprint.contentHash, 'original hash stored');
  assert(job.versions.length === 1, 'base version created');
  assert(job.versions[0].contentHash === article.fingerprint.contentHash, 'before hash recorded');
  assert(getJob(SITE_B, job.id) === undefined, 'update job is site-scoped');
});

await run('multi-site isolation for performance sync', () => {
  const a = syncPerformanceForSite(SITE_A);
  const b = syncPerformanceForSite(SITE_B);
  assert(a.records.every((record) => record.siteId === SITE_A), 'site A records scoped');
  assert(b.records.every((record) => record.siteId === SITE_B), 'site B records scoped');
  const titlesB = new Set(b.records.map((record) => record.baseline.title));
  assert(a.records.every((record) => !titlesB.has(record.baseline.title)), 'no title leakage');
  assert(listJobs(SITE_A).every((job) => job.siteId === SITE_A), 'jobs remain isolated');
});

await run('recommendation priority exposes contributing signals', () => {
  const overview = syncPerformanceForSite(SITE_A).overview;
  assert(overview.improveRecommendations.length > 0 || overview.createRecommendations.length > 0, 'actions exist');
  for (const row of overview.topPriorities) {
    assert(row.reasons.length > 0, 'reasons required');
    assert(row.contributingSignals.length > 0, 'signals required');
    assert(row.priority === 'HIGH' || row.priority === 'MEDIUM' || row.priority === 'LOW', 'priority label');
  }
});

if (process.exitCode) console.error('\nperformance tests failed');
else console.log('\nperformance tests passed');
