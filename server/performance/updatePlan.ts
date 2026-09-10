import { generateJsonContent } from '../aiClient.js';
import type { IndexedArticle } from '../intelligence/types.js';
import { asObject, stringArray } from '../content/schema.js';
import type {
  ArticleUpdatePlan,
  ContentDecayAssessment,
  FreshnessIssue,
  LinkingImpact,
  PerformanceOpportunity,
  WordpressArticleBaseline
} from './types.js';

/**
 * Deterministic update plan from signals. Gemini may enrich wording later but
 * never invents metrics into the plan.
 */
export function buildDeterministicUpdatePlan(params: {
  siteId: string;
  article: IndexedArticle;
  baseline: WordpressArticleBaseline;
  decay: ContentDecayAssessment;
  freshnessIssues: FreshnessIssue[];
  linkingImpact: LinkingImpact;
  opportunities: PerformanceOpportunity[];
}): ArticleUpdatePlan {
  const { article, baseline, decay, freshnessIssues, linkingImpact, opportunities } = params;
  const headings = article.normalized.headings;

  const sectionsToPreserve = headings.slice(0, Math.min(2, headings.length));
  const sectionsToModify = freshnessIssues.length
    ? headings.filter((heading) => /محصول|خرید|مقایسه|قیمت|سال/i.test(heading)).slice(0, 3)
    : headings.slice(2, 4);
  const sectionsToAdd: string[] = [];
  if (opportunities.some((row) => row.type === 'EXPAND_MISSING_SECTION')) {
    sectionsToAdd.push('معیارهای تصمیم‌گیری به‌روز');
  }
  if (opportunities.some((row) => row.type === 'ADD_PRODUCT_LINKS')) {
    sectionsToAdd.push('محصولات مرتبط فعلی فروشگاه');
  }
  if (freshnessIssues.some((issue) => issue.type === 'stale_faq')) {
    sectionsToAdd.push('پرسش‌های متداول بازبینی‌شده');
  }

  const productsToRemove = freshnessIssues
    .filter((issue) => issue.type === 'outdated_product_mention')
    .map((issue) => issue.reason);
  const productsToAdd = freshnessIssues
    .filter((issue) => issue.type === 'missing_current_product')
    .flatMap((issue) => issue.suggestedAction.match(/«([^»]+)»/g) || [])
    .map((token) => token.replace(/[«»]/g, ''));

  const expectedRisk: ArticleUpdatePlan['expectedRisk'] =
    decay.status === 'DECAYED' || opportunities.some((row) => row.type === 'FIX_CANNIBALIZATION')
      ? 'high'
      : decay.status === 'DECLINING'
        ? 'medium'
        : 'low';

  return {
    siteId: params.siteId,
    articleId: article.id,
    whyUpdateNeeded: [
      ...decay.reasons.slice(0, 3),
      ...opportunities.slice(0, 2).map((row) => row.reason)
    ],
    sectionsToPreserve: sectionsToPreserve.length ? sectionsToPreserve : ['مقدمه'],
    sectionsToModify: sectionsToModify.length ? sectionsToModify : headings.slice(0, 1),
    sectionsToAdd,
    factsToVerify: freshnessIssues
      .filter((issue) => issue.type === 'old_year_reference' || issue.type === 'stale_date_in_text' || issue.type === 'stale_faq')
      .map((issue) => issue.reason),
    internalLinksToAdd: linkingImpact.potentialNewLinks.map((link) => ({
      title: link.title,
      reason: link.reason
    })),
    productsToAdd,
    productsToRemove,
    visualAssetsToReview: baseline.hasFeaturedImage
      ? ['بازبینی تصویر شاخص از نظر به‌روز بودن سوژه']
      : ['ساخت تصویر شاخص جدید'],
    seoMetadataChanges: [
      baseline.slug ? 'بازبینی عنوان و متا با حفظ نامک فعلی در صورت امکان' : 'تعیین نامک پایدار',
      'هم‌راستایی نیت جستجو با بخش‌های به‌روزشده'
    ],
    expectedRisk,
    requiredHumanReview: [
      'تأیید ادعاهای محصول قبل از انتشار',
      'بازبینی لینک‌های داخلی پیشنهادی',
      expectedRisk === 'high' ? 'تأیید عدم تداخل با مقالات هم‌پوشان' : ''
    ].filter(Boolean),
    source: 'deterministic',
    quality: 'VERIFIED',
    generatedAt: new Date().toISOString()
  };
}

/**
 * Optional Gemini enrichment. Falls back to the deterministic plan on failure
 * or malformed JSON — never invents clicks/impressions.
 */
export async function enrichUpdatePlanWithAi(
  plan: ArticleUpdatePlan,
  articleTitle: string
): Promise<ArticleUpdatePlan> {
  try {
    const result = await generateJsonContent({
      stage: 'update_plan',
      systemInstruction:
        'You refine an article update plan. Use ONLY the supplied evidence. Never invent traffic, rankings, CTR, or search volume. If unsure, keep UNKNOWN. Return JSON only.',
      prompt: `ARTICLE: ${articleTitle}
EXISTING PLAN:
${JSON.stringify(plan, null, 2)}

Return JSON:
{
  "sectionsToAdd": ["..."],
  "requiredHumanReview": ["..."],
  "seoMetadataChanges": ["..."]
}`
    });
    const data = asObject(result.data, 'update_plan');
    return {
      ...plan,
      sectionsToAdd: stringArray(data.sectionsToAdd, { max: 8 }).length
        ? stringArray(data.sectionsToAdd, { max: 8 })
        : plan.sectionsToAdd,
      requiredHumanReview: [
        ...plan.requiredHumanReview,
        ...stringArray(data.requiredHumanReview, { max: 6 })
      ].slice(0, 10),
      seoMetadataChanges: stringArray(data.seoMetadataChanges, { max: 6 }).length
        ? stringArray(data.seoMetadataChanges, { max: 6 })
        : plan.seoMetadataChanges,
      source: 'ai_interpreted',
      quality: 'AI_INTERPRETED',
      modelUsed: result.modelUsed
    };
  } catch {
    return plan;
  }
}
