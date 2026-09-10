import crypto from 'crypto';
import { db } from '../db.js';
import { generateJsonContent } from '../aiClient.js';
import { getContentIndex } from '../intelligence/store.js';
import { inferArticleKind } from '../intelligence/text.js';
import type { ArticleKind, IndexedArticle } from '../intelligence/types.js';
import { decideDifferentiation } from './differentiation.js';
import { suggestInternalLinks } from './linking.js';
import { buildVisualBrief } from './visualBrief.js';
import { isHighRiskClaim } from './evidence.js';
import { asObject, boundedNumber, objectArray, oneOf, requireString, schemaFailure, stringArray } from './schema.js';
import type {
  BriefSection,
  ContentBrief,
  DifferentiationDecision,
  ResearchPacket,
  SeoRequirements
} from './types.js';

const ARTICLE_KINDS: ArticleKind[] = [
  'buying_guide',
  'how_to',
  'tutorial',
  'comparison',
  'product_review',
  'list',
  'informational',
  'technical'
];

function briefId(siteId: string, topic: string, version: number): string {
  return `cb-${crypto.createHash('sha1').update(`${siteId}::${topic}::${version}`).digest('hex').slice(0, 12)}`;
}

function seoRequirements(params: {
  primaryKeyword: string;
  secondaryKeywords: string[];
  articleType: ArticleKind;
  internalLinkCount: number;
}): SeoRequirements {
  const depth = params.articleType === 'comparison' || params.articleType === 'buying_guide' ? 1400 : 1000;
  return {
    primaryKeyword: params.primaryKeyword,
    secondaryKeywords: params.secondaryKeywords.slice(0, 8),
    titleMaxLength: 65,
    metaDescriptionRange: [120, 155],
    minWordCount: depth,
    minH2Count: 4,
    minInternalLinks: Math.min(3, params.internalLinkCount),
    requireFaq: true,
    slugStyle: 'kebab-latin'
  };
}

function fallbackOutline(articleType: ArticleKind, questions: string[]): BriefSection[] {
  const base: Array<{ heading: string; purpose: string }> = [
    { heading: 'مسئلهٔ مخاطب', purpose: 'روشن کردن اینکه خواننده با چه تصمیم یا مشکلی سراغ این مقاله آمده' },
    { heading: 'معیارهای تصمیم‌گیری', purpose: 'معیارهایی که انتخاب درست را ممکن می‌کند' },
    articleType === 'comparison'
      ? { heading: 'مقایسهٔ گزینه‌ها', purpose: 'کنار هم گذاشتن گزینه‌ها بر اساس همان معیارها' }
      : { heading: 'مراحل عملی', purpose: 'ترتیب کارهایی که خواننده باید انجام دهد' },
    { heading: 'اشتباهات رایج', purpose: 'خطاهایی که تجربهٔ میدانی نشان می‌دهد' },
    { heading: 'جمع‌بندی و گام بعدی', purpose: 'یک تصمیم روشن و اقدام بعدی' }
  ];
  return base.map((section, idx) => ({
    ...section,
    talkingPoints: questions.slice(idx * 2, idx * 2 + 2),
    targetWordCount: idx === 0 ? 180 : 260,
    evidenceNeeded: []
  }));
}

function parseOutline(value: unknown, articleType: ArticleKind, questions: string[]): BriefSection[] {
  const rows = objectArray(value, 'outline', { max: 10 });
  const sections = rows
    .map((row) => ({
      heading: String(row.heading || '').trim(),
      purpose: String(row.purpose || '').trim(),
      talkingPoints: stringArray(row.talkingPoints, { max: 6 }),
      targetWordCount: boundedNumber(row.targetWordCount, { min: 80, max: 900, fallback: 250 }),
      evidenceNeeded: stringArray(row.evidenceNeeded, { max: 6 })
    }))
    .filter((section) => section.heading.length > 0);
  return sections.length >= 3 ? sections : fallbackOutline(articleType, questions);
}

export interface GenerateBriefParams {
  research: ResearchPacket;
  version?: number;
  decision?: DifferentiationDecision;
}

/**
 * Produces the ContentBrief that drafting is grounded in. Structure, links,
 * SEO targets, differentiation and the "must not fabricate" list are computed;
 * Gemini contributes the editorial reasoning (angle, problem, outline).
 */
export async function generateContentBrief(params: GenerateBriefParams): Promise<ContentBrief> {
  const { research } = params;
  const site = db.getSiteById(research.siteId);
  if (!site) throw new Error('Site not found');

  const index = getContentIndex(research.siteId);
  const version = params.version || 1;

  const decision =
    params.decision ||
    decideDifferentiation({
      siteId: research.siteId,
      topic: research.topic,
      primaryKeyword: research.primaryKeyword,
      searchIntent: research.searchIntent,
      articles: index.articles
    });

  const clusterId = findClusterId(index.articles, decision.targetArticleId);
  const internalLinks = suggestInternalLinks({
    topic: research.topic,
    primaryKeyword: research.primaryKeyword,
    clusterId,
    articles: index.articles,
    clusters: index.clusters,
    products: index.products
  });

  const articleType = inferArticleKind(research.topic);
  const forbiddenTitles = decision.matchedArticles.slice(0, 5).map((match) => match.title);

  const prompt = `TOPIC: ${research.topic}
PRIMARY KEYWORD: ${research.primaryKeyword}
SEARCH INTENT: ${research.searchIntent}
AUDIENCE: ${research.targetAudience || 'unspecified'}
OBJECTIVE: ${research.articleObjective}

KEY QUESTIONS THE ARTICLE MUST ANSWER:
${research.keyQuestions.map((question) => `- ${question}`).join('\n')}

FACTS THIS SITE CAN ACTUALLY VERIFY:
${research.evidence
  .filter((item) => item.verified)
  .slice(0, 15)
  .map((item) => `- ${item.claim}`)
  .join('\n') || '- (none verified yet)'}

FACTS THAT ARE NOT VERIFIABLE (never state these as fact):
${research.unknownFacts.map((fact) => `- ${fact}`).join('\n') || '- (none listed)'}

EXISTING ARTICLES THIS MUST NOT DUPLICATE:
${forbiddenTitles.map((title) => `- ${title}`).join('\n') || '- (no close matches)'}

DIFFERENTIATION DECISION FROM THE SYSTEM: ${decision.recommendation}

Write the editorial plan for this one article. Do not invent search volume,
rankings, competitor traffic, prices or specifications.

Return JSON only:
{
  "workingTitle": "",
  "userProblem": "",
  "articleGoal": "",
  "recommendedAngle": "",
  "differentiationStrategy": "how this differs from the existing articles listed above",
  "whyThisArticleShouldExist": "",
  "howItDiffersFromExisting": "",
  "recommendedArticleType": "buying_guide|how_to|tutorial|comparison|product_review|list|informational|technical",
  "outline": [{"heading": "", "purpose": "", "talkingPoints": [""], "targetWordCount": 250, "evidenceNeeded": [""]}],
  "questionsToAnswer": [""],
  "faqOpportunities": [""],
  "risks": [""],
  "evidenceRequirements": ["what must be verified before publishing"]
}`;

  const result = await generateJsonContent({
    stage: 'brief',
    systemInstruction:
      'You are a content strategist writing an article brief for a WordPress publisher. You never fabricate metrics, sources or specifications. Return JSON only.',
    prompt
  });

  try {
    const data = asObject(result.data, 'brief');
    const workingTitle = requireString(data.workingTitle, 'workingTitle', { minLength: 8 });
    const resolvedType = oneOf(data.recommendedArticleType, ARTICLE_KINDS, articleType);
    const questionsToAnswer = [
      ...new Set([...research.keyQuestions, ...stringArray(data.questionsToAnswer, { max: 12 })])
    ].slice(0, 12);

    const productsToMention = research.productInformation.map((product) => product.name).slice(0, 8);

    const briefCore = {
      workingTitle,
      primaryKeyword: research.primaryKeyword,
      recommendedArticleType: resolvedType,
      recommendedAngle: requireString(data.recommendedAngle, 'recommendedAngle'),
      productsToMention,
      targetAudience: research.targetAudience
    };

    // Anything unverifiable, plus any high-risk numeric claim the research
    // surfaced, becomes an explicit do-not-fabricate instruction.
    const mustNotFabricate = [
      ...new Set([
        ...research.unknownFacts,
        ...research.importantClaims.filter(isHighRiskClaim),
        'حجم جستجو، رتبهٔ گوگل یا ترافیک رقبا',
        'قیمت، وزن، دمای کارکرد یا استاندارد محصول که در کاتالوگ ثبت نشده',
        'منبع یا لینک بیرونی که واقعاً بازدید نشده است'
      ])
    ].slice(0, 20);

    return {
      id: briefId(research.siteId, research.topic, version),
      siteId: research.siteId,
      researchPacketId: research.id,
      workingTitle,
      primaryKeyword: research.primaryKeyword,
      secondaryKeywords: research.secondaryKeywords,
      searchIntent: research.searchIntent,
      targetAudience: research.targetAudience,
      userProblem: requireString(data.userProblem, 'userProblem'),
      articleGoal: requireString(data.articleGoal, 'articleGoal'),
      recommendedAngle: briefCore.recommendedAngle,
      differentiationStrategy: requireString(data.differentiationStrategy, 'differentiationStrategy'),
      recommendedArticleType: resolvedType,
      whyThisArticleShouldExist:
        requireString(data.whyThisArticleShouldExist, 'whyThisArticleShouldExist'),
      howItDiffersFromExisting: requireString(data.howItDiffersFromExisting, 'howItDiffersFromExisting'),
      outline: parseOutline(data.outline, resolvedType, questionsToAnswer),
      questionsToAnswer,
      internalLinks,
      productsToMention,
      evidenceRequirements: stringArray(data.evidenceRequirements, { max: 10 }),
      visualRequirements: buildVisualBrief({ brief: briefCore, research }),
      seoRequirements: seoRequirements({
        primaryKeyword: research.primaryKeyword,
        secondaryKeywords: research.secondaryKeywords,
        articleType: resolvedType,
        internalLinkCount: internalLinks.length
      }),
      faqOpportunities: stringArray(data.faqOpportunities, { max: 8 }),
      risks: [...stringArray(data.risks, { max: 8 }), ...decision.reasons.slice(0, 2)],
      mustNotFabricate,
      version,
      createdAt: new Date().toISOString(),
      modelUsed: result.modelUsed
    };
  } catch (err) {
    throw schemaFailure('brief', err);
  }
}

function findClusterId(articles: IndexedArticle[], articleId?: string | number): string | undefined {
  if (!articleId) return undefined;
  return articles.find((article) => String(article.id) === String(articleId))?.fingerprint.contentClusterId;
}

/**
 * Structural gate before drafting: a brief without an outline, differentiation
 * or SEO target would produce an unguided article.
 */
export function validateContentBrief(brief: ContentBrief | undefined): { valid: boolean; problems: string[] } {
  const problems: string[] = [];
  if (!brief) return { valid: false, problems: ['بریف محتوایی ساخته نشده است.'] };
  if (!brief.workingTitle.trim()) problems.push('عنوان کاری بریف خالی است.');
  if (!brief.primaryKeyword.trim()) problems.push('کلیدواژهٔ اصلی تعیین نشده است.');
  if (brief.outline.length < 3) problems.push('ساختار مقاله کمتر از ۳ بخش دارد.');
  if (brief.outline.some((section) => !section.heading.trim())) problems.push('یکی از بخش‌های بریف عنوان ندارد.');
  if (!brief.differentiationStrategy.trim()) problems.push('استراتژی تمایز مشخص نشده است.');
  if (!brief.whyThisArticleShouldExist.trim()) problems.push('دلیل وجود این مقاله توضیح داده نشده است.');
  if (brief.questionsToAnswer.length === 0) problems.push('هیچ پرسشی برای پاسخ دادن تعیین نشده است.');
  if (brief.seoRequirements.minWordCount < 300) problems.push('حداقل طول مقاله بیش از حد پایین است.');
  return { valid: problems.length === 0, problems };
}
