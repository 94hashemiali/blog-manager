import { generateJsonContent } from '../aiClient.js';
import {
  buildArticleRepresentation,
  buildSiteVisualContext,
  inferArticleType,
  serializeArticleForPrompt
} from './articleContext.js';
import { DEFAULT_PHOTOGRAPHY_STYLE } from './config.js';
import { EQUIPMENT_REALISM, equipmentConstraintsFor } from './equipment.js';
import { feedbackToDirection, inferFeedbackCode } from './feedback.js';
import { buildDifferencePlan } from './novelty.js';
import { pickStrategy, strategiesFor } from './strategies.js';
import type {
  ArticleUnderstanding,
  CompositionPlan,
  DifferencePlan,
  ImageFeedbackCode,
  ImageType,
  SiteVisualContext,
  StructuredArticleContext,
  VisualConcept,
  VisualIntent,
  VisualStrategy
} from './types.js';

export interface ArtDirectorPlan {
  understanding: ArticleUnderstanding;
  visualIntent: VisualIntent;
  visualConcept: VisualConcept;
  compositionPlan: CompositionPlan;
  strategy: VisualStrategy;
  differencePlan?: DifferencePlan;
  negativeConstraints: string[];
  usedGemini: boolean;
  modelUsed?: string;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function oneVisualIdeaFor(title: string, content: string): string {
  const text = `${title} ${content}`;
  if (/چادر/.test(text) && /چهار فصل|4 فصل|۴ فصل/.test(text)) {
    return 'A four-season tent deployed on exposed rocky terrain, showing crossing poles, taut fly, guy lines and stability in demanding weather — not a generic campsite sunset.';
  }
  if (/کیسه خواب/.test(text) && /پر|الیاف/.test(text)) {
    return 'A controlled comparison of a down sleeping bag versus a synthetic sleeping bag, showing loft and construction differences on the same ground.';
  }
  if (/کوله/.test(text) && /تنظیم/.test(text)) {
    return 'A hiker fitting a trekking backpack: hip belt on the iliac crest, load-lifters and shoulder straps correctly tensioned.';
  }
  if (/باتوم/.test(text)) {
    return 'Correct trekking-pole use: wrist through the strap from below, grip, pole planted at a realistic hiking angle.';
  }
  if (/کفش|پوتین/.test(text)) {
    return 'A hiking boot in real terrain contact: lugs biting rock or soil, ankle support and laces readable.';
  }
  return `One specific photograph that can only illustrate “${title}”, not a generic outdoor scene.`;
}

function heuristicPlan(
  article: StructuredArticleContext,
  imageType: ImageType,
  site: SiteVisualContext,
  previousStrategyIds: string[],
  preferredId?: string,
  forceDifferent?: boolean
): Omit<ArtDirectorPlan, 'usedGemini' | 'modelUsed' | 'differencePlan'> {
  const rep = buildArticleRepresentation(article, site);
  const idea = oneVisualIdeaFor(article.title, article.content || '');
  const understanding: ArticleUnderstanding = {
    title: article.title,
    primaryTopic: rep.primaryTopic,
    primaryKeyword: rep.primaryKeyword,
    searchIntent: rep.searchIntent,
    articleType: rep.articleType,
    audience: rep.audience,
    products: rep.products,
    equipment: rep.equipment,
    importantEntities: rep.importantEntities,
    importantInstructions: [],
    importantComparisons: rep.articleType === 'comparison' ? ['variant A vs variant B'] : [],
    problemsBeingSolved: [],
    keyConclusions: [],
    commercialIntent: rep.searchIntent === 'commercial' ? 'high' : 'medium',
    oneVisualIdea: idea
  };

  const strategy = pickStrategy({
    articleType: understanding.articleType,
    imageType,
    previousStrategyIds,
    preferredId,
    forceDifferent
  });

  const humanPresence: VisualIntent['humanPresence'] =
    strategy.id === 'human_action' || strategy.id === 'pov' || strategy.id === 'technical_demonstration' || strategy.id === 'step_by_step'
      ? 'hands_only'
      : 'none';

  const visualIntent: VisualIntent = {
    visualPurpose: idea,
    mainSubject: understanding.equipment[0] ? understanding.equipment[0].replace(/_/g, ' ') : understanding.primaryTopic,
    secondarySubjects: understanding.equipment.slice(1, 3),
    action: humanPresence === 'none' ? 'Equipment deployed and physically interacting with terrain' : 'A specific correct technique involving the equipment',
    environment: site.isMadaniCamp
      ? 'Believable Iranian alpine or trekking terrain, overcast or clear daylight, not a postcard sunset'
      : 'Believable outdoor terrain matching the article, natural daylight',
    context: understanding.primaryKeyword,
    importantDetails: equipmentConstraintsFor(understanding.equipment).slice(0, 5),
    humanPresence,
    productImportance: imageType === 'PRODUCT' || imageType === 'DETAIL' ? 'dominant' : 'equal',
    technicalImportance: 'high',
    visualMessage: idea,
    thingsToAvoid: ['generic mountain + tent + sunset + hiker', 'CGI gear', 'invented fantasy equipment']
  };

  const visualConcept: VisualConcept = {
    subject: visualIntent.mainSubject,
    action: visualIntent.action,
    environment: visualIntent.environment,
    camera: strategy.cameraAngle,
    composition: strategy.compositionPattern,
    foreground: 'Natural rock, soil or trail texture leading to the subject',
    midground: visualIntent.mainSubject,
    background: 'Soft receding real landscape that does not steal the subject',
    lighting: strategy.lighting,
    materials: understanding.equipment,
    technicalDetails: equipmentConstraintsFor(understanding.equipment),
    whatIsShown: `${visualIntent.mainSubject} — ${idea}`,
    whyItMatters: idea,
    primarySubject: visualIntent.mainSubject,
    secondarySubjects: visualIntent.secondarySubjects,
    compositionIdea: strategy.compositionPattern
  };

  const compositionPlan: CompositionPlan = {
    imageType,
    strategyId: strategy.id,
    subjectPlacement: strategy.compositionPattern,
    cameraHeight: strategy.cameraAngle,
    cameraAngle: strategy.cameraAngle,
    shotScale: strategy.shotType,
    foreground: visualConcept.foreground,
    midground: visualConcept.midground || visualConcept.subject,
    background: visualConcept.background,
    lighting: strategy.lighting,
    depthOfField: 'Realistic photographic depth, not miniature tilt-shift',
    negativeSpace: imageType === 'HERO' ? 'Quiet sky or terrain along a third for optional overlay' : 'Minimal unused poster space',
    photographyStyle: DEFAULT_PHOTOGRAPHY_STYLE
  };

  return {
    understanding,
    visualIntent,
    visualConcept,
    compositionPlan,
    strategy,
    negativeConstraints: visualIntent.thingsToAvoid
  };
}

export async function runArtDirector(params: {
  article: StructuredArticleContext;
  imageType: ImageType;
  site: SiteVisualContext;
  previousStrategyIds?: string[];
  previousPlan?: ArtDirectorPlan;
  regenerationMode?: 'new' | 'same_concept' | 'different_concept';
  feedbackCode?: ImageFeedbackCode;
  feedbackText?: string;
}): Promise<ArtDirectorPlan> {
  const representation = buildArticleRepresentation(params.article, params.site);
  const direction = feedbackToDirection(
    params.feedbackCode || inferFeedbackCode(params.feedbackText),
    params.feedbackText
  );
  const mustChange = params.regenerationMode === 'different_concept' || direction.changeConcept;
  const allowed = strategiesFor(params.imageType, representation.articleType);
  const fallback = heuristicPlan(
    params.article,
    params.imageType,
    params.site,
    params.previousStrategyIds || [],
    direction.preferredStrategy,
    mustChange
  );

  const systemInstruction = `You are the staff art director of an outdoor editorial publication.
You do not generate pixels. You decide what the photograph must communicate.
Default style: professional outdoor editorial photography.
Never choose generic mountain+tent+sunset+hiker wallpaper.
Never use hype words like cinematic, epic, stunning, masterpiece.
Pick ONE visual idea that would be useless for a different article on a different topic.
Select strategyId only from the provided list.
Equipment must be physically conservative and believable.`;

  const prompt = `SITE
Website: ${params.site.name || params.site.websiteName}
Brand: ${params.site.brand}
Language: ${params.site.language}
Audience: ${params.site.audience}
Niche: ${params.site.niche}
Visual preferences: ${params.site.visualPreferences}
Madani Camp specific assumptions: ${params.site.isMadaniCamp ? 'yes, Iranian alpine/outdoor field conditions when relevant' : 'no, do not assume Madani Camp'}

IMAGE TYPE: ${params.imageType}
ALLOWED STRATEGIES:
${allowed.map((s) => `- ${s.id}: ${s.name} | ${s.shotType}`).join('\n')}

ARTICLE:
${serializeArticleForPrompt(representation)}

EQUIPMENT REALISM:
${equipmentConstraintsFor(representation.equipment).map((c) => `- ${c}`).join('\n') || Object.values(EQUIPMENT_REALISM).flat().slice(0, 6).map((c) => `- ${c}`).join('\n')}

USER FEEDBACK: ${direction.instructions.join(' | ') || 'none'}
MODE: ${params.regenerationMode || 'new'}
PREVIOUS: ${params.previousPlan ? `${params.previousPlan.strategy.id} / ${params.previousPlan.visualConcept.subject} / ${params.previousPlan.visualConcept.camera}` : 'none'}
${mustChange ? 'Create a NEW visual concept. Change at least 3 dimensions: shot scale, camera height, subject placement, action, weather/light, foreground, or human presence. Do not merely swap adjectives.' : 'If same_concept, keep the same subject and message; improve execution.'}

Return JSON with understanding, visualIntent, visualConcept, compositionPlan.strategyId, negativeConstraints.
understanding.oneVisualIdea must answer: What is the ONE visual idea that best communicates this article?
compositionPlan.strategyId must be one of the allowed ids.`;

  let raw: any = null;
  let modelUsed: string | undefined;
  let usedGemini = false;
  try {
    const result = await generateJsonContent({
      prompt,
      systemInstruction,
      stage: 'planning_visual_concept'
    });
    raw = result.data;
    modelUsed = result.modelUsed;
    usedGemini = true;
  } catch (err) {
    console.warn('Art director Gemini call failed, using heuristic plan:', err instanceof Error ? err.message : err);
  }

  const preferredId = asString(raw?.compositionPlan?.strategyId || raw?.strategyId) || direction.preferredStrategy;
  const strategy = pickStrategy({
    articleType: (raw?.understanding?.articleType || fallback.understanding.articleType) as ArticleUnderstanding['articleType'],
    imageType: params.imageType,
    previousStrategyIds: params.previousStrategyIds,
    preferredId,
    forceDifferent: mustChange
  });

  const understanding: ArticleUnderstanding = {
    ...fallback.understanding,
    ...(raw?.understanding || {}),
    title: asString(raw?.understanding?.title, fallback.understanding.title),
    oneVisualIdea: asString(raw?.understanding?.oneVisualIdea, fallback.understanding.oneVisualIdea),
    primaryTopic: asString(raw?.understanding?.primaryTopic, fallback.understanding.primaryTopic),
    articleType: raw?.understanding?.articleType || fallback.understanding.articleType,
    equipment: asArray(raw?.understanding?.equipment).length ? asArray(raw?.understanding?.equipment) : fallback.understanding.equipment,
    products: asArray(raw?.understanding?.products).length ? asArray(raw?.understanding?.products) : fallback.understanding.products
  };

  const visualIntent: VisualIntent = {
    ...fallback.visualIntent,
    ...(raw?.visualIntent || {}),
    visualPurpose: asString(raw?.visualIntent?.visualPurpose, fallback.visualIntent.visualPurpose),
    mainSubject: asString(raw?.visualIntent?.mainSubject, fallback.visualIntent.mainSubject),
    secondarySubjects: asArray(raw?.visualIntent?.secondarySubjects).length
      ? asArray(raw?.visualIntent?.secondarySubjects)
      : fallback.visualIntent.secondarySubjects,
    thingsToAvoid: asArray(raw?.visualIntent?.thingsToAvoid).length
      ? asArray(raw?.visualIntent?.thingsToAvoid)
      : fallback.visualIntent.thingsToAvoid,
    humanPresence: raw?.visualIntent?.humanPresence || fallback.visualIntent.humanPresence
  };

  let visualConcept: VisualConcept = {
    ...fallback.visualConcept,
    ...(raw?.visualConcept || {}),
    subject: asString(raw?.visualConcept?.subject, fallback.visualConcept.subject),
    whatIsShown: asString(raw?.visualConcept?.whatIsShown, fallback.visualConcept.whatIsShown),
    whyItMatters: asString(raw?.visualConcept?.whyItMatters, fallback.visualConcept.whyItMatters),
    primarySubject: asString(raw?.visualConcept?.primarySubject, visualIntent.mainSubject),
    technicalDetails: asArray(raw?.visualConcept?.technicalDetails).length
      ? asArray(raw?.visualConcept?.technicalDetails)
      : fallback.visualConcept.technicalDetails,
    materials: asArray(raw?.visualConcept?.materials).length
      ? asArray(raw?.visualConcept?.materials)
      : fallback.visualConcept.materials
  };

  if (params.regenerationMode === 'same_concept' && params.previousPlan) {
    visualConcept = params.previousPlan.visualConcept;
    visualIntent.mainSubject = params.previousPlan.visualIntent.mainSubject;
    visualIntent.visualMessage = params.previousPlan.visualIntent.visualMessage;
  }

  const compositionPlan: CompositionPlan = {
    ...fallback.compositionPlan,
    ...(raw?.compositionPlan || {}),
    imageType: params.imageType,
    strategyId: strategy.id,
    photographyStyle: DEFAULT_PHOTOGRAPHY_STYLE
  };

  let differencePlan: DifferencePlan | undefined;
  if (params.previousPlan) {
    differencePlan = buildDifferencePlan({
      previousStrategyId: params.previousPlan.strategy.id,
      newStrategyId: strategy.id,
      previousConcept: params.previousPlan.visualConcept,
      newConcept: visualConcept,
      reason: mustChange
        ? 'New visual concept with material composition change'
        : 'Execution improvement on the same visual idea'
    });
  }

  return {
    understanding,
    visualIntent,
    visualConcept,
    compositionPlan,
    strategy,
    differencePlan,
    negativeConstraints: asArray(raw?.negativeConstraints).length
      ? asArray(raw?.negativeConstraints)
      : visualIntent.thingsToAvoid,
    usedGemini,
    modelUsed
  };
}

export { buildSiteVisualContext, inferArticleType };
