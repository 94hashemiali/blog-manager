import { db } from '../db.js';
import { runArtDirector, type ArtDirectorPlan } from './artDirector.js';
import { applyArticleBriefToVisualContext, buildSiteVisualContext, inferArticleType } from './articleContext.js';
import { qualityGateDecision, IMAGE_QUALITY_THRESHOLDS } from './config.js';
import { evaluateGeneratedImage } from './critic.js';
import { fallbackOptionsFor } from './fallbackLibrary.js';
import { inferFeedbackCode } from './feedback.js';
import { generateGeminiImage } from './imageGenerator.js';
import {
  buildFingerprint,
  computePerceptualHashFromImage,
  computeSha256,
  evaluateNoveltyAgainstHistory,
  parseDataUrl
} from './novelty.js';
import { buildImagePrompt } from './promptBuilder.js';
import { persistImageDataUrl } from './storage.js';
import type {
  FallbackImage,
  GenerateMasterVisualParams,
  GeneratedImageAsset,
  GenerationStage,
  ImageType,
  PipelineResult,
  StructuredArticleContext
} from './types.js';

function report(onStage: GenerateMasterVisualParams['onStage'], stage: GenerationStage, detail?: string) {
  onStage?.(stage, detail);
}

function normalizeArticle(params: GenerateMasterVisualParams): StructuredArticleContext {
  const base: StructuredArticleContext = params.article?.title
    ? {
        ...params.article,
        content: params.article.content || params.content || ''
      }
    : {
        title: params.title || params.prompt || 'تجهیزات کوهنوردی و طبیعت‌گردی',
        content: params.content || '',
        sections: params.section ? [{ heading: params.section, text: '' }] : [],
        keywords: [],
        products: []
      };
  return applyArticleBriefToVisualContext(base, params.articleBrief);
}

function persistAsset(asset: GeneratedImageAsset) {
  const all = db.getImages();
  const idx = all.findIndex((img) => img.id === asset.id || img.imageId === asset.id);
  if (idx >= 0) all[idx] = asset;
  else all.unshift(asset);
  db.saveImages(all);
}

function fallbackImages(imageType: ImageType): FallbackImage[] {
  return fallbackOptionsFor(imageType).map((item) => ({
    id: item.id,
    title: item.title,
    perspective: '',
    url: item.url,
    description: 'آرشیو مستند — تصویر هوش مصنوعی نیست',
    isAiGenerated: false as const,
    source: 'unsplash_fallback' as const
  }));
}

export async function generateMasterVisualAsset(
  params: GenerateMasterVisualParams
): Promise<PipelineResult> {
  const siteId = params.siteId || 'site-madanicamp';
  const imageType: ImageType = params.imageType || 'HERO';
  const aspectRatio = params.aspectRatio || '16:9';
  const maxAttempts = IMAGE_QUALITY_THRESHOLDS.maxAttempts;
  const stageHistory: GenerationStage[] = [];
  const onStage: GenerateMasterVisualParams['onStage'] = (stage, detail) => {
    stageHistory.push(stage as GenerationStage);
    params.onStage?.(stage, detail);
  };

  const article = normalizeArticle(params);
  const site = buildSiteVisualContext(db.getSiteById(siteId));
  const existingImages = db.getImages(siteId);
  const feedbackText =
    params.userFeedback ||
    params.userInstructions ||
    params.rejectionFeedback?.reason ||
    params.rejectionFeedback?.adjustments;
  const feedbackCode = params.feedbackCode || params.rejectionFeedback?.code || inferFeedbackCode(feedbackText);

  const previousImage = params.previousImageId
    ? existingImages.find((img) => img.id === params.previousImageId || img.imageId === params.previousImageId)
    : existingImages.find((img) => img.familyId === params.familyId || img.lineageId === params.familyId);

  const lineageId =
    params.familyId ||
    params.lineageId ||
    previousImage?.lineageId ||
    previousImage?.familyId ||
    `lin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const regenerationMode =
    params.regenerationMode ||
    (params.forceNewStrategy || params.rejectionFeedback ? 'different_concept' : 'new');

  const lineageImages = existingImages.filter(
    (img) =>
      img.lineageId === lineageId ||
      img.familyId === lineageId ||
      (params.articleId != null && String(img.articleId) === String(params.articleId))
  );
  const previousStrategyIds = [
    ...(params.previousGenerations || []),
    ...(regenerationMode === 'same_concept'
      ? []
      : lineageImages.map((img) => img.strategy?.id).filter(Boolean))
  ] as string[];

  report(onStage, 'understanding_article', article.title);
  report(onStage, 'planning_visual_concept');

  let plan: ArtDirectorPlan = await runArtDirector({
    article,
    imageType,
    site,
    previousStrategyIds,
    previousPlan: previousImage?.visualConcept && previousImage?.strategy
      ? {
          understanding: {
            title: article.title,
            primaryTopic: previousImage.visualConcept.primarySubject || previousImage.visualConcept.subject,
            primaryKeyword: article.primaryKeyword || article.title,
            searchIntent: article.searchIntent || 'informational',
            articleType: inferArticleType(article.title, article.content || ''),
            audience: site.audience,
            products: article.products || [],
            equipment: previousImage.visualConcept.technicalDetails || [],
            importantEntities: [],
            importantInstructions: [],
            importantComparisons: [],
            problemsBeingSolved: [],
            keyConclusions: [],
            commercialIntent: '',
            oneVisualIdea: previousImage.visualConcept.whyItMatters || previousImage.visualConcept.subject
          },
          visualIntent: previousImage.visualIntent || {
            visualPurpose: previousImage.visualConcept.whyItMatters || '',
            mainSubject: previousImage.visualConcept.primarySubject || previousImage.visualConcept.subject,
            secondarySubjects: previousImage.visualConcept.secondarySubjects || [],
            action: previousImage.visualConcept.action,
            environment: previousImage.visualConcept.environment,
            context: article.title,
            importantDetails: previousImage.visualConcept.technicalDetails || [],
            humanPresence: previousImage.fingerprint?.humanPresence ? 'partial' : 'none',
            productImportance: 'dominant',
            technicalImportance: 'high',
            visualMessage: previousImage.visualConcept.whyItMatters || '',
            thingsToAvoid: []
          },
          visualConcept: previousImage.visualConcept,
          compositionPlan: previousImage.compositionPlan || {
            imageType,
            strategyId: previousImage.strategy.id,
            subjectPlacement: previousImage.strategy.compositionPattern,
            cameraHeight: previousImage.strategy.cameraAngle,
            cameraAngle: previousImage.strategy.cameraAngle,
            shotScale: previousImage.strategy.shotType,
            foreground: previousImage.visualConcept.foreground,
            midground: previousImage.visualConcept.midground || previousImage.visualConcept.subject,
            background: previousImage.visualConcept.background,
            lighting: previousImage.strategy.lighting,
            depthOfField: '',
            negativeSpace: '',
            photographyStyle: ''
          },
          strategy: previousImage.strategy,
          negativeConstraints: [],
          usedGemini: true
        }
      : undefined,
    regenerationMode,
    feedbackCode,
    feedbackText
  });

  let executionNotes = [
    ...(feedbackText ? [feedbackText] : []),
    ...(params.prompt && params.prompt.trim().length < 280
      ? [`Editor note (not the full prompt): ${params.prompt.trim()}`]
      : [])
  ];

  let best: GeneratedImageAsset | null = null;
  let lastError: { message: string; errorCode: string; retryable: boolean } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    report(onStage, 'planning_composition', plan.strategy.id);
    const detailedPrompt = buildImagePrompt({
      understanding: plan.understanding,
      intent: plan.visualIntent,
      concept: plan.visualConcept,
      composition: plan.compositionPlan,
      strategy: plan.strategy,
      imageType,
      hasReferenceImage: Boolean(params.productReferenceImage),
      promptVariables: params.promptVariables,
      extraInstructions: executionNotes.filter(Boolean).join(' | ')
    });

    report(onStage, 'generating_image', `attempt ${attempt}/${maxAttempts}`);
    const generated = await generateGeminiImage(detailedPrompt, {
      aspectRatio,
      referenceImage: params.productReferenceImage,
      allowPeople: plan.visualIntent.humanPresence !== 'none'
    });

    if (!generated.success || !generated.imageUrl) {
      lastError = {
        message: generated.error || 'Gemini image generation failed.',
        errorCode: generated.errorCode || 'GEMINI_IMAGE_FAILED',
        retryable: generated.retryable !== false
      };
      if (!generated.retryable) break;
      continue;
    }

    const parsed = parseDataUrl(generated.imageUrl);
    const bytes = parsed?.buffer || Buffer.from(generated.imageUrl);
    const sha256 = computeSha256(bytes);
    const perceptualHash = computePerceptualHashFromImage(generated.imageUrl);
    const fingerprint = buildFingerprint({
      subject: plan.visualConcept.primarySubject || plan.visualConcept.subject,
      strategyId: plan.strategy.id,
      camera: plan.visualConcept.camera || plan.compositionPlan.cameraAngle,
      shotType: plan.strategy.shotType,
      environment: plan.visualConcept.environment,
      subjectPlacement: plan.compositionPlan.subjectPlacement,
      humanPresence: plan.visualIntent.humanPresence !== 'none'
    });

    report(onStage, 'checking_originality');
    const novelty = evaluateNoveltyAgainstHistory({
      imageBytes: bytes,
      concept: plan.visualConcept,
      strategyId: plan.strategy.id,
      humanPresence: plan.visualIntent.humanPresence,
      existing: existingImages.concat(best ? [best] : [])
    });

    report(onStage, 'evaluating_image');
    const quality = await evaluateGeneratedImage({
      imageUrl: generated.imageUrl,
      imageType,
      understanding: plan.understanding,
      intent: plan.visualIntent,
      concept: plan.visualConcept,
      strategy: plan.strategy,
      novelty,
      previousDescription: previousImage?.visualConcept?.whatIsShown
    });
    quality.novelty = novelty.noveltyScore;

    const humanPresent = plan.visualIntent.humanPresence !== 'none';
    const gate = qualityGateDecision(quality, { ...novelty, tooSimilar: !novelty.isAcceptable }, humanPresent);

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const storedUrl = persistImageDataUrl(id, generated.imageUrl) || generated.imageUrl;
    const version = existingImages.filter((img) => img.lineageId === lineageId || img.familyId === lineageId).length + 1;
    const asset: GeneratedImageAsset = {
      id,
      imageId: id,
      siteId,
      articleId: params.articleId,
      lineageId,
      familyId: lineageId,
      type: imageType,
      imageType,
      version,
      generationVersion: version,
      source: 'gemini',
      prompt: detailedPrompt,
      visualIntent: plan.visualIntent,
      visualConcept: plan.visualConcept,
      compositionPlan: plan.compositionPlan,
      visualBrief: {
        strategyId: plan.strategy.id,
        strategyName: plan.strategy.nameFa,
        oneVisualIdea: plan.understanding.oneVisualIdea,
        whyItMatters: plan.visualConcept.whyItMatters,
        articleSnapshot: {
          title: article.title,
          primaryKeyword: article.primaryKeyword || plan.understanding.primaryKeyword,
          articleType: plan.understanding.articleType,
          contentHint: (article.content || '').slice(0, 1200)
        }
      },
      strategy: plan.strategy,
      differencePlan: plan.differencePlan,
      fingerprint,
      hash: sha256,
      perceptualHash,
      quality,
      genericnessScore: quality.genericness,
      noveltyScore: novelty.noveltyScore,
      noveltyEvaluation: novelty,
      userFeedback: feedbackCode ? { code: feedbackCode, text: feedbackText } : undefined,
      status: gate.shouldRegenerate ? 'rejected' : 'active',
      rejectionReason: gate.shouldRegenerate ? `quality_gate: ${gate.reasons.join('; ') || quality.reason}` : undefined,
      referenceImageUrl: params.productReferenceImage,
      url: storedUrl,
      aspectRatio,
      createdAt: new Date().toISOString(),
      persianCaption: `${plan.visualConcept.whatIsShown || plan.visualConcept.subject} (${plan.visualConcept.whyItMatters || plan.understanding.oneVisualIdea})`,
      persianTitle: `${plan.visualConcept.primarySubject || plan.visualConcept.subject} — ${plan.strategy.nameFa}`,
      semanticDescription: plan.visualConcept.whatIsShown || plan.visualConcept.subject,
      isAiGenerated: true,
      modelUsed: generated.modelUsed,
      attempts: attempt,
      attempt,
      issues: quality.issues,
      stageHistory: [...stageHistory]
    };

    persistAsset(asset);
    if (!best || quality.overall > (best.quality.overall || 0)) best = asset;

    if (!gate.shouldRegenerate) {
      report(onStage, 'finalizing');
      return successResult(asset, plan, false, attempt, []);
    }

    executionNotes = [...(quality.issues || []), quality.reason, novelty.rejectionReason || ''].filter(Boolean);
    if (attempt < maxAttempts) {
      plan = await runArtDirector({
        article,
        imageType,
        site,
        previousStrategyIds: [...previousStrategyIds, plan.strategy.id],
        previousPlan: plan,
        regenerationMode: gate.keepConcept && regenerationMode !== 'different_concept' ? 'same_concept' : 'different_concept',
        feedbackCode: quality.genericness > IMAGE_QUALITY_THRESHOLDS.genericnessMax ? 'too_generic' : feedbackCode,
        feedbackText: executionNotes.join(' | ')
      });
    }
  }

  report(onStage, 'finalizing');
  if (best) {
    best.status = 'active';
    persistAsset(best);
    return successResult(best, plan, true, maxAttempts, best.quality.issues || []);
  }

  return {
    success: false,
    stage: 'image_generation',
    errorCode: lastError?.errorCode || 'image_generation_failed',
    message:
      lastError?.errorCode === 'quota_or_unavailable'
        ? `سهمیه یا دسترسی Gemini برای تولید تصویر کافی نیست: ${lastError.message} تصویر آرشیوی به‌جای نتیجه هوش مصنوعی قرار داده نشد.`
        : lastError?.message ||
          'تولید تصویر با Gemini ناموفق بود. تصویر آرشیوی به‌جای نتیجه هوش مصنوعی قرار داده نشد.',
    retryable: lastError?.retryable ?? true,
    fallbackOptions: fallbackImages(imageType),
    fallbackImages: fallbackImages(imageType)
  };
}

function successResult(
  asset: GeneratedImageAsset,
  plan: ArtDirectorPlan,
  gateWarning: boolean,
  attempts: number,
  reasons: string[]
): PipelineResult {
  return {
    success: true,
    imageUrl: asset.url,
    image: asset,
    variations: [
      {
        id: asset.id,
        title: asset.persianTitle,
        perspective: plan.strategy.perspective,
        url: asset.url,
        description: asset.persianCaption,
        isAiGenerated: true,
        source: 'gemini'
      }
    ],
    persianCaption: asset.persianCaption,
    detailedPrompt: asset.prompt,
    promptSuggestions: [
      plan.understanding.oneVisualIdea,
      `${plan.visualConcept.subject} — ${plan.strategy.name}`,
      plan.visualIntent.visualMessage
    ],
    source: 'gemini',
    message: gateWarning
      ? `بهترین نتیجه پس از ${attempts} تلاش ذخیره شد، اما دروازه کیفیت کاملاً پاس نشد.`
      : `تصویر با مدل ${asset.modelUsed || 'gemini-3.1-flash-image'} و استراتژی «${plan.strategy.nameFa}» تولید و ارزیابی شد.`,
    strategy: plan.strategy,
    visualConcept: plan.visualConcept,
    visualIntent: plan.visualIntent,
    quality: asset.quality,
    attempts
  };
}

export async function generateHeroImage(context: StructuredArticleContext, options: Record<string, unknown> = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'HERO' });
}
export async function generateArticleImage(context: StructuredArticleContext, options: Record<string, unknown> = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'ARTICLE' });
}
export async function generateProductImage(context: StructuredArticleContext, options: Record<string, unknown> = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'PRODUCT' });
}
export async function generateComparisonImage(context: StructuredArticleContext, options: Record<string, unknown> = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'COMPARISON' });
}
export async function generateTutorialImage(context: StructuredArticleContext, options: Record<string, unknown> = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'TUTORIAL' });
}

export async function generateArticleImagePlan(
  article: StructuredArticleContext,
  siteId?: string,
  articleBrief?: import('./types.js').ArticleBriefVisualContext
) {
  const site = buildSiteVisualContext(siteId ? db.getSiteById(siteId) : undefined);
  const merged = applyArticleBriefToVisualContext(article, articleBrief);
  const plan = await runArtDirector({ article: merged, imageType: 'HERO', site, regenerationMode: 'new' });
  return {
    hero: {
      type: 'HERO' as ImageType,
      purpose: plan.understanding.oneVisualIdea,
      concept: plan.visualConcept.whatIsShown || plan.visualConcept.subject,
      strategy: plan.strategy.id,
      aspectRatio: '16:9'
    },
    supportingImages: (merged.sections || []).slice(0, 3).map((sec) => {
      const lower = sec.heading.toLowerCase();
      let type: ImageType = 'ARTICLE';
      if (/مقایسه|تفاوت|vs/.test(lower)) type = 'COMPARISON';
      else if (/آموزش|نحوه|چگونه|گام/.test(lower)) type = 'TUTORIAL';
      else if (/کفش|پوتین|متریال|کوله|جزئی/.test(lower)) type = 'PRODUCT';
      return {
        type,
        section: sec.heading,
        purpose: `توضیح بصری برای «${sec.heading}»`,
        concept: plan.understanding.oneVisualIdea,
        strategy:
          type === 'COMPARISON'
            ? 'controlled_comparison'
            : type === 'TUTORIAL'
              ? 'technical_demonstration'
              : 'product_detail',
        aspectRatio: type === 'PRODUCT' ? '4:3' : '16:9'
      };
    })
  };
}

export const generateVisualAsset = generateMasterVisualAsset;
