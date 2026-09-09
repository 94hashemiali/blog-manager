import { generateMultimodalJson } from '../aiClient.js';
import { IMAGE_QUALITY_THRESHOLDS } from './config.js';
import { parseDataUrl } from './novelty.js';
import type {
  ArticleUnderstanding,
  ImageQualityEvaluation,
  ImageType,
  NoveltyEvaluation,
  VisualConcept,
  VisualIntent,
  VisualStrategy
} from './types.js';

function clamp(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toLegacy(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score / 10)));
}

export function emptyUnevaluatedQuality(reason: string): ImageQualityEvaluation {
  return {
    overall: 0,
    articleRelevance: 0,
    specificity: 0,
    photographicRealism: 0,
    composition: 0,
    technicalAccuracy: 0,
    anatomy: 100,
    genericness: 100,
    novelty: 0,
    equipmentAccuracy: 0,
    issues: [reason],
    shouldRegenerate: true,
    reason,
    nextStrategy: { strategyId: undefined },
    relevance: 0,
    realism: 0,
    problems: [reason],
    evaluatedFromActualImage: false
  } as ImageQualityEvaluation;
}

export async function evaluateGeneratedImage(params: {
  imageUrl: string;
  imageType: ImageType;
  understanding: ArticleUnderstanding;
  intent: VisualIntent;
  concept: VisualConcept;
  strategy: VisualStrategy;
  novelty: NoveltyEvaluation;
  previousDescription?: string;
}): Promise<ImageQualityEvaluation> {
  const parsed = parseDataUrl(params.imageUrl);
  if (!parsed) {
    return emptyUnevaluatedQuality('Critic could not read image bytes; scores were not fabricated.');
  }

  const systemInstruction = `You are a strict photo editor for an outdoor magazine.
Evaluate the attached photograph, not the prompt.
Generic scenic images fail.
Genericness is NOT novelty: five different mountain/tent photos can all be generic.
If removing the article title would let this image illustrate 100 other outdoor articles, genericness must be 80 or higher.
Anatomy errors fail the image.
Do not invent details you cannot see.`;

  const prompt = `ARTICLE TITLE: ${params.understanding.title}
ONE VISUAL IDEA REQUIRED: ${params.understanding.oneVisualIdea}
ARTICLE TYPE: ${params.understanding.articleType}
PRIMARY SUBJECT: ${params.intent.mainSubject}
IMAGE TYPE: ${params.imageType}
STRATEGY: ${params.strategy.id}
CONCEPT: ${params.concept.whatIsShown || params.concept.subject}
HUMAN PRESENCE PLANNED: ${params.intent.humanPresence}
DETERMINISTIC NOVELTY: ${params.novelty.noveltyScore} (${params.novelty.rejectionReason || 'ok'})
PREVIOUS IMAGE: ${params.previousDescription || 'none'}

Score 0-100. genericness HIGH means BAD.
novelty HIGH means GOOD.

Return JSON:
{
  "overall": 0,
  "articleRelevance": 0,
  "specificity": 0,
  "photographicRealism": 0,
  "composition": 0,
  "technicalAccuracy": 0,
  "anatomy": 0,
  "equipmentAccuracy": 0,
  "genericness": 0,
  "novelty": 0,
  "issues": [],
  "shouldRegenerate": true,
  "reason": "",
  "nextStrategy": { "keepConcept": true, "strategyId": "", "adjustments": [] },
  "couldReplace100Articles": false
}`;

  try {
    const { data } = await generateMultimodalJson({
      prompt,
      systemInstruction,
      stage: 'evaluating_image',
      images: [{ mimeType: parsed.mimeType, data: parsed.buffer.toString('base64') }]
    });

    const genericness = clamp(data.genericness, 100);
    const couldReplace = data.couldReplace100Articles === true;
    const articleRelevance = clamp(data.articleRelevance);
    const specificity = clamp(data.specificity);
    const technicalAccuracy = clamp(data.technicalAccuracy);
    const anatomy = params.intent.humanPresence === 'none' ? 100 : clamp(data.anatomy, 0);
    const photographicRealism = clamp(data.photographicRealism);
    const overall = clamp(
      data.overall,
      Math.round((articleRelevance + specificity + photographicRealism + technicalAccuracy) / 4)
    );
    const issues = Array.isArray(data.issues) ? data.issues.map(String) : [];
    if (couldReplace) issues.push('Image could illustrate many unrelated outdoor articles.');

    const shouldRegenerate =
      Boolean(data.shouldRegenerate) ||
      overall < IMAGE_QUALITY_THRESHOLDS.overall ||
      articleRelevance < IMAGE_QUALITY_THRESHOLDS.articleRelevance ||
      specificity < IMAGE_QUALITY_THRESHOLDS.specificity ||
      technicalAccuracy < IMAGE_QUALITY_THRESHOLDS.technicalAccuracy ||
      genericness > IMAGE_QUALITY_THRESHOLDS.genericnessMax ||
      couldReplace;

    return {
      overall,
      articleRelevance,
      specificity,
      photographicRealism,
      composition: clamp(data.composition),
      technicalAccuracy,
      anatomy,
      genericness: couldReplace ? Math.max(genericness, 80) : genericness,
      novelty: clamp(data.novelty, params.novelty.noveltyScore),
      equipmentAccuracy: clamp(data.equipmentAccuracy),
      issues,
      shouldRegenerate,
      reason: String(data.reason || 'Evaluated from the generated image.'),
      nextStrategy: {
        strategyId: data.nextStrategy?.strategyId,
        keepConcept: Boolean(data.nextStrategy?.keepConcept) && !couldReplace,
        adjustments: Array.isArray(data.nextStrategy?.adjustments) ? data.nextStrategy.adjustments.map(String) : []
      },
      relevance: toLegacy(articleRelevance),
      realism: toLegacy(photographicRealism),
      problems: issues,
      humanAnatomy: toLegacy(anatomy),
      subjectClarity: toLegacy(specificity),
      editorialQuality: toLegacy(photographicRealism),
      visualNovelty: toLegacy(params.novelty.noveltyScore),
      evaluatedFromActualImage: true
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Image critic failed:', message);
    return emptyUnevaluatedQuality(`Image critic failed: ${message}`);
  }
}
