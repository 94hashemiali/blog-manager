import type { ImageQualityEvaluation, NoveltyEvaluation } from './types.js';

export const IMAGE_QUALITY_THRESHOLDS = {
  overall: Number(process.env.IMAGE_QUALITY_MIN_OVERALL || 75),
  articleRelevance: Number(process.env.IMAGE_QUALITY_MIN_RELEVANCE || 75),
  technicalAccuracy: Number(process.env.IMAGE_QUALITY_MIN_TECHNICAL || 70),
  specificity: Number(process.env.IMAGE_QUALITY_MIN_SPECIFICITY || 75),
  genericnessMax: Number(process.env.IMAGE_QUALITY_MAX_GENERICNESS || 40),
  novelty: Number(process.env.IMAGE_QUALITY_MIN_NOVELTY || 70),
  photographicRealism: Number(process.env.IMAGE_QUALITY_MIN_REALISM || 70),
  anatomyMin: Number(process.env.IMAGE_QUALITY_MIN_ANATOMY || 70),
  maxAttempts: Number(process.env.IMAGE_MAX_GENERATION_ATTEMPTS || 3),
  compositionSimilarityMax: Number(process.env.IMAGE_MAX_COMPOSITION_SIMILARITY || 72)
};

export const STAGE_LABELS_FA = {
  understanding_article: 'درک مقاله و استخراج ایده بصری',
  planning_visual_concept: 'طراحی کانسپت بصری',
  planning_composition: 'برنامه‌ریزی ترکیب‌بندی',
  generating_image: 'تولید تصویر',
  evaluating_image: 'ارزیابی کیفیت تصویر',
  checking_originality: 'بررسی اصالت و تکرار',
  finalizing: 'نهایی‌سازی'
} as const;

export const BANNED_PROMPT_WORDS = [
  'cinematic',
  'epic',
  'stunning',
  'breathtaking',
  'masterpiece',
  'ultra beautiful',
  'dramatic',
  '8k',
  'ultra-realistic 4k',
  'national geographic'
];

export const DEFAULT_PHOTOGRAPHY_STYLE =
  'Professional outdoor editorial photography. Natural daylight, realistic exposure, physically believable materials, restrained color grading, natural imperfections, realistic depth of field and perspective. Looks like a photograph commissioned for an outdoor magazine, not stock, CGI, game render, fantasy art, or glossy advertising.';

export function loadQualityThresholds() {
  return {
    overallMin: IMAGE_QUALITY_THRESHOLDS.overall,
    articleRelevanceMin: IMAGE_QUALITY_THRESHOLDS.articleRelevance,
    technicalAccuracyMin: IMAGE_QUALITY_THRESHOLDS.technicalAccuracy,
    specificityMin: IMAGE_QUALITY_THRESHOLDS.specificity,
    genericnessMax: IMAGE_QUALITY_THRESHOLDS.genericnessMax,
    noveltyMin: IMAGE_QUALITY_THRESHOLDS.novelty,
    photographicRealismMin: IMAGE_QUALITY_THRESHOLDS.photographicRealism,
    anatomyMin: IMAGE_QUALITY_THRESHOLDS.anatomyMin,
    maxAttempts: IMAGE_QUALITY_THRESHOLDS.maxAttempts,
    compositionSimilarityMax: IMAGE_QUALITY_THRESHOLDS.compositionSimilarityMax
  };
}

export function qualityGateDecision(
  quality: ImageQualityEvaluation,
  novelty: NoveltyEvaluation,
  humanPresent: boolean,
  thresholds = loadQualityThresholds()
): { shouldRegenerate: boolean; keepConcept: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (quality.overall < thresholds.overallMin) reasons.push(`overall ${quality.overall} < ${thresholds.overallMin}`);
  if (quality.articleRelevance < thresholds.articleRelevanceMin) {
    reasons.push(`relevance ${quality.articleRelevance} < ${thresholds.articleRelevanceMin}`);
  }
  if (quality.technicalAccuracy < thresholds.technicalAccuracyMin) {
    reasons.push(`technical ${quality.technicalAccuracy} < ${thresholds.technicalAccuracyMin}`);
  }
  if (quality.specificity < thresholds.specificityMin) {
    reasons.push(`specificity ${quality.specificity} < ${thresholds.specificityMin}`);
  }
  if (quality.genericness > thresholds.genericnessMax) {
    reasons.push(`genericness ${quality.genericness} > ${thresholds.genericnessMax}`);
  }
  if ((novelty.noveltyScore ?? quality.novelty) < thresholds.noveltyMin || novelty.tooSimilar) {
    reasons.push(`novelty too low or too similar to previous generations`);
  }
  if (quality.photographicRealism < thresholds.photographicRealismMin) {
    reasons.push(`realism ${quality.photographicRealism} < ${thresholds.photographicRealismMin}`);
  }
  if (humanPresent && quality.anatomy < thresholds.anatomyMin) {
    reasons.push(`anatomy ${quality.anatomy} < ${thresholds.anatomyMin}`);
  }
  if (novelty.exactDuplicate) reasons.push('exact duplicate');

  const generic = quality.genericness > thresholds.genericnessMax;
  const irrelevant = quality.articleRelevance < thresholds.articleRelevanceMin;
  return {
    shouldRegenerate: reasons.length > 0,
    keepConcept: !generic && !irrelevant,
    reasons
  };
}
