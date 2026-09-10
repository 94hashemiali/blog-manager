import { evaluateCannibalization } from '../intelligence/duplication.js';
import type { IndexedArticle } from '../intelligence/types.js';
import type { ConfidenceLevel, DifferentiationDecision, DifferentiationRecommendation, SearchIntent } from './types.js';

/**
 * Maps the intelligence layer's fine-grained cannibalization action onto the
 * five production decisions, so the studio always shows an instruction rather
 * than a bare similarity score.
 */
export function decideDifferentiation(params: {
  siteId: string;
  topic: string;
  primaryKeyword?: string;
  searchIntent?: SearchIntent;
  clusterId?: string;
  articles: IndexedArticle[];
}): DifferentiationDecision {
  const cannibalization = evaluateCannibalization({
    siteId: params.siteId,
    title: params.topic,
    keyword: params.primaryKeyword,
    searchIntent: params.searchIntent,
    clusterId: params.clusterId,
    articles: params.articles
  });

  const top = cannibalization.matchedArticles[0];
  const reasons: string[] = [];
  let recommendation: DifferentiationRecommendation;

  switch (cannibalization.decision) {
    case 'do_not_create':
      recommendation = 'REJECT_DUPLICATE';
      reasons.push('یک مقالهٔ موجود همین کلیدواژه و همین نیت جستجو را هدف گرفته است.');
      break;
    case 'update_existing':
      recommendation = 'UPDATE_EXISTING';
      reasons.push('مقالهٔ موجود تقریباً همین موضوع را پوشش می‌دهد؛ به‌روزرسانی بهتر از مقالهٔ تازه است.');
      break;
    case 'merge_with_existing':
      recommendation = 'MERGE_EXISTING';
      reasons.push('هم‌پوشانی معنایی زیاد است؛ ادغام دو مقاله سیگنال قوی‌تری به گوگل می‌دهد.');
      break;
    case 'create_supporting':
      recommendation = 'CREATE_NEW';
      reasons.push('موضوع در همان خوشه است اما نقش مقالهٔ پشتیبان را دارد.');
      break;
    case 'create_tutorial':
    case 'create_commercial_investigation':
    case 'create_different_intent':
    case 'create_comparison':
      recommendation = 'CREATE_NEW';
      reasons.push('موضوع نزدیک است اما نیت جستجو یا قالب مقاله متفاوت است.');
      break;
    default:
      recommendation = 'CREATE_NEW';
      reasons.push('مقالهٔ مشابهی در ایندکس این سایت پیدا نشد.');
  }

  // A severe risk that the rules still resolved to "create" is escalated to a
  // human instead of being silently written.
  if (recommendation === 'CREATE_NEW' && cannibalization.cannibalizationRisk === 'severe') {
    recommendation = 'NEEDS_REVIEW';
    reasons.push('ریسک هم‌نوع‌خواری در سطح شدید است و نیاز به تصمیم انسانی دارد.');
  }

  // An empty index cannot prove novelty, so novelty is not claimed.
  if (params.articles.length === 0) {
    recommendation = 'NEEDS_REVIEW';
    reasons.push('ایندکس محتوای سایت خالی است؛ بدون همگام‌سازی نمی‌توان یکتا بودن موضوع را تأیید کرد.');
  }

  const isCannibalization =
    cannibalization.cannibalizationRisk === 'severe' || cannibalization.cannibalizationRisk === 'moderate';

  const confidence: ConfidenceLevel =
    params.articles.length === 0
      ? 'low'
      : cannibalization.similarityScore >= 60 || cannibalization.similarityScore <= 15
        ? 'high'
        : 'medium';

  return {
    recommendation,
    confidence,
    similarityScore: cannibalization.similarityScore,
    cannibalizationRisk: cannibalization.cannibalizationRisk,
    isDuplicate: cannibalization.isDuplicate,
    isCannibalization,
    isLegitimateSupporting: cannibalization.decision === 'create_supporting',
    shouldUpdateExisting: recommendation === 'UPDATE_EXISTING' || recommendation === 'MERGE_EXISTING',
    targetArticleId: recommendation === 'CREATE_NEW' ? undefined : top?.id,
    targetArticleTitle: recommendation === 'CREATE_NEW' ? undefined : top?.title,
    reasons: [...reasons, cannibalization.verdictMessage],
    matchedArticles: cannibalization.matchedArticles.map((match) => ({
      id: match.id,
      title: match.title,
      similarity: match.similarity,
      overlapType: match.overlapType,
      reason: match.reason
    }))
  };
}

/** Publishing and drafting are blocked for decisions that mean "do not write". */
export function blocksDrafting(decision: DifferentiationDecision): boolean {
  return decision.recommendation === 'REJECT_DUPLICATE';
}
