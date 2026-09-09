import type { ArticleVisualType, ImageType, VisualStrategy, VisualStrategyId } from './types.js';

export const VISUAL_STRATEGIES: VisualStrategy[] = [
  {
    id: 'environmental_editorial',
    name: 'Environmental editorial',
    nameFa: 'عکاسی محیطی سردبیری',
    shotType: 'Medium-wide editorial environmental photograph',
    cameraAngle: 'Eye-level to slightly low, documentary stance',
    lighting: 'Natural overcast or open-shade daylight',
    perspective: 'Subject grounded in a specific working environment',
    compositionPattern: 'Subject on a third, readable foreground-to-background depth',
    bestFor: ['HERO', 'ARTICLE', 'ENVIRONMENTAL']
  },
  {
    id: 'human_action',
    name: 'Human action',
    nameFa: 'کنش انسانی',
    shotType: 'Medium action photograph of a specific useful task',
    cameraAngle: 'Three-quarter eye level',
    lighting: 'Natural directional daylight',
    perspective: 'A real person performing one article-specific action',
    compositionPattern: 'Hands and equipment occupy the focal plane',
    bestFor: ['TUTORIAL', 'ARTICLE', 'HERO']
  },
  {
    id: 'product_in_context',
    name: 'Product in context',
    nameFa: 'محصول در موقعیت واقعی',
    shotType: 'Product-dominant field photograph',
    cameraAngle: 'Waist-height three-quarter',
    lighting: 'Soft natural daylight revealing materials',
    perspective: 'The product is the hero; environment supports it',
    compositionPattern: 'Product fills a large portion of the frame, environment secondary',
    bestFor: ['PRODUCT', 'HERO', 'ARTICLE']
  },
  {
    id: 'product_detail',
    name: 'Product detail',
    nameFa: 'جزئیات محصول',
    shotType: 'Close editorial product photograph',
    cameraAngle: '45-degree close view',
    lighting: 'Raking natural light across texture',
    perspective: 'Construction and materials are readable',
    compositionPattern: 'Product occupies most of the frame with a thin environmental edge',
    bestFor: ['PRODUCT', 'DETAIL']
  },
  {
    id: 'macro_detail',
    name: 'Macro detail',
    nameFa: 'ماکرو فنی',
    shotType: 'Tight macro of a technically meaningful part',
    cameraAngle: 'Direct close-up',
    lighting: 'Directional natural raking light',
    perspective: 'One mechanism, seam, sole, buckle, or fabric structure',
    compositionPattern: 'Fill-frame detail, almost no landscape',
    bestFor: ['DETAIL', 'PRODUCT']
  },
  {
    id: 'pov',
    name: 'Point of view',
    nameFa: 'زاویه دید اول‌شخص',
    shotType: 'First-person working viewpoint',
    cameraAngle: 'Looking down from eye level toward hands and gear',
    lighting: 'Daylight falling naturally on hands',
    perspective: 'Reader is performing the action',
    compositionPattern: 'Hands in lower third, equipment in midground',
    bestFor: ['TUTORIAL', 'ARTICLE']
  },
  {
    id: 'overhead',
    name: 'Overhead',
    nameFa: 'نمای بالا',
    shotType: 'Top-down organized photograph',
    cameraAngle: '90-degree overhead',
    lighting: 'Even soft daylight',
    perspective: 'Layout and comparison of objects on one surface',
    compositionPattern: 'Grid-like separation, equal visual weight',
    bestFor: ['COMPARISON', 'TUTORIAL']
  },
  {
    id: 'ground_level',
    name: 'Ground level',
    nameFa: 'هم‌سطح زمین',
    shotType: 'Ground-level photograph emphasizing contact with terrain',
    cameraAngle: 'Camera almost on the ground, slight upward tilt',
    lighting: 'Natural daylight with readable ground texture',
    perspective: 'Terrain interaction is the story',
    compositionPattern: 'Foreground terrain leads to the subject',
    bestFor: ['HERO', 'PRODUCT', 'ENVIRONMENTAL']
  },
  {
    id: 'low_angle',
    name: 'Low angle',
    nameFa: 'زاویه پایین',
    shotType: 'Low-angle photograph giving structural presence',
    cameraAngle: 'Low three-quarter',
    lighting: 'Natural daylight, no heroic cinematic glow',
    perspective: 'Structure and stability read clearly',
    compositionPattern: 'Subject rises from a specific foreground',
    bestFor: ['HERO', 'ENVIRONMENTAL']
  },
  {
    id: 'side_profile',
    name: 'Side profile',
    nameFa: 'نمای نیمرخ',
    shotType: 'True side-profile photograph',
    cameraAngle: '90-degree side view',
    lighting: 'Even daylight showing silhouette and proportions',
    perspective: 'True proportions of equipment or stance',
    compositionPattern: 'Subject in profile against a quieter background',
    bestFor: ['PRODUCT', 'COMPARISON', 'TUTORIAL']
  },
  {
    id: 'inside_equipment',
    name: 'Inside equipment',
    nameFa: 'نمای داخل تجهیزات',
    shotType: 'Interior or packed-volume photograph',
    cameraAngle: 'From inside or looking into an opening',
    lighting: 'Mixed interior ambient and exterior daylight',
    perspective: 'Interior architecture, packing, or vestibule logic',
    compositionPattern: 'Frame-within-a-frame using the equipment opening',
    bestFor: ['DETAIL', 'TUTORIAL', 'ARTICLE']
  },
  {
    id: 'flat_lay',
    name: 'Flat lay',
    nameFa: 'چیدمان تخت',
    shotType: 'Intentional flat-lay of article-specific items',
    cameraAngle: 'Top-down',
    lighting: 'Even soft light, no hard advertising gloss',
    perspective: 'Selected items that belong to this article, not a generic kit dump',
    compositionPattern: 'Clear grouping with breathing room',
    bestFor: ['COMPARISON', 'TUTORIAL', 'PRODUCT']
  },
  {
    id: 'technical_demonstration',
    name: 'Technical demonstration',
    nameFa: 'نمایش فنی',
    shotType: 'Instructional demonstration of a correct setup',
    cameraAngle: '45-degree medium close',
    lighting: 'Clear documentary daylight',
    perspective: 'The viewer can understand the mechanical relationship',
    compositionPattern: 'Hands, mechanism, and result visible together',
    bestFor: ['TUTORIAL', 'ARTICLE', 'DETAIL']
  },
  {
    id: 'controlled_comparison',
    name: 'Controlled comparison',
    nameFa: 'مقایسه کنترل‌شده',
    shotType: 'Side-by-side comparison under identical conditions',
    cameraAngle: 'Frontal or overhead, centered between subjects',
    lighting: 'Neutral even daylight, equal exposure',
    perspective: 'Two variants clearly distinguishable without labels',
    compositionPattern: 'Bilateral balance, clean gap, no fake text',
    bestFor: ['COMPARISON']
  },
  {
    id: 'step_by_step',
    name: 'Step-by-step tutorial',
    nameFa: 'آموزش مرحله‌ای',
    shotType: 'Single clear instructional moment from a process',
    cameraAngle: 'Operator viewpoint, 45 degrees',
    lighting: 'High-visibility daylight',
    perspective: 'One understandable step, not a montage collage',
    compositionPattern: 'Action centered, tools and next object nearby',
    bestFor: ['TUTORIAL']
  }
];

const ARTICLE_TYPE_STRATEGIES: Record<ArticleVisualType, VisualStrategyId[]> = {
  buying_guide: ['product_in_context', 'controlled_comparison', 'product_detail'],
  how_to: ['human_action', 'technical_demonstration', 'step_by_step', 'pov'],
  product_review: ['product_in_context', 'product_detail', 'macro_detail'],
  comparison: ['controlled_comparison', 'overhead', 'side_profile'],
  tutorial: ['step_by_step', 'human_action', 'pov', 'technical_demonstration'],
  travel: ['environmental_editorial', 'ground_level', 'low_angle'],
  equipment_guide: ['product_in_context', 'product_detail', 'macro_detail'],
  technical: ['technical_demonstration', 'macro_detail', 'inside_equipment'],
  list: ['product_in_context', 'environmental_editorial', 'flat_lay'],
  informational: ['environmental_editorial', 'product_in_context', 'human_action']
};

const IMAGE_TYPE_STRATEGIES: Record<ImageType, VisualStrategyId[]> = {
  HERO: ['environmental_editorial', 'product_in_context', 'human_action', 'low_angle', 'ground_level'],
  ARTICLE: ['product_in_context', 'human_action', 'environmental_editorial', 'technical_demonstration'],
  PRODUCT: ['product_in_context', 'product_detail', 'macro_detail', 'side_profile'],
  COMPARISON: ['controlled_comparison', 'overhead', 'flat_lay', 'side_profile'],
  TUTORIAL: ['human_action', 'technical_demonstration', 'step_by_step', 'pov'],
  DETAIL: ['macro_detail', 'product_detail', 'inside_equipment'],
  ENVIRONMENTAL: ['environmental_editorial', 'ground_level', 'low_angle']
};

export function getStrategyById(id: string | undefined): VisualStrategy | undefined {
  return VISUAL_STRATEGIES.find((s) => s.id === id);
}

export function eligibleStrategyIds(articleType: ArticleVisualType, imageType: ImageType): VisualStrategyId[] {
  const byArticle = ARTICLE_TYPE_STRATEGIES[articleType] || ARTICLE_TYPE_STRATEGIES.informational;
  const byImage = IMAGE_TYPE_STRATEGIES[imageType] || IMAGE_TYPE_STRATEGIES.ARTICLE;
  const intersection = byImage.filter((id) => byArticle.includes(id));
  return intersection.length > 0 ? intersection : byImage;
}

export function pickStrategy(options: {
  articleType: ArticleVisualType;
  imageType: ImageType;
  previousStrategyIds?: string[];
  preferredId?: string;
  forceDifferent?: boolean;
}): VisualStrategy {
  const eligible = eligibleStrategyIds(options.articleType, options.imageType);
  const previous = options.previousStrategyIds || [];
  const unused = eligible.filter((id) => !previous.includes(id));
  const pool = unused.length > 0 ? unused : eligible;

  if (options.preferredId && pool.includes(options.preferredId as VisualStrategyId) && !options.forceDifferent) {
    return getStrategyById(options.preferredId)!;
  }

  if (options.forceDifferent && options.preferredId) {
    const different = pool.find((id) => id !== options.preferredId);
    if (different) return getStrategyById(different)!;
  }

  if (options.preferredId && eligible.includes(options.preferredId as VisualStrategyId) && !previous.includes(options.preferredId)) {
    return getStrategyById(options.preferredId)!;
  }

  return getStrategyById(pool[0])!;
}

export const IMAGE_TYPE_DEFAULT_STRATEGY: Record<ImageType, VisualStrategyId> = {
  HERO: 'product_in_context',
  ARTICLE: 'product_in_context',
  PRODUCT: 'product_in_context',
  COMPARISON: 'controlled_comparison',
  TUTORIAL: 'technical_demonstration',
  DETAIL: 'macro_detail',
  ENVIRONMENTAL: 'environmental_editorial'
};

export { ARTICLE_TYPE_STRATEGIES, IMAGE_TYPE_STRATEGIES };
export { inferArticleType } from './articleContext.js';

export function strategiesFor(imageType: ImageType, articleType: ArticleVisualType): VisualStrategy[] {
  return eligibleStrategyIds(articleType, imageType).map((id) => {
    const strategy = getStrategyById(id)!;
    const articleTypes = (Object.entries(ARTICLE_TYPE_STRATEGIES) as Array<[ArticleVisualType, VisualStrategyId[]]>)
      .filter(([, ids]) => ids.includes(strategy.id))
      .map(([type]) => type);
    return {
      ...strategy,
      imageTypes: strategy.bestFor,
      articleTypes,
      humanPresence:
        strategy.id === 'human_action' || strategy.id === 'pov' || strategy.id === 'step_by_step' || strategy.id === 'technical_demonstration'
          ? 'partial'
          : 'none'
    };
  });
}

export function selectStrategyDeterministic(options: {
  imageType: ImageType;
  articleType: ArticleVisualType;
  previousStrategyIds?: string[];
  preferredId?: VisualStrategyId | string;
  forceDifferent?: boolean;
}): VisualStrategy {
  return pickStrategy({
    articleType: options.articleType,
    imageType: options.imageType,
    previousStrategyIds: options.previousStrategyIds,
    preferredId: options.preferredId,
    forceDifferent: options.forceDifferent ?? Boolean(options.previousStrategyIds?.length)
  });
}
