import { BANNED_PROMPT_WORDS, DEFAULT_PHOTOGRAPHY_STYLE } from './config.js';
import { contextNegatives, equipmentConstraintsFor } from './equipment.js';
import type {
  ArticleUnderstanding,
  CompositionPlan,
  ImagePromptVariables,
  ImageType,
  VisualConcept,
  VisualIntent,
  VisualStrategy
} from './types.js';

export function sanitizePromptLanguage(text: string): string {
  let out = text;
  for (const word of BANNED_PROMPT_WORDS) {
    const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function imageTypeRules(imageType: ImageType): string {
  switch (imageType) {
    case 'HERO':
      return 'Hero photograph: one strong article-specific subject, clear composition, enough quieter space for an optional title overlay without shrinking the subject into wallpaper.';
    case 'PRODUCT':
      return 'Product photograph: the product is visually dominant and identifiable.';
    case 'COMPARISON':
      return 'Comparison photograph: two subjects clearly distinguishable under the same conditions, no captions inside the image.';
    case 'TUTORIAL':
      return 'Tutorial photograph: the action or process is understandable in a single frame.';
    case 'DETAIL':
      return 'Detail photograph: a technically meaningful close-up, not a landscape with a tiny object.';
    case 'ENVIRONMENTAL':
      return 'Environmental photograph: the environment supports the topic instead of replacing it.';
    default:
      return 'Article photograph: documentary field context for this specific topic.';
  }
}

export function buildImagePrompt(options: {
  understanding: ArticleUnderstanding;
  intent: VisualIntent;
  concept: VisualConcept;
  composition: CompositionPlan;
  strategy: VisualStrategy;
  imageType: ImageType;
  hasReferenceImage?: boolean;
  promptVariables?: ImagePromptVariables;
  extraInstructions?: string;
}): string {
  const { understanding, intent, concept, composition, strategy, imageType, promptVariables } = options;
  const negatives = contextNegatives({
    imageType,
    humanPresence: intent.humanPresence,
    articleType: understanding.articleType,
    extra: [
      ...(intent.thingsToAvoid || []),
      ...(promptVariables?.negativeConstraints || [])
    ]
  });
  const equipmentLines = equipmentConstraintsFor(understanding.equipment);

  const lines: string[] = [];
  lines.push(
    `Photograph of ${concept.subject}. ${concept.action}. Environment: ${concept.environment}.`
  );
  lines.push(`This image must communicate: ${intent.visualMessage || understanding.oneVisualIdea}.`);
  lines.push(imageTypeRules(imageType));
  lines.push(
    `Spatial relationship: ${composition.subjectPlacement}. Foreground: ${composition.foreground}. Midground: ${composition.midground}. Background: ${composition.background}.`
  );
  lines.push(
    `Camera: ${composition.cameraAngle}. Height: ${composition.cameraHeight}. Shot: ${composition.shotScale}. Strategy: ${strategy.name}. ${promptVariables?.cameraOptics || ''}`
  );
  lines.push(
    `Light: ${promptVariables?.lightingAtmosphere || composition.lighting}. Natural exposure, believable shadows, restrained color.`
  );
  if (promptVariables?.natureElements) {
    lines.push(`Terrain: ${promptVariables.natureElements}.`);
  }
  if (concept.materials.length) {
    lines.push(`Materials: ${concept.materials.join(', ')}.`);
  }
  if (concept.technicalDetails.length || equipmentLines.length) {
    lines.push(
      `Technical details that must be physically plausible: ${[...concept.technicalDetails, ...equipmentLines].slice(0, 8).join('; ')}.`
    );
  }
  if (intent.humanPresence === 'none') {
    lines.push('No human figure required. Keep the frame on equipment and environment.');
  } else if (intent.humanPresence === 'hands_only') {
    lines.push('Show only real working hands with correct fingers, grip and interaction with the equipment.');
  } else {
    lines.push('If a person is visible, anatomy, posture and grip must be correct and the action must be useful, not a fashion pose.');
  }
  if (options.hasReferenceImage) {
    lines.push(
      'A product reference image is attached. Keep that product’s identity, proportions, colorway and construction. The environment may change; the product should not become a generic substitute.'
    );
  }
  if (promptVariables?.brandColorPalette?.colorApplication) {
    lines.push(
      `Optional restrained color harmony from the active site, only if it remains photographically natural: ${promptVariables.brandColorPalette.colorApplication}`
    );
  }
  lines.push(`Photography style: ${promptVariables?.visualStyle || DEFAULT_PHOTOGRAPHY_STYLE}`);
  lines.push(`Avoid: ${negatives.join(', ')}.`);
  if (options.extraInstructions) {
    lines.push(`Additional editor instruction: ${options.extraInstructions}`);
  }

  return sanitizePromptLanguage(lines.join(' '));
}

export function buildProfessionalShotBrief(
  concept: VisualConcept,
  strategy: VisualStrategy,
  _differencePlan?: unknown,
  referenceImageProvided = false,
  promptVariables?: ImagePromptVariables
): string {
  return buildImagePrompt({
    understanding: {
      title: concept.subject,
      primaryTopic: concept.subject,
      primaryKeyword: concept.subject,
      searchIntent: 'informational',
      articleType: 'informational',
      audience: '',
      products: [],
      equipment: [],
      importantEntities: [],
      importantInstructions: [],
      importantComparisons: [],
      problemsBeingSolved: [],
      keyConclusions: [],
      commercialIntent: '',
      oneVisualIdea: concept.whyItMatters || concept.whatIsShown || concept.subject
    },
    intent: {
      visualPurpose: concept.whyItMatters || concept.subject,
      mainSubject: concept.primarySubject || concept.subject,
      secondarySubjects: concept.secondarySubjects || [],
      action: concept.action,
      environment: concept.environment,
      context: concept.environment,
      importantDetails: concept.technicalDetails || [],
      humanPresence: /hand|hiker|person|climber/i.test(`${concept.action} ${concept.subject}`) ? 'partial' : 'none',
      productImportance: 'equal',
      technicalImportance: 'high',
      visualMessage: concept.whyItMatters || concept.subject,
      thingsToAvoid: []
    },
    concept,
    composition: {
      imageType: 'ARTICLE',
      strategyId: strategy.id,
      subjectPlacement: strategy.compositionPattern,
      cameraHeight: strategy.cameraAngle,
      cameraAngle: strategy.cameraAngle,
      shotScale: strategy.shotType,
      foreground: concept.foreground,
      midground: concept.midground || concept.subject,
      background: concept.background,
      lighting: concept.lighting || strategy.lighting,
      depthOfField: 'natural documentary depth',
      negativeSpace: '',
      photographyStyle: DEFAULT_PHOTOGRAPHY_STYLE
    },
    strategy,
    imageType: 'ARTICLE',
    hasReferenceImage: referenceImageProvided,
    promptVariables
  });
}

export function promptContainsBannedHype(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return BANNED_PROMPT_WORDS.some((word) => lower.includes(word.toLowerCase()));
}

export function buildCompositionFirstPrompt(options: {
  intent: VisualIntent;
  concept: VisualConcept;
  composition: CompositionPlan;
  strategy: VisualStrategy;
  imageType: ImageType;
  equipmentKind?: string;
  site?: { websiteName?: string; brand?: string; visualPreferences?: string };
  extraNegatives?: string[];
  referenceImageProvided?: boolean;
  executionNotes?: string[];
}): string {
  const { intent, concept, composition, strategy, imageType } = options;
  const negatives = contextNegatives({
    imageType,
    humanPresence: intent.humanPresence,
    articleType: 'informational',
    extra: [...(intent.thingsToAvoid || []), ...(options.extraNegatives || [])]
  });
  const equipmentLines = options.equipmentKind
    ? equipmentConstraintsFor(
        options.equipmentKind === 'four_season_tent'
          ? ['tent']
          : options.equipmentKind === 'trekking_poles'
            ? ['trekking_pole']
            : options.equipmentKind === 'hiking_boots'
              ? ['hiking_boot']
              : [options.equipmentKind]
      )
    : equipmentConstraintsFor([]);

  const lines = [
    `SUBJECT: ${concept.subject}`,
    `ACTION: ${concept.action}`,
    `SPATIAL RELATIONSHIP: ${composition.subjectPlacement}. The subject must remain article-specific and readable.`,
    `CAMERA: ${composition.camera || composition.cameraAngle || concept.camera}`,
    `FRAMING: ${composition.framing || composition.shotScale || strategy.shotType}`,
    `FOREGROUND: ${composition.foreground || concept.foreground}`,
    `MIDGROUND: ${composition.midground || concept.midground || concept.subject}`,
    `BACKGROUND: ${composition.background || concept.background}`,
    `LIGHT: ${composition.lighting || concept.lighting}`,
    `MATERIAL: ${(concept.materials || []).join(', ') || 'realistic outdoor materials'}`,
    `ENVIRONMENT: ${concept.environment}`,
    `TECHNICAL DETAILS: ${(concept.technicalDetails || []).concat(equipmentLines).slice(0, 8).join('; ')}`,
    `VISUAL MESSAGE: ${intent.visualMessage}`,
    `IMAGE TYPE RULE: ${imageTypeRules(imageType)}`,
    `STRATEGY: ${strategy.name} — ${strategy.compositionPattern}`,
    `PHOTOGRAPHY STYLE: ${composition.photographyStyle || DEFAULT_PHOTOGRAPHY_STYLE}`,
    options.site?.visualPreferences ? `SITE VISUAL PREFERENCES: ${options.site.visualPreferences}` : '',
    options.referenceImageProvided
      ? 'PRODUCT REFERENCE: keep the attached product identity; environment may change.'
      : '',
    intent.humanPresence === 'none'
      ? 'HUMAN PRESENCE: none required.'
      : `HUMAN PRESENCE: ${intent.humanPresence}. Hands, grip and posture must be anatomically correct.`,
    `AVOID: ${negatives.join(', ')}.`,
    options.executionNotes?.length ? `EXECUTION NOTES: ${options.executionNotes.join(' | ')}` : ''
  ].filter(Boolean);

  return sanitizePromptLanguage(lines.join('\n'));
}
