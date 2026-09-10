import fs from 'fs';
import os from 'os';
import path from 'path';

// Persist into a scratch directory so the suite never touches working data.
process.env.BLOG_MANAGER_DATA_DIR =
  process.env.BLOG_MANAGER_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'blog-manager-content-'));

const { buildIndexFromLocalArticles } = await import('../intelligence/sync.js');
const { saveContentIndex } = await import('../intelligence/store.js');
const { db } = await import('../db.js');
const { decideDifferentiation } = await import('./differentiation.js');
const {
  addEvidence,
  calculateEvidenceCoverage,
  detectUnsupportedClaims,
  findSupportingEvidence,
  groupEvidenceByClaim,
  isHighRiskClaim,
  mergeEvidence
} = await import('./evidence.js');
const { collectObservedEvidence } = await import('./research.js');
const { validateContentBrief } = await import('./brief.js');
const { validateArticleDraft } = await import('./validation.js');
const { runSeoPreflight } = await import('./seoPreflight.js');
const { classifyClaimLocally, extractClaims } = await import('./factcheck.js');
const { suggestInternalLinks, auditDraftLinks } = await import('./linking.js');
const { buildVisualBrief, toVisualEngineRequest } = await import('./visualBrief.js');
const { appendVersion, invalidateChecksAfterDraftChange, restoreVersion } = await import('./versions.js');
const { buildPublishingChecklist, resolvePublishOperation } = await import('./publishing.js');
const { canTransition } = await import('./pipeline.js');
const { recommendNextArticles } = await import('./recommendations.js');
const { parseMarkdownSections, sectionsToMarkdown, slugify } = await import('./draft.js');
const {
  asObject,
  boundedNumber,
  oneOf,
  requireOneOf,
  requireString,
  stringArray
} = await import('./schema.js');

type ArticleDraft = import('./types.js').ArticleDraft;
type ContentBrief = import('./types.js').ContentBrief;
type ContentProductionJob = import('./types.js').ContentProductionJob;
type EvidenceItem = import('./types.js').EvidenceItem;
type ResearchPacket = import('./types.js').ResearchPacket;

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

// -------------------------------------------------------------
// FIXTURES
// -------------------------------------------------------------

const SITE_A = 'content-site-a';
const SITE_B = 'content-site-b';

const postsA = [
  {
    id: 11,
    title: 'راهنمای جامع خرید چادر کوهنوردی',
    slug: 'tent-buying-guide',
    content:
      '<h2>ساختار چادر</h2><p>چادر دوپوش چهار فصل برای باد و برف مناسب است و تیرک ژئودزیک پایداری بیشتری دارد.</p><h2>انتخاب اندازه</h2><p>ظرفیت اسمی چادر معمولا یک نفر کمتر از عدد روی برچسب است.</p>',
    categories: ['چادر'],
    date: '2024-03-01T00:00:00.000Z',
    modified: '2025-02-01T00:00:00.000Z'
  },
  {
    id: 12,
    title: 'راهنمای سایز پوتین کوهنوردی',
    slug: 'boot-sizing',
    content:
      '<h2>اندازه پوتین</h2><p>پوتین کوهنوردی باید نیم سایز بزرگ‌تر انتخاب شود تا در سرازیری انگشتان به جلوی کفش نخورد.</p>',
    categories: ['کفش'],
    date: '2025-01-01T00:00:00.000Z',
    modified: '2025-08-01T00:00:00.000Z'
  },
  {
    id: 13,
    title: 'نگهداری و شستشوی پوتین گورتکس',
    slug: 'goretex-care',
    content: '<p>برای شستشوی پوتین گورتکس از برس نرم استفاده کنید و نرم‌کننده نزنید تا غشای ضدآب آسیب نبیند.</p>',
    categories: ['کفش'],
    date: '2025-02-01T00:00:00.000Z',
    modified: '2025-09-01T00:00:00.000Z'
  }
];

const postsB = [
  {
    id: 21,
    title: 'راهنمای انتخاب دوچرخه کوهستان',
    slug: 'mtb-guide',
    content: '<h2>فریم</h2><p>فریم آلومینیومی سبک‌تر است و برای مسیرهای خاکی مناسب‌تر خواهد بود.</p>',
    categories: ['دوچرخه'],
    date: '2025-04-01T00:00:00.000Z',
    modified: '2025-05-01T00:00:00.000Z'
  }
];

function seedSite(siteId: string, name: string) {
  const sites = db.getSites().filter((site: any) => site.id !== siteId);
  sites.push({
    id: siteId,
    name,
    url: `https://${siteId}.test`,
    description: 'سایت آزمایشی',
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

seedSite(SITE_A, 'سایت الف');
seedSite(SITE_B, 'سایت ب');

const indexA = buildIndexFromLocalArticles(SITE_A, postsA);
const indexB = buildIndexFromLocalArticles(SITE_B, postsB);
saveContentIndex(indexA);
saveContentIndex(indexB);

const evidenceA: EvidenceItem[] = [
  addEvidence({
    siteId: SITE_A,
    claim: 'پوتین کوهنوردی باید نیم سایز بزرگ‌تر انتخاب شود',
    source: 'https://content-site-a.test/boot-sizing',
    sourceType: 'wordpress'
  }),
  addEvidence({
    siteId: SITE_A,
    claim: 'محصول «پوتین ترکینگ آلفا» در دسته‌بندی کفش در فروشگاه این سایت موجود است.',
    source: 'product:501',
    sourceType: 'product_catalog'
  }),
  addEvidence({
    siteId: SITE_A,
    claim: 'وزن پوتین ترکینگ آلفا ۱۲۰۰ گرم است',
    source: 'gemini:test-model',
    sourceType: 'ai_inference'
  })
];

const researchA: ResearchPacket = {
  id: 'rp-test',
  siteId: SITE_A,
  topic: 'انتخاب پوتین ترکینگ برای مسیر سنگی',
  primaryKeyword: 'پوتین ترکینگ',
  secondaryKeywords: ['زیره وایبرام', 'سایز پوتین'],
  searchIntent: 'commercial',
  targetAudience: 'کوهنوردان آخر هفته',
  articleObjective: 'خواننده بتواند پوتین مناسب مسیر سنگی را انتخاب کند.',
  keyQuestions: ['چه زیره‌ای برای مسیر سنگی مناسب است؟', 'سایز پوتین چطور انتخاب می‌شود؟'],
  importantClaims: ['زیره وایبرام چسبندگی بیشتری روی سنگ دارد', 'وزن پوتین ترکینگ آلفا ۱۲۰۰ گرم است'],
  productInformation: [
    { name: 'پوتین ترکینگ آلفا', category: 'کفش', knownAttributes: ['زیره وایبرام'], sourceType: 'product_catalog' }
  ],
  existingSiteKnowledge: ['اندازه پوتین'],
  internalContentReferences: [{ articleId: 12, title: 'راهنمای سایز پوتین کوهنوردی', slug: 'boot-sizing', relevance: 'مرتبط' }],
  competitorObservations: [],
  sources: [],
  evidence: evidenceA,
  unknownFacts: ['قیمت روز پوتین ترکینگ آلفا'],
  researchConfidence: 'medium',
  generatedAt: new Date().toISOString()
};

const briefA: ContentBrief = {
  id: 'cb-test',
  siteId: SITE_A,
  researchPacketId: researchA.id,
  workingTitle: 'انتخاب پوتین ترکینگ برای مسیر سنگی',
  primaryKeyword: 'پوتین ترکینگ',
  secondaryKeywords: ['زیره وایبرام', 'سایز پوتین'],
  searchIntent: 'commercial',
  targetAudience: 'کوهنوردان آخر هفته',
  userProblem: 'خواننده نمی‌داند برای مسیر سنگی چه پوتینی بخرد.',
  articleGoal: 'رسیدن به یک انتخاب مشخص',
  recommendedAngle: 'تمرکز بر مسیر سنگی و چسبندگی زیره',
  differentiationStrategy: 'برخلاف راهنمای سایز موجود، روی جنس زیره و مسیر سنگی تمرکز دارد.',
  recommendedArticleType: 'buying_guide',
  whyThisArticleShouldExist: 'سایت راهنمای سایز دارد اما راهنمای انتخاب برای مسیر سنگی ندارد.',
  howItDiffersFromExisting: 'نیت تجاری و معیار زیره، نه اندازه‌گیری سایز.',
  outline: [
    { heading: 'مسئله مسیر سنگی', purpose: 'روشن کردن مسئله', talkingPoints: [], targetWordCount: 180, evidenceNeeded: [] },
    { heading: 'معیارهای انتخاب زیره', purpose: 'معیارها', talkingPoints: [], targetWordCount: 260, evidenceNeeded: [] },
    { heading: 'انتخاب سایز درست', purpose: 'سایز', talkingPoints: [], targetWordCount: 240, evidenceNeeded: [] },
    { heading: 'جمع‌بندی و گام بعدی', purpose: 'تصمیم', talkingPoints: [], targetWordCount: 200, evidenceNeeded: [] }
  ],
  questionsToAnswer: researchA.keyQuestions,
  internalLinks: suggestInternalLinks({
    topic: 'انتخاب پوتین ترکینگ برای مسیر سنگی',
    primaryKeyword: 'پوتین ترکینگ',
    articles: indexA.articles,
    clusters: indexA.clusters,
    products: []
  }),
  productsToMention: ['پوتین ترکینگ آلفا'],
  evidenceRequirements: ['وزن واقعی پوتین از کاتالوگ'],
  visualRequirements: buildVisualBrief({
    brief: {
      workingTitle: 'انتخاب پوتین ترکینگ برای مسیر سنگی',
      primaryKeyword: 'پوتین ترکینگ',
      recommendedArticleType: 'buying_guide',
      recommendedAngle: 'تمرکز بر مسیر سنگی',
      productsToMention: ['پوتین ترکینگ آلفا'],
      targetAudience: 'کوهنوردان آخر هفته'
    },
    research: researchA
  }),
  seoRequirements: {
    primaryKeyword: 'پوتین ترکینگ',
    secondaryKeywords: ['زیره وایبرام', 'سایز پوتین'],
    titleMaxLength: 65,
    metaDescriptionRange: [120, 155],
    minWordCount: 300,
    minH2Count: 3,
    minInternalLinks: 1,
    requireFaq: true,
    slugStyle: 'kebab-latin'
  },
  faqOpportunities: [],
  risks: [],
  mustNotFabricate: ['قیمت روز پوتین ترکینگ آلفا', 'وزن پوتین ترکینگ آلفا ۱۲۰۰ گرم است'],
  version: 1,
  createdAt: new Date().toISOString()
};

const goodBody = `# انتخاب پوتین ترکینگ برای مسیر سنگی

پوتین ترکینگ مناسب مسیر سنگی باید چسبندگی و قفل پاشنه خوبی داشته باشد. در این راهنما معیارهای انتخاب را بر اساس تجربهٔ مسیرهای سنگی مرور می‌کنیم تا انتخاب شما دقیق‌تر شود و پایتان در سرازیری آسیب نبیند. انتخاب درست فقط به برند بستگی ندارد و معیارهای فنی مشخصی دارد که باید یکی‌یکی بررسی شوند.

## مسئله مسیر سنگی
مسیر سنگی فشار زیادی به لبهٔ کفش می‌آورد. اگر زیره نرم باشد، لبهٔ سنگ به کف پا منتقل می‌شود و بعد از چند ساعت پیمایش درد می‌گیرید. همین موضوع باعث می‌شود انتخاب پوتین برای این مسیرها با انتخاب برای خاک نرم تفاوت داشته باشد و نیاز به بررسی جداگانه دارد. مسیرهای آذرین و گرانیتی معمولاً لبه‌های تیزتری دارند و نیاز به میان‌لایهٔ سخت‌تر دارند.

## معیارهای انتخاب زیره
زیره وایبرام روی سنگ خشک چسبندگی بهتری نشان می‌دهد و آج عمیق‌تر در سنگ‌ریزه بهتر قفل می‌شود. سختی میان‌لایه هم مهم است چون فشار لبهٔ سنگ را پخش می‌کند. [پوتین ترکینگ](/boot-sizing) را با همین معیار بسنجید و به جنس واسط زیره دقت کنید. اگر مسیر خیس است، چسبندگی روی سنگ مرطوب را جداگانه ارزیابی کنید و به نرمی لبهٔ زیره هم توجه داشته باشید.

## انتخاب سایز درست
پوتین کوهنوردی باید نیم سایز بزرگ‌تر انتخاب شود تا در سرازیری انگشتان به جلوی کفش نخورد. با جوراب ضخیم پرو کنید و پاشنه را در حالت شیب امتحان کنید تا حرکت اضافه نداشته باشد و تاول نزنید. عرض پنجه را هم بررسی کنید چون فشردگی جانبی در پیمایش طولانی باعث بی‌حسی انگشتان می‌شود و کیفیت تجربه را پایین می‌آورد.

## جمع‌بندی و گام بعدی
اگر بیشتر مسیرهای شما سنگی است، پوتین با زیره وایبرام و میان‌لایهٔ سخت‌تر انتخاب کنید. سپس سایز را با جوراب واقعی پیمایش پرو کنید و پیش از سفر طولانی چند پیمایش کوتاه با آن بروید. بعد از انتخاب، نگهداری و شستشو را از راهنمای مراقبت گورتکس پیگیری کنید تا عمر مفید پوتین بیشتر شود و عملکرد زیره حفظ گردد.`;

function makeDraft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  const content = overrides.content ?? goodBody;
  return {
    id: 'draft-test',
    siteId: SITE_A,
    jobId: 'job-test',
    briefId: briefA.id,
    version: 1,
    title: 'انتخاب پوتین ترکینگ برای مسیر سنگی',
    slug: 'trekking-boot-rocky-trail',
    metaDescription:
      'راهنمای انتخاب پوتین ترکینگ برای مسیر سنگی: معیار زیره، سختی میان‌لایه و انتخاب سایز درست برای پیمایش بدون تاول و درد کف پا.',
    excerpt: 'معیارهای انتخاب پوتین ترکینگ برای مسیرهای سنگی.',
    content,
    sections: parseMarkdownSections(content),
    tags: ['پوتین ترکینگ', 'زیره وایبرام'],
    faq: [
      { question: 'زیره وایبرام برای سنگ بهتر است؟', answer: 'روی سنگ خشک چسبندگی بهتری نشان می‌دهد.' },
      { question: 'چه سایزی بخرم؟', answer: 'نیم سایز بزرگ‌تر با جوراب ضخیم.' }
    ],
    internalLinks: briefA.internalLinks,
    productsMentioned: ['پوتین ترکینگ آلفا'],
    claims: [
      { claim: 'پوتین کوهنوردی باید نیم سایز بزرگ‌تر انتخاب شود', sourceHint: 'wordpress' },
      { claim: 'وزن پوتین ترکینگ آلفا ۱۲۰۰ گرم است', sourceHint: 'ai_inference' }
    ],
    contentHash: 'testhash00000000',
    generatedAt: new Date().toISOString(),
    source: 'gemini',
    ...overrides
  } as ArticleDraft;
}

function makeJob(overrides: Partial<ContentProductionJob> = {}): ContentProductionJob {
  const now = new Date().toISOString();
  return {
    id: 'job-test',
    siteId: SITE_A,
    stage: 'seo_ready',
    status: 'QUEUED',
    mode: 'CREATE',
    topic: briefA.workingTitle,
    primaryKeyword: briefA.primaryKeyword,
    searchIntent: 'commercial',
    internalLinks: briefA.internalLinks,
    visualAssetIds: [],
    versions: [],
    publishingHistory: [],
    stageHistory: [{ stage: 'idea', at: now }],
    failures: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as ContentProductionJob;
}

// -------------------------------------------------------------
// TESTS
// -------------------------------------------------------------

await run('research packet: observed evidence is verified, inference is not', () => {
  const observed = collectObservedEvidence({
    siteId: SITE_A,
    articles: indexA.articles,
    products: [
      {
        id: 501,
        name: 'پوتین ترکینگ آلفا',
        slug: 'alpha-boot',
        categories: ['کفش'],
        tags: [],
        images: [],
        attributes: ['زیره وایبرام'],
        sourceType: 'observed'
      }
    ],
    userProvidedFacts: ['این پوتین در انبار تهران موجود است.'],
    wordpressUrl: 'https://content-site-a.test'
  });

  assert(observed.evidence.every((item) => item.verified), 'observed evidence must be verified');
  assert(
    observed.sources.some((source) => source.sourceType === 'wordpress') &&
      observed.sources.some((source) => source.sourceType === 'product_catalog') &&
      observed.sources.some((source) => source.sourceType === 'user_input'),
    'each real source type is registered'
  );
  assert(observed.sources.every((source) => !source.url || source.url.startsWith('https://')), 'no fabricated urls');

  const inferred = addEvidence({
    siteId: SITE_A,
    claim: 'این پوتین سبک‌ترین گزینهٔ بازار است',
    source: 'gemini:test',
    sourceType: 'ai_inference'
  });
  assert(!inferred.verified, 'ai inference is never verified');
  assert(inferred.status === 'NEEDS_VERIFICATION', `expected NEEDS_VERIFICATION, got ${inferred.status}`);
  assert(inferred.confidence === 'low', 'ai inference confidence is low');
});

await run('evidence: coverage, grouping and unsupported-claim detection', () => {
  const claims = [
    'پوتین کوهنوردی باید نیم سایز بزرگ‌تر انتخاب شود',
    'وزن پوتین ترکینگ آلفا ۱۲۰۰ گرم است',
    'قیمت این پوتین ۴۵۰۰۰۰۰ تومان است'
  ];
  const coverage = calculateEvidenceCoverage(claims, evidenceA);
  assert(coverage.totalClaims === 3, `expected 3 claims, got ${coverage.totalClaims}`);
  assert(coverage.supportedClaims === 1, `expected 1 supported, got ${coverage.supportedClaims}`);
  assert(coverage.coverageRatio < 0.5, 'coverage ratio reflects missing sources');
  assert(coverage.highRiskClaims.length >= 2, 'numeric weight and price are high risk');

  const unsupported = detectUnsupportedClaims(claims, evidenceA);
  assert(unsupported.includes('قیمت این پوتین ۴۵۰۰۰۰۰ تومان است'), 'price claim is unsupported');
  assert(!unsupported.includes(claims[0]), 'wordpress-backed claim is supported');

  assert(isHighRiskClaim('دمای کامفورت این کیسه خواب ۵ درجه است'), 'temperature is high risk');
  assert(!isHighRiskClaim('این پوتین برای مسیر سنگی مناسب‌تر است'), 'qualitative claim is not high risk');

  const grouped = groupEvidenceByClaim(evidenceA);
  assert(grouped.size === 3, `expected 3 groups, got ${grouped.size}`);
  assert(findSupportingEvidence(claims[0], evidenceA)?.verified === true, 'lexical match finds the wordpress source');

  const merged = mergeEvidence(
    [addEvidence({ siteId: SITE_A, claim: 'ادعای الف', source: 'gemini', sourceType: 'ai_inference' })],
    [addEvidence({ siteId: SITE_A, claim: 'ادعای الف', source: 'wp', sourceType: 'wordpress' })]
  );
  assert(merged.length === 1 && merged[0].verified, 'verified evidence wins on merge');
});

await run('differentiation: duplicate topic is rejected, supporting topic is allowed', () => {
  const duplicate = decideDifferentiation({
    siteId: SITE_A,
    topic: 'راهنمای جامع خرید چادر کوهنوردی',
    primaryKeyword: 'چادر کوهنوردی',
    searchIntent: 'commercial',
    articles: indexA.articles
  });
  assert(
    duplicate.recommendation === 'UPDATE_EXISTING' ||
      duplicate.recommendation === 'REJECT_DUPLICATE' ||
      duplicate.recommendation === 'MERGE_EXISTING',
    `exact title should not create new, got ${duplicate.recommendation}`
  );
  assert(duplicate.isDuplicate, 'exact title is a duplicate');
  assert(duplicate.reasons.length > 0, 'a decision always carries reasons');
  assert(duplicate.targetArticleId !== undefined, 'non-create decisions name the target article');

  const supporting = decideDifferentiation({
    siteId: SITE_A,
    topic: 'نحوه بستن بند پوتین در سرازیری',
    primaryKeyword: 'بستن بند پوتین',
    searchIntent: 'informational',
    articles: indexA.articles
  });
  assert(supporting.recommendation === 'CREATE_NEW', `expected CREATE_NEW, got ${supporting.recommendation}`);
  assert(supporting.cannibalizationRisk !== 'severe', 'supporting article is not severe risk');
});

await run('differentiation: empty index cannot claim novelty', () => {
  const decision = decideDifferentiation({
    siteId: SITE_A,
    topic: 'موضوعی کاملاً تازه',
    primaryKeyword: 'موضوع تازه',
    searchIntent: 'informational',
    articles: []
  });
  assert(decision.recommendation === 'NEEDS_REVIEW', `expected NEEDS_REVIEW, got ${decision.recommendation}`);
  assert(decision.confidence === 'low', 'confidence is low without an index');
});

await run('brief validation rejects a brief without outline or differentiation', () => {
  assert(validateContentBrief(briefA).valid, 'complete brief is valid');
  const thin = validateContentBrief({
    ...briefA,
    outline: [briefA.outline[0]],
    differentiationStrategy: '',
    questionsToAnswer: []
  });
  assert(!thin.valid, 'thin brief is rejected');
  assert(thin.problems.length >= 3, `expected several problems, got ${thin.problems.length}`);
  assert(!validateContentBrief(undefined).valid, 'missing brief is invalid');
});

await run('internal linking: relationship types, relevance and no link farm', () => {
  const links = suggestInternalLinks({
    topic: 'انتخاب پوتین ترکینگ برای مسیر سنگی',
    primaryKeyword: 'پوتین ترکینگ',
    articles: indexA.articles,
    clusters: indexA.clusters,
    products: [],
    max: 3
  });
  assert(links.length > 0, 'related boot articles produce links');
  assert(links.length <= 3, 'max is respected');
  assert(
    links.every((link) => link.relationshipType && link.reason && link.placement && link.anchorText),
    'each suggestion explains itself'
  );
  assert(
    links.every((link) => link.relevance >= 20),
    'irrelevant articles are filtered out'
  );
  assert(new Set(links.map((link) => link.anchorText)).size === links.length, 'anchors are not duplicated');

  const unrelated = suggestInternalLinks({
    topic: 'دستور پخت کیک شکلاتی',
    primaryKeyword: 'کیک شکلاتی',
    articles: indexA.articles,
    clusters: indexA.clusters
  });
  assert(unrelated.length === 0, 'an unrelated topic gets no links');

  const audit = auditDraftLinks({ content: goodBody, suggestions: links });
  assert(audit.markdownLinkCount >= 1, 'markdown links are counted');
});

await run('article validation: clean draft passes, broken draft fails deterministically', () => {
  const clean = validateArticleDraft({ draft: makeDraft(), brief: briefA, research: researchA });
  assert(clean.passed, `clean draft should pass: ${clean.errors.map((error) => error.message).join(' | ')}`);
  assert(clean.metrics.keywordInTitle, 'keyword is detected in the title');
  assert(clean.metrics.wordCount > 200, 'word count is measured');

  const repeated = '## معیارهای انتخاب زیره\n\nزیره وایبرام روی سنگ خشک چسبندگی بهتری نشان می‌دهد و آج عمیق‌تر در سنگ‌ریزه بهتر قفل می‌شود و همین موضوع تفاوت اصلی است.';
  const broken = validateArticleDraft({
    draft: makeDraft({
      title: 'یک عنوان بی‌ربط',
      metaDescription: '',
      content: `# یک عنوان بی‌ربط\n\nمقدمه کوتاه.\n\n${repeated}\n\n${repeated}`,
      faq: [],
      productsMentioned: ['کیسه خواب ناشناخته'],
      claims: [{ claim: 'قیمت این پوتین ۴۵۰۰۰۰۰ تومان است', sourceHint: 'ai_inference' }]
    }),
    brief: briefA,
    research: researchA
  });
  assert(!broken.passed, 'broken draft fails');
  assert(broken.errors.some((error) => error.id === 'keyword_missing_in_title'), 'missing keyword is an error');
  assert(broken.errors.some((error) => error.id === 'meta_missing'), 'missing meta is an error');
  assert(broken.errors.some((error) => error.id === 'unknown_products'), 'off-catalogue product is an error');
  assert(broken.needsVerification.length > 0, 'unsourced price needs verification');

  const again = validateArticleDraft({ draft: makeDraft(), brief: briefA, research: researchA });
  assert(again.score === clean.score, 'validation score is deterministic');
});

await run('article validation flags missing brief sections', () => {
  const content = '# انتخاب پوتین ترکینگ برای مسیر سنگی\n\n' + 'پوتین ترکینگ مناسب مسیر سنگی. '.repeat(60);
  const report = validateArticleDraft({ draft: makeDraft({ content }), brief: briefA, research: researchA });
  assert(report.metrics.missingSections.length >= 3, 'sections from the brief are tracked');
  assert(
    report.errors.some((error) => error.id === 'missing_sections'),
    'more than two missing sections is an error'
  );
});

await run('fact check: verdicts come from evidence, not from the model', () => {
  const draft = makeDraft();
  const claims = extractClaims(draft);
  assert(claims.length >= 2, `expected extracted claims, got ${claims.length}`);

  const supported = classifyClaimLocally('پوتین کوهنوردی باید نیم سایز بزرگ‌تر انتخاب شود', evidenceA);
  assert(supported.verdict === 'SUPPORTED', `expected SUPPORTED, got ${supported.verdict}`);
  assert(supported.sourceType === 'wordpress', 'source type is carried through');

  const numeric = classifyClaimLocally('وزن پوتین ترکینگ آلفا ۱۲۰۰ گرم است', evidenceA);
  assert(numeric.verdict === 'NEEDS_VERIFICATION', `numeric claim must need verification, got ${numeric.verdict}`);
  assert(numeric.requiresAction, 'unverified number requires action');

  const opinion = classifyClaimLocally('بهتر است پوتین را با جوراب ضخیم پرو کنید', evidenceA);
  assert(opinion.verdict === 'OPINION', `expected OPINION, got ${opinion.verdict}`);

  const invented = classifyClaimLocally('این برند در سال ۱۹۷۰ در ایتالیا تأسیس شد', evidenceA);
  assert(
    invented.verdict === 'NEEDS_VERIFICATION' || invented.verdict === 'UNSUPPORTED',
    `unsourced history must not be supported, got ${invented.verdict}`
  );
});

await run('seo preflight: recommendations name the actual failing element', () => {
  const clean = runSeoPreflight({
    draft: makeDraft(),
    brief: briefA,
    decision: {
      recommendation: 'CREATE_NEW',
      confidence: 'high',
      similarityScore: 12,
      cannibalizationRisk: 'low',
      isDuplicate: false,
      isCannibalization: false,
      isLegitimateSupporting: false,
      shouldUpdateExisting: false,
      reasons: [],
      matchedArticles: []
    },
    featuredImageUrl: '/api/media/generated/x.png',
    featuredImageAlt: 'پوتین ترکینگ روی سنگ'
  });
  assert(clean.score >= 80, `clean draft should score well, got ${clean.score}`);
  assert(clean.checks.some((check) => check.id === 'canonical' && check.status === 'pass'), 'canonical readiness');

  const weak = runSeoPreflight({
    draft: makeDraft({ title: 'یک عنوان بی‌ربط', metaDescription: '', slug: '' }),
    brief: briefA
  });
  assert(!weak.passed, 'weak draft fails preflight');
  assert(weak.recommendations.length > 0, 'failures produce recommendations');
  assert(
    weak.recommendations.some((line) => line.includes(briefA.primaryKeyword)),
    'recommendation references the real keyword'
  );
  assert(
    weak.checks.some((check) => check.id === 'uniqueness' && check.status === 'unknown'),
    'uniqueness is unknown without a differentiation decision'
  );
});

await run('visual brief maps the content brief into the existing visual engine', () => {
  const visual = buildVisualBrief({
    brief: {
      workingTitle: briefA.workingTitle,
      primaryKeyword: briefA.primaryKeyword,
      recommendedArticleType: 'comparison',
      recommendedAngle: 'تمرکز بر مسیر سنگی',
      productsToMention: ['پوتین ترکینگ آلفا'],
      targetAudience: briefA.targetAudience
    },
    research: researchA
  });
  assert(visual.requiredSubject === 'پوتین ترکینگ آلفا', 'catalogue product becomes the subject');
  assert(visual.technicalFacts.includes('زیره وایبرام'), 'only catalogue attributes become technical facts');
  assert(visual.prohibitedConcepts.length >= 3, 'generic imagery is explicitly prohibited');

  const request = toVisualEngineRequest({ brief: briefA, visualBrief: visual, draft: makeDraft(), siteId: SITE_A });
  assert(request.articleBrief.visualIntent?.mainSubjectHint === visual.requiredSubject, 'subject reaches the engine');
  assert(request.articleBrief.primaryKeyword === briefA.primaryKeyword, 'keyword reaches the engine');
  assert(request.imageType === 'HERO', 'hero image is requested');
});

await run('versioning: history is append-only and restore adds a new version', () => {
  const job = makeJob({ draft: makeDraft() });
  appendVersion(job, { action: 'AI_GENERATED', source: 'gemini', title: 'نسخه ۱', content: 'محتوای نسخهٔ اول' });
  appendVersion(job, { action: 'USER_EDITED', source: 'user', title: 'نسخه ۲', content: 'محتوای نسخهٔ دوم' });
  assert(job.versions.length === 2, 'two versions recorded');
  assert(job.versions[0].version === 1 && job.versions[1].version === 2, 'versions increment');
  assert(job.versions[0].contentHash !== job.versions[1].contentHash, 'each version has its own hash');

  const restored = restoreVersion(job, 1, 'بازگشت به نسخهٔ اول');
  assert(restored !== null, 'restore succeeds');
  assert(job.versions.length === 3, 'restore appends rather than replaces');
  assert(job.versions[0].title === 'نسخه ۱', 'older version is untouched');
  assert(job.draft?.content === 'محتوای نسخهٔ اول', 'draft rolled back');
  assert(job.stage === 'needs_revision', 'restored job needs revision');
  assert(job.validation === undefined && job.factCheck === undefined, 'stale reports are cleared');
  assert(restoreVersion(job, 99) === null, 'unknown version cannot be restored');
});

await run('draft edits invalidate stale fact-check and seo reports', () => {
  const draft = makeDraft();
  const decision = decideDifferentiation({
    siteId: SITE_A,
    topic: 'راهنمای پوتین',
    primaryKeyword: 'پوتین کوهنوردی',
    searchIntent: 'informational',
    articles: []
  });
  const job = makeJob({
    draft,
    stage: 'approved',
    validation: validateArticleDraft({ draft, brief: briefA, research: researchA }),
    factCheck: {
      id: 'fc-stale',
      siteId: SITE_A,
      draftVersion: 1,
      checkedAt: new Date().toISOString(),
      claims: [],
      summary: {
        SUPPORTED: 1,
        PARTIALLY_SUPPORTED: 0,
        UNSUPPORTED: 0,
        CONTRADICTED: 0,
        NEEDS_VERIFICATION: 0,
        OPINION: 0
      },
      evidenceCoverage: {
        totalClaims: 1,
        supportedClaims: 1,
        unsupportedClaims: 0,
        needsVerification: 0,
        coverageRatio: 1,
        highRiskClaims: [],
        confidence: 'high'
      },
      riskLevel: 'low',
      blocking: []
    },
    seoPreflight: runSeoPreflight({
      draft,
      brief: briefA,
      decision
    }),
    publishingChecklist: buildPublishingChecklist({
      job: makeJob({ draft, stage: 'approved' })
    })
  });

  job.draft = { ...job.draft!, content: `${job.draft!.content}\n\n## بخش جدید\nمتن تازه` };
  invalidateChecksAfterDraftChange(job);

  assert(job.factCheck === undefined, 'fact check cleared after draft change');
  assert(job.seoPreflight === undefined, 'seo preflight cleared after draft change');
  assert(job.publishingChecklist === undefined, 'publishing checklist cleared after draft change');
  assert(job.stage === 'needs_revision', 'approved job returns to needs_revision');

  const checklist = buildPublishingChecklist({ job });
  assert(!checklist.canPublish, 'publish blocked until checks re-run');
  assert(checklist.blocking.some((item) => item.id === 'fact_check'), 'fact check becomes blocking again');
});

await run('publishing checklist blocks on missing validation and fact check', () => {
  const bare = buildPublishingChecklist({ job: makeJob({ draft: makeDraft() }) });
  assert(!bare.canPublish, 'publishing is blocked before the checks have run');
  assert(bare.blocking.some((item) => item.id === 'validation'), 'validation is a blocking item');
  assert(bare.blocking.some((item) => item.id === 'fact_check'), 'fact check is a blocking item');

  const ready = buildPublishingChecklist({
    job: makeJob({
      draft: makeDraft(),
      stage: 'approved',
      research: {
        ...researchA,
        qualityGate: {
          status: 'PASS',
          reasons: ['evidence present'],
          blocking: [],
          warnings: [],
          assessedAt: new Date().toISOString()
        }
      },
      validation: validateArticleDraft({ draft: makeDraft(), brief: briefA, research: researchA }),
      factCheck: {
        id: 'fc',
        siteId: SITE_A,
        draftVersion: 1,
        checkedAt: new Date().toISOString(),
        claims: [],
        summary: {
          SUPPORTED: 2,
          PARTIALLY_SUPPORTED: 0,
          UNSUPPORTED: 0,
          CONTRADICTED: 0,
          NEEDS_VERIFICATION: 0,
          OPINION: 0
        },
        evidenceCoverage: {
          totalClaims: 2,
          supportedClaims: 2,
          unsupportedClaims: 0,
          needsVerification: 0,
          coverageRatio: 1,
          highRiskClaims: [],
          confidence: 'high'
        },
        riskLevel: 'low',
        blocking: []
      },
      decision: {
        recommendation: 'CREATE_NEW',
        confidence: 'high',
        similarityScore: 10,
        cannibalizationRisk: 'none',
        isDuplicate: false,
        isCannibalization: false,
        isLegitimateSupporting: false,
        shouldUpdateExisting: false,
        reasons: [],
        matchedArticles: []
      }
    }),
    categories: ['کفش'],
    featuredImageUrl: '/api/media/generated/x.png',
    featuredImageAlt: 'پوتین روی سنگ'
  });
  assert(ready.canPublish, `checklist should pass: ${ready.blocking.map((item) => item.detail).join(' | ')}`);
  assert(ready.warnings.every((item) => !item.blocking), 'warnings are overridable');

  const contradicted = buildPublishingChecklist({
    job: makeJob({
      draft: makeDraft(),
      validation: validateArticleDraft({ draft: makeDraft(), brief: briefA, research: researchA }),
      factCheck: {
        id: 'fc2',
        siteId: SITE_A,
        draftVersion: 1,
        checkedAt: new Date().toISOString(),
        claims: [],
        summary: {
          SUPPORTED: 0,
          PARTIALLY_SUPPORTED: 0,
          UNSUPPORTED: 0,
          CONTRADICTED: 1,
          NEEDS_VERIFICATION: 0,
          OPINION: 0
        },
        evidenceCoverage: {
          totalClaims: 1,
          supportedClaims: 0,
          unsupportedClaims: 1,
          needsVerification: 0,
          coverageRatio: 0,
          highRiskClaims: [],
          confidence: 'low'
        },
        riskLevel: 'high',
        blocking: ['ادعای متناقض']
      }
    })
  });
  assert(!contradicted.canPublish, 'a contradicted claim blocks publishing');
});

await run('publishing state transitions follow the lifecycle', () => {
  assert(canTransition('idea', 'researched'), 'idea → researched');
  assert(canTransition('draft_ready', 'fact_checked'), 'draft_ready → fact_checked');
  assert(canTransition('approved', 'publishing'), 'approved → publishing');
  assert(canTransition('publishing', 'published'), 'publishing → published');
  assert(!canTransition('idea', 'published'), 'idea cannot jump to published');
  assert(!canTransition('brief_ready', 'approved'), 'brief cannot be approved directly');
  assert(canTransition('published', 'needs_revision'), 'published → needs_revision');
  assert(canTransition('needs_revision', 'drafting'), 'needs_revision re-enters the pipeline');
});

await run('UPDATE jobs remap publish ops to update the same WordPress post', () => {
  const updateJob = makeJob({
    mode: 'UPDATE',
    wordpressPostId: 42,
    originalWordpressPostId: 42,
    draft: makeDraft()
  });
  assert(
    resolvePublishOperation(updateJob, 'PUBLISH') === 'UPDATE_PUBLISHED_ARTICLE',
    'PUBLISH remaps to UPDATE_PUBLISHED_ARTICLE'
  );
  assert(
    resolvePublishOperation(updateJob, 'SAVE_WORDPRESS_DRAFT') === 'UPDATE_WORDPRESS_DRAFT',
    'draft save remaps to UPDATE_WORDPRESS_DRAFT'
  );
  assert(
    resolvePublishOperation(makeJob({ mode: 'CREATE', draft: makeDraft() }), 'PUBLISH') === 'PUBLISH',
    'CREATE jobs keep PUBLISH'
  );
});

await run('multi-site isolation: production data never crosses sites', async () => {
  const { createProductionJob } = await import('./pipeline.js');
  const { listJobs, getJob } = await import('./store.js');

  const jobA = createProductionJob({ siteId: SITE_A, topic: 'انتخاب پوتین ترکینگ برای مسیر سنگی' });
  const jobB = createProductionJob({ siteId: SITE_B, topic: 'انتخاب دوچرخه کوهستان برای مسیر خاکی' });

  assert(listJobs(SITE_A).every((job) => job.siteId === SITE_A), 'site A only sees its own jobs');
  assert(listJobs(SITE_B).every((job) => job.siteId === SITE_B), 'site B only sees its own jobs');
  assert(getJob(SITE_B, jobA.id) === undefined, "site B cannot read site A's job");
  assert(getJob(SITE_A, jobB.id) === undefined, "site A cannot read site B's job");

  // The differentiation decision must be computed against the right index.
  assert(jobA.decision !== undefined && jobB.decision !== undefined, 'both jobs get a decision');
  const recA = recommendNextArticles({ siteId: SITE_A, limit: 20 });
  const recB = recommendNextArticles({ siteId: SITE_B, limit: 20 });
  const titlesB = new Set(recB.recommendations.map((row) => row.title));
  assert(
    recA.recommendations.every((row) => !titlesB.has(row.title) || row.title.length === 0),
    'recommendations do not leak between sites'
  );
});

await run('what to write next: every row explains itself without invented metrics', () => {
  const { recommendations, indexEmpty } = recommendNextArticles({ siteId: SITE_A, limit: 10, currentMonth: 5 });
  assert(!indexEmpty, 'site A has an index');
  assert(recommendations.length > 0, 'recommendations are produced');
  assert(recommendations.every((row) => row.whyBullets.length > 0), 'every recommendation has reasons');
  assert(
    recommendations.every((row) => row.evidenceAvailability.status !== undefined && row.decision !== undefined),
    'evidence availability and decision are attached'
  );
  assert(
    recommendations.every((row) => row.scoringFactors.every((factor) => factor.sourceType && factor.evidence)),
    'each scoring factor carries its source'
  );
  const serialized = JSON.stringify(recommendations);
  assert(!/searchVolume|monthlySearches|"volume"|estimatedTraffic/i.test(serialized), 'no invented volume/traffic fields');

  const sorted = recommendations.every(
    (row, idx) => idx === 0 || recommendations[idx - 1].priority >= row.priority
  );
  assert(sorted, 'recommendations are ranked by priority');
});

await run('malformed AI responses produce controlled errors', () => {
  let threw = false;
  try {
    requireString(undefined, 'title');
  } catch (err: any) {
    threw = err?.name === 'AiSchemaError' && err.field === 'title';
  }
  assert(threw, 'missing required string raises AiSchemaError with the field name');

  threw = false;
  try {
    asObject([1, 2, 3], 'brief');
  } catch (err: any) {
    threw = err?.name === 'AiSchemaError';
  }
  assert(threw, 'an array is not accepted where an object is required');

  threw = false;
  try {
    stringArray('not-an-array', { field: 'keyQuestions' });
  } catch (err: any) {
    threw = err?.name === 'AiSchemaError' && err.field === 'keyQuestions';
  }
  assert(threw, 'a string is not silently coerced into an array');

  assert(stringArray([1, 'ok', null, ' spaced ']).join(',') === 'ok,spaced', 'non-strings are dropped and values trimmed');
  assert(oneOf('COMMERCIAL', ['informational', 'commercial'] as const, 'informational') === 'commercial', 'enum match is case-insensitive');
  assert(oneOf('nonsense', ['informational', 'commercial'] as const, 'informational') === 'informational', 'unknown enum falls back');
  assert(boundedNumber(9999, { min: 80, max: 900, fallback: 250 }) === 900, 'numbers are clamped');
  assert(boundedNumber('abc', { min: 80, max: 900, fallback: 250 }) === 250, 'unparsable numbers fall back');

  threw = false;
  try {
    requireOneOf('purple', ['pass', 'fail'] as const, 'status');
  } catch (err: any) {
    threw = err?.name === 'AiSchemaError';
  }
  assert(threw, 'a required enum rejects an unknown value');
});

await run('draft helpers: markdown sections round-trip and slugs stay url-safe', () => {
  const sections = parseMarkdownSections(goodBody);
  assert(sections.length >= 5, `expected intro + 4 sections, got ${sections.length}`);
  assert(sections[0].heading === 'مقدمه', 'text before the first ## becomes the intro');
  assert(sections.some((section) => section.heading === 'انتخاب سایز درست'), 'headings are preserved');

  const rebuilt = sectionsToMarkdown('انتخاب پوتین ترکینگ برای مسیر سنگی', sections);
  assert(parseMarkdownSections(rebuilt).length === sections.length, 'sections survive a round-trip');

  assert(slugify('Trekking Boot Guide 2026') === 'trekking-boot-guide-2026', 'latin slug is kebab-cased');
  assert(!slugify('راهنمای پوتین').includes(' '), 'persian slug has no spaces');
});

console.log('\ncontent production tests passed');
