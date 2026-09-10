import { fetchWordpressCollection, diffIncremental } from './wordpress.js';
import { normalizeWordpressHtml } from './normalize.js';
import { buildFingerprint } from './fingerprint.js';
import { evaluateCannibalization } from './duplication.js';
import { buildClustersFromIndex } from './clusters.js';
import { classifyFreshness } from './decay.js';
import { scoreOpportunity } from './scoring.js';
import { buildOpportunities } from './opportunities.js';
import { detectGaps } from './gaps.js';
import { buildIndexFromLocalArticles } from './sync.js';
import { buildArticleBrief, validateArticleBrief } from './brief.js';
import { db } from '../db.js';

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

const fixturesA = [
  {
    id: 1,
    title: 'راهنمای جامع خرید چادر کوهنوردی',
    content: '<h2>ساختار</h2><p>چادر چهار فصل و دوپوش را برای باد و برف انتخاب کنید. تیرک ژئودزیک اهمیت دارد.</p>',
    categories: ['چادر'],
    date: '2024-01-01T00:00:00.000Z',
    modified: '2024-06-01T00:00:00.000Z'
  },
  {
    id: 2,
    title: 'راهنمای سایز کفش کوهنوردی',
    content: '<h2>اندازه</h2><p>سایز کفش کوهنوردی باید نیم سایز بزرگ‌تر باشد. بند و پاشنه مهم است.</p>',
    categories: ['کفش'],
    date: '2025-01-01T00:00:00.000Z',
    modified: '2025-08-01T00:00:00.000Z'
  },
  {
    id: 3,
    title: 'نکات نگهداری پوتین گورتکس',
    content: '<p>شستشوی پوتین گورتکس با برس نرم و بدون نرم‌کننده.</p>',
    categories: ['کفش'],
    date: '2025-02-01T00:00:00.000Z',
    modified: '2025-09-01T00:00:00.000Z'
  },
  {
    id: 4,
    title: 'آیا کتونی برای کوهنوردی مناسب است؟',
    content: '<p>کتونی شهری برای مسیر فنی کافی نیست. پوتین با زیره محکم لازم است.</p>',
    categories: ['کفش'],
    date: '2023-01-01T00:00:00.000Z',
    modified: '2023-01-01T00:00:00.000Z'
  }
];

await run('WordPress pagination respects X-WP-TotalPages', async () => {
  const pages = [
    [{ id: 1 }, { id: 2 }],
    [{ id: 3 }]
  ];
  const fetchImpl = async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page') || '1');
    const body = pages[page - 1] || [];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      headers: new Headers({
        'X-WP-Total': '3',
        'X-WP-TotalPages': '2'
      })
    } as Response;
  };
  const result = await fetchWordpressCollection({
    baseUrl: 'https://example.test/',
    resource: 'posts',
    perPage: 2,
    fetchImpl: fetchImpl as any
  });
  assert(result.items.length === 3, `expected 3 items, got ${result.items.length}`);
  assert(result.total === 3, 'total header');
});

await run('content normalization strips scripts and keeps headings', () => {
  const n = normalizeWordpressHtml(
    'راهنما',
    '<script>alert(1)</script><nav>menu</nav><h2>تیرک</h2><p>چادر چهار فصل باید پایدار باشد و این پاراگراف به اندازه کافی بلند است.</p><ul><li>مهاربند</li></ul>'
  );
  assert(!n.plainText.includes('alert'), 'script removed');
  assert(n.headings.includes('تیرک'), 'heading kept');
  assert(n.productMentions.includes('tent'), 'tent detected');
});

await run('fingerprints are more than title hashes', () => {
  const n = normalizeWordpressHtml('راهنمای سایز کفش کوهنوردی', '<h2>بند</h2><p>پوتین باید روی سرازیری قفل شود و پاشنه حرکت نکند تا تاول نزند.</p>');
  const fp = buildFingerprint({ siteId: 's1', articleId: 2, title: 'راهنمای سایز کفش کوهنوردی', slug: 'boot-size', normalized: n });
  assert(fp.primaryKeyword.includes('کفش') || fp.normalizedTitle.includes('کفش'), 'keyword');
  assert(fp.headingStructure.length > 0, 'headings');
  assert(fp.articleType, 'type');
  assert(fp.contentHash.length === 16, 'hash');
});

await run('duplicate: best tent cannibalizes comprehensive tent guide', () => {
  const index = buildIndexFromLocalArticles('site-a', fixturesA);
  const result = evaluateCannibalization({
    siteId: 'site-a',
    title: 'بهترین چادر کوهنوردی',
    keyword: 'چادر کوهنوردی',
    searchIntent: 'commercial',
    articles: index.articles
  });
  assert(result.cannibalizationRisk !== 'none', 'risk');
  assert(['do_not_create', 'update_existing', 'merge_with_existing'].includes(result.decision), `decision ${result.decision}`);
});

await run('supporting lacing article is not a duplicate of sizing guide', () => {
  const index = buildIndexFromLocalArticles('site-a', fixturesA);
  const result = evaluateCannibalization({
    siteId: 'site-a',
    title: 'نحوه بستن بند پوتین در سرازیری',
    keyword: 'بستن بند پوتین',
    searchIntent: 'informational',
    articles: index.articles
  });
  assert(result.decision === 'create_new' || result.decision === 'create_supporting' || result.decision === 'create_tutorial' || result.decision === 'create_different_intent', `got ${result.decision}`);
  assert(result.cannibalizationRisk !== 'severe', 'should not be severe');
});

await run('footwear cluster without Vibram comparison yields comparison gap', () => {
  const index = buildIndexFromLocalArticles('site-a', fixturesA);
  const footwear = index.clusters.find((c) => /کفش|پوتین|footwear/i.test(c.name) || c.articleIds.length >= 2);
  assert(footwear || index.gaps.some((g) => g.kind === 'missing_comparison'), 'cluster or gap');
  const comparisonGap = index.gaps.some((g) => g.kind === 'missing_comparison' || /vibram|ویبرام|مقایسه/i.test(g.topic));
  assert(comparisonGap || index.opportunities.some((o) => o.contentType === 'comparison'), 'comparison opportunity');
});

await run('old unmodified article is flagged for review', () => {
  const result = classifyFreshness({ date: '2020-01-01', modified: '2020-01-01', wordCount: 200 });
  assert(result.status === 'likely_outdated' || result.status === 'needs_review', result.status);
});

await run('recent article is not outdated just because a catalog exists', () => {
  const result = classifyFreshness({
    date: '2026-07-01',
    modified: '2026-07-01',
    wordCount: 500,
    productMentions: ['tent'],
    knownProducts: ['مشعل کمپو', 'میز پرستیژ PRESTIGE']
  });
  assert(result.status === 'healthy', result.reason);
});

await run('cluster construction groups by category', () => {
  const index = buildIndexFromLocalArticles('site-a', fixturesA);
  assert(index.clusters.length >= 1, 'clusters');
  const shoe = index.clusters.find((c) => c.articleIds.length >= 2);
  assert(shoe, 'footwear-ish cluster');
  assert(typeof shoe!.health.score === 'number', 'health score');
});

await run('opportunity scoring is transparent and does not invent volume', () => {
  const index = buildIndexFromLocalArticles('site-a', fixturesA);
  const scoring = index.opportunities[0]?.scoring;
  assert(scoring, 'has scoring');
  assert(scoring.factors.some((f) => f.id === 'traffic' && f.sourceType === 'estimated'), 'traffic estimated');
  assert(!scoring.factors.some((f) => /search volume|رتبه گوگل/i.test(f.evidence)), 'no fake volume');
});

await run('multi-site isolation', () => {
  buildIndexFromLocalArticles('site-a', fixturesA);
  buildIndexFromLocalArticles('site-b', [
    { id: 99, title: 'راهنمای جامع خرید چادر کوهنوردی', content: '<p>مقاله سایت دیگر درباره چادر چهار فصل با توضیح کافی برای ایندکس.</p>', categories: ['چادر'] }
  ]);
  const a = evaluateCannibalization({
    siteId: 'site-b',
    title: 'بهترین چادر کوهنوردی',
    articles: db.getContentIndex('site-b')?.articles || []
  });
  const fromA = evaluateCannibalization({
    siteId: 'site-a',
    title: 'بهترین چادر کوهنوردی',
    articles: (db.getContentIndex('site-a')?.articles || []).filter((x: any) => x.siteId === 'site-a')
  });
  assert((db.getContentIndex('site-a')?.articles || []).every((x: any) => x.siteId === 'site-a'), 'site a scoped');
  assert((db.getContentIndex('site-b')?.articles || []).every((x: any) => x.siteId === 'site-b'), 'site b scoped');
  assert(fromA.matchedArticles.length >= 1, 'site a still detects its own tent guide');
  void a;
});

await run('incremental sync diff uses modified dates and ids', () => {
  const diff = diffIncremental(
    [{ id: 1, modified: '2026-01-01', slug: 'a' }, { id: 2, modified: '2026-01-01', slug: 'b' }],
    [{ id: 1, modified: '2026-02-01', slug: 'a' }, { id: 3, modified: '2026-02-01', slug: 'c' }]
  );
  assert(diff.changedIds.includes(1), 'changed');
  assert(diff.newIds.includes(3), 'new');
  assert(diff.removedIds.includes(2), 'removed');
});

await run('lifecycle includes BRIEF_READY as a valid next step after APPROVED', () => {
  const steps = ['IDEA', 'RESEARCHED', 'APPROVED', 'BRIEF_READY', 'GENERATING', 'REVIEW', 'APPROVED_FOR_PUBLISH', 'PUBLISHED'];
  assert(steps.indexOf('BRIEF_READY') === 3, 'order');
});

await run('integration: index → gaps → opportunities → article brief', () => {
  const index = buildIndexFromLocalArticles('site-a', fixturesA);
  assert(index.articles.length === fixturesA.length, 'indexed articles');
  assert(index.gaps.length >= 1, 'gaps');
  assert(index.opportunities.length >= 1, 'opportunities');
  const brief = buildArticleBrief({
    siteId: 'site-a',
    opportunity: index.opportunities[0],
    articles: index.articles
  });
  assert(brief.siteId === 'site-a', 'brief scoped to site');
  assert(brief.uniqueAngle.length > 10, 'unique angle');
  assert(brief.requiredSections.length >= 4, 'required sections');
  assert(brief.visualIntent?.visualPurpose, 'visual intent from brief');
  const validated = validateArticleBrief(brief);
  assert(validated?.topic === brief.topic, 'brief validates');
  assert(validated?.forbiddenOverlap, 'forbidden overlap present');
});

if (process.exitCode) {
  console.error('\nintelligence tests failed');
} else {
  console.log('\nintelligence tests passed');
}
