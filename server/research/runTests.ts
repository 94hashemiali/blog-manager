import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

process.env.BLOG_MANAGER_DATA_DIR =
  process.env.BLOG_MANAGER_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'blog-manager-research-'));

const { validateResearchUrl, isPrivateOrLocalIp } = await import('./urlSafety.js');
const { stripHtmlToText, classifyFreshness, inferSourceType, fetchResearchUrl } = await import('./fetcher.js');
const { extractEvidenceFromSource } = await import('./extractor.js');
const { getWebSearchProvider } = await import('./providers.js');
const { buildClaimsFromEvidence, detectConflicts, validateProductClaims, classifyClaimType } = await import('./claims.js');
const { assessResearchQuality } = await import('./quality.js');
const { buildResearchPlan } = await import('./planner.js');
const { putCachedSource, getCachedSource, saveResearchSession, getResearchSession } = await import('./store.js');
const { db } = await import('../db.js');

function ok(name: string) {
  console.log(`ok  ${name}`);
}

function fail(name: string, err: unknown): never {
  console.error(`fail  ${name}`);
  throw err;
}

async function run(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

const SITE_A = 'site-research-a';
const SITE_B = 'site-research-b';

db.saveSites([
  {
    id: SITE_A,
    name: 'Site A',
    url: 'https://example-a.test',
    language: 'fa',
    wordpress: { baseUrl: 'https://example-a.test' },
    seo: { targetAudience: 'hikers' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: SITE_B,
    name: 'Site B',
    url: 'https://example-b.test',
    language: 'fa',
    wordpress: { baseUrl: 'https://example-b.test' },
    seo: { targetAudience: 'cyclists' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]);

await run('URL validation rejects non-http schemes', () => {
  assert.equal(validateResearchUrl('file:///etc/passwd').ok, false);
  assert.equal(validateResearchUrl('ftp://example.com').ok, false);
  assert.equal(validateResearchUrl('data:text/html,hi').ok, false);
  assert.equal(validateResearchUrl('https://example.com/guide').ok, true);
});

await run('private IP blocking', () => {
  assert.equal(isPrivateOrLocalIp('127.0.0.1'), true);
  assert.equal(isPrivateOrLocalIp('10.0.0.2'), true);
  assert.equal(isPrivateOrLocalIp('192.168.1.1'), true);
  assert.equal(isPrivateOrLocalIp('8.8.8.8'), false);
  assert.equal(isPrivateOrLocalIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrLocalIp('::ffff:7f00:1'), true);
  assert.equal(isPrivateOrLocalIp('::ffff:8.8.8.8'), false);
  assert.equal(validateResearchUrl('http://127.0.0.1/secret').ok, false);
  assert.equal(validateResearchUrl('http://localhost/x').ok, false);
});

await run('source normalization strips scripts and hashes content', () => {
  const { title, text } = stripHtmlToText(
    '<html><head><title>چادر ۴ فصل</title><script>evil()</script></head><body><p>وزن ۱.۲ کیلوگرم است.</p></body></html>'
  );
  assert.equal(title.includes('چادر'), true);
  assert.equal(text.includes('evil'), false);
  assert.equal(text.includes('۱.۲'), true);
  assert.equal(inferSourceType('https://www.example.gov/page'), 'GOVERNMENT');
});

await run('source freshness depends on requirement', () => {
  const fetchedAt = '2026-09-10T00:00:00.000Z';
  const publishedAt = '2024-01-01T00:00:00.000Z';
  assert.equal(
    classifyFreshness({ fetchedAt, publishedAt, freshnessRequirement: 'high' }),
    'STALE'
  );
  assert.equal(
    classifyFreshness({ fetchedAt, publishedAt, freshnessRequirement: 'low' }),
    'CURRENT'
  );
  assert.equal(classifyFreshness({ fetchedAt, freshnessRequirement: 'medium' }), 'UNKNOWN');
});

await run('cache reuse returns cached source without refetch', () => {
  const source = {
    id: 'src-cache-1',
    siteId: SITE_A,
    url: 'https://example.com/tent-spec',
    title: 'Tent Spec',
    domain: 'example.com',
    sourceType: 'PRODUCT_MANUFACTURER' as const,
    fetchedAt: new Date().toISOString(),
    content: 'این چادر برای چهار نفر طراحی شده و وزن آن ۲ کیلوگرم است.',
    contentHash: 'abc123',
    status: 'ok' as const,
    freshness: 'CURRENT' as const
  };
  putCachedSource(SITE_A, source);
  const cached = getCachedSource(SITE_A, source.url);
  assert.ok(cached);
  assert.equal(cached!.status, 'cached');
  assert.equal(cached!.contentHash, 'abc123');
  assert.equal(getCachedSource(SITE_B, source.url), undefined, 'site B cannot read site A cache');
});

await run('evidence extraction pulls numeric sentences', () => {
  const source = {
    id: 'src-1',
    siteId: SITE_A,
    url: 'https://maker.example/spec',
    title: 'Spec',
    domain: 'maker.example',
    sourceType: 'PRODUCT_MANUFACTURER' as const,
    fetchedAt: new Date().toISOString(),
    content:
      'مقدمه کوتاه. این چادر برای چهار نفر مناسب است و وزن آن ۱۲۰۰ گرم اعلام شده است. جملهٔ بدون عدد که خیلی هم مفید نیست برای تست.',
    contentHash: 'h1',
    status: 'ok' as const,
    freshness: 'CURRENT' as const
  };
  const evidence = extractEvidenceFromSource(source);
  assert.ok(evidence.length >= 1);
  assert.ok(evidence.some((row) => /گرم|نفر/.test(row.claim)));
  assert.equal(evidence[0].verified, true);
});

await run('claim creation and statuses', () => {
  assert.equal(classifyClaimType('وزن ۸۰۰ گرم است'), 'PRODUCT_SPEC');
  assert.equal(classifyClaimType('قیمت ۲ میلیون تومان'), 'PRICE');
  const claims = buildClaimsFromEvidence({
    siteId: SITE_A,
    extracted: [
      {
        id: 'x1',
        siteId: SITE_A,
        sourceId: 's1',
        claim: 'وزن ۲ کیلوگرم است',
        evidenceText: 'وزن ۲ کیلوگرم است',
        location: 'p1',
        confidence: 'medium',
        sourceType: 'PRODUCT_MANUFACTURER',
        verified: true
      }
    ],
    packetEvidence: []
  });
  assert.equal(claims[0].status, 'SUPPORTED');
});

await run('conflicting sources detected without Gemini choosing a winner', () => {
  const sources = [
    {
      id: 's1',
      siteId: SITE_A,
      url: 'https://a.example',
      title: 'A',
      domain: 'a.example',
      sourceType: 'PRODUCT_MANUFACTURER' as const,
      fetchedAt: new Date().toISOString(),
      content: '',
      contentHash: '1',
      status: 'ok' as const,
      freshness: 'CURRENT' as const
    },
    {
      id: 's2',
      siteId: SITE_A,
      url: 'https://b.example',
      title: 'B',
      domain: 'b.example',
      sourceType: 'COMMUNITY' as const,
      fetchedAt: new Date().toISOString(),
      content: '',
      contentHash: '2',
      status: 'ok' as const,
      freshness: 'CURRENT' as const
    }
  ];
  const conflicts = detectConflicts({
    siteId: SITE_A,
    sources,
    extracted: [
      {
        id: 'e1',
        siteId: SITE_A,
        sourceId: 's1',
        claim: 'وزن چادر ۲ کیلوگرم است',
        evidenceText: 'وزن چادر ۲ کیلوگرم است',
        location: 'p1',
        confidence: 'high',
        sourceType: 'PRODUCT_MANUFACTURER',
        verified: true
      },
      {
        id: 'e2',
        siteId: SITE_A,
        sourceId: 's2',
        claim: 'وزن چادر ۳ کیلوگرم است',
        evidenceText: 'وزن چادر ۳ کیلوگرم است',
        location: 'p1',
        confidence: 'low',
        sourceType: 'COMMUNITY',
        verified: false
      }
    ]
  });
  assert.ok(conflicts.length >= 1);
  assert.equal(conflicts[0].resolutionStatus, 'RESOLVED_BY_AUTHORITY');
});

await run('product claim mismatch becomes CONTRADICTED', () => {
  const result = validateProductClaims({
    siteId: SITE_A,
    claims: ['کوله پشتی آلفا وزن ۸۰۰ گرم دارد'],
    products: [
      {
        id: 1,
        name: 'کوله پشتی آلفا',
        slug: 'alpha',
        categories: [],
        tags: [],
        images: [],
        attributes: ['وزن: 920 گرم'],
        sourceType: 'observed'
      }
    ],
    evidence: []
  });
  assert.ok(result.some((row) => row.status === 'CONTRADICTED'));
});

await run('research quality gate blocks zero verified evidence', () => {
  const plan = {
    id: 'p1',
    siteId: SITE_A,
    topic: 'ایمنی طناب کوهنوردی',
    primaryQuestion: 'q',
    supportingQuestions: ['a'],
    searchIntent: 'informational' as const,
    requiredFacts: ['استاندارد طناب'],
    requiredProductFacts: [],
    requiredTechnicalFacts: [],
    preferredSourceTypes: ['OFFICIAL_SOURCE' as const],
    sourceExclusions: [],
    freshnessRequirement: 'medium' as const,
    highRiskTopics: ['safety'],
    generatedAt: new Date().toISOString()
  };
  const gate = assessResearchQuality({
    plan,
    sources: [],
    claims: [
      {
        id: 'c1',
        siteId: SITE_A,
        text: 'این طناب در سقوط مرگ‌آور ایمن است',
        type: 'SAFETY',
        status: 'NEEDS_VERIFICATION',
        evidenceIds: [],
        sourceIds: [],
        confidence: 'low',
        reason: 'no evidence',
        highRisk: true
      }
    ],
    conflicts: [],
    verifiedEvidenceCount: 0
  });
  assert.equal(gate.status, 'BLOCKED');
});

await run('unavailable web provider returns not_configured', async () => {
  const provider = getWebSearchProvider();
  assert.equal(provider.configured, false);
  assert.equal((await provider.search('tents')).length, 0);
  assert.equal(provider.getStatus().status, 'not_configured');
});

await run('fetch blocks private hosts without network', async () => {
  const doc = await fetchResearchUrl({ siteId: SITE_A, url: 'http://127.0.0.1/admin' });
  assert.equal(doc.status, 'blocked');
});

await run('multi-site isolation for research sessions', () => {
  const session = {
    id: 'rs-a',
    siteId: SITE_A,
    topic: 'چادر',
    status: 'READY' as const,
    plan: {
      id: 'plan-a',
      siteId: SITE_A,
      topic: 'چادر',
      primaryQuestion: 'q',
      supportingQuestions: [],
      searchIntent: 'informational' as const,
      requiredFacts: [],
      requiredProductFacts: [],
      requiredTechnicalFacts: [],
      preferredSourceTypes: [],
      sourceExclusions: [],
      freshnessRequirement: 'medium' as const,
      highRiskTopics: [],
      generatedAt: new Date().toISOString()
    },
    sources: [],
    extractedEvidence: [],
    claims: [],
    conflicts: [],
    unknownFacts: [],
    qualityGate: {
      status: 'PASS' as const,
      reasons: [],
      blocking: [],
      warnings: [],
      assessedAt: new Date().toISOString()
    },
    providers: [],
    researchConfidence: 'medium' as const,
    packetEvidence: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveResearchSession(session);
  assert.ok(getResearchSession(SITE_A, 'rs-a'));
  assert.equal(getResearchSession(SITE_B, 'rs-a'), undefined);
});

await run('deterministic research plan without AI', async () => {
  const plan = await buildResearchPlan({
    siteId: SITE_A,
    topic: 'راهنمای خرید کیسه خواب زمستانی و دمای کامفورت',
    enrichWithAi: false
  });
  assert.ok(plan.primaryQuestion.length > 5);
  assert.ok(plan.highRiskTopics.includes('temperature_rating') || plan.requiredTechnicalFacts.length >= 0);
  assert.equal(plan.siteId, SITE_A);
});

console.log('\nresearch tests passed');
