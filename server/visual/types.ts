export type ImageType =
  | 'HERO'
  | 'ARTICLE'
  | 'PRODUCT'
  | 'COMPARISON'
  | 'TUTORIAL'
  | 'DETAIL'
  | 'ENVIRONMENTAL';

export type ArticleVisualType =
  | 'buying_guide'
  | 'how_to'
  | 'product_review'
  | 'comparison'
  | 'tutorial'
  | 'travel'
  | 'equipment_guide'
  | 'technical'
  | 'list'
  | 'informational';

export type VisualStrategyId =
  | 'environmental_editorial'
  | 'human_action'
  | 'product_in_context'
  | 'product_detail'
  | 'macro_detail'
  | 'pov'
  | 'overhead'
  | 'ground_level'
  | 'low_angle'
  | 'side_profile'
  | 'inside_equipment'
  | 'flat_lay'
  | 'technical_demonstration'
  | 'controlled_comparison'
  | 'step_by_step';

export type ImageFeedbackCode =
  | 'too_generic'
  | 'doesnt_match_article'
  | 'wrong_subject'
  | 'wrong_product'
  | 'product_too_small'
  | 'too_cinematic'
  | 'too_artificial'
  | 'wrong_environment'
  | 'wrong_composition'
  | 'anatomy_problem'
  | 'equipment_problem'
  | 'too_similar'
  | 'other';

export type FeedbackCode = ImageFeedbackCode;

export type GenerationStage =
  | 'understanding_article'
  | 'planning_visual_concept'
  | 'planning_composition'
  | 'generating_image'
  | 'evaluating_image'
  | 'checking_originality'
  | 'finalizing';

export interface SiteVisualContext {
  id?: string;
  siteId?: string;
  name?: string;
  websiteName?: string;
  brand: string;
  language: string;
  audience: string;
  niche: string;
  categories: string[];
  products: string[];
  contentStyle: string;
  visualPreferences: string;
  isMadaniCamp?: boolean;
}

export interface StructuredArticleContext {
  title: string;
  content?: string;
  sections?: { heading: string; text?: string }[];
  keywords?: string[];
  products?: string[];
  category?: string;
  searchIntent?: string;
  targetReader?: string;
  primaryKeyword?: string;
}

export interface ArticleRepresentation {
  title: string;
  primaryTopic: string;
  primaryKeyword: string;
  searchIntent: string;
  articleType: ArticleVisualType;
  audience: string;
  products: string[];
  equipment: string[];
  importantEntities: string[];
  headings: string[];
  intro: string;
  conclusion: string;
  sectionExcerpts: { heading: string; text: string }[];
  lists: string[];
  wordCount: number;
}

export interface ArticleUnderstanding {
  title: string;
  primaryTopic: string;
  primaryKeyword: string;
  searchIntent: string;
  articleType: ArticleVisualType;
  audience: string;
  products: string[];
  equipment: string[];
  importantEntities?: string[];
  importantInstructions?: string[];
  importantComparisons?: string[];
  problemsBeingSolved?: string[];
  entities?: string[];
  instructions?: string[];
  comparisons?: string[];
  problemsSolved?: string[];
  keyConclusions: string[];
  commercialIntent: string;
  oneVisualIdea: string;
}

export interface VisualIntent {
  visualPurpose: string;
  mainSubject: string;
  secondarySubjects: string[];
  action: string;
  environment: string;
  context: string;
  importantDetails: string[];
  humanPresence: 'none' | 'hands_only' | 'partial' | 'full_figure';
  productImportance: 'dominant' | 'equal' | 'supporting';
  technicalImportance: 'high' | 'medium' | 'low';
  visualMessage: string;
  thingsToAvoid: string[];
}

export interface VisualConcept {
  subject: string;
  action: string;
  environment: string;
  camera: string;
  composition: string;
  foreground: string;
  midground?: string;
  background: string;
  lighting: string;
  materials: string[];
  technicalDetails: string[];
  whatIsShown?: string;
  whyItMatters?: string;
  primarySubject?: string;
  secondarySubjects?: string[];
  compositionIdea?: string;
}

export interface CompositionPlan {
  imageType: ImageType;
  strategyId: VisualStrategyId | string;
  subjectPlacement: string;
  cameraHeight?: string;
  cameraAngle?: string;
  shotScale?: string;
  camera?: string;
  framing?: string;
  foreground: string;
  midground: string;
  background: string;
  lighting: string;
  depthOfField: string;
  negativeSpace: string;
  photographyStyle: string;
}

export interface VisualStrategy {
  id: VisualStrategyId;
  name: string;
  nameFa: string;
  shotType: string;
  cameraAngle: string;
  lighting: string;
  perspective: string;
  compositionPattern: string;
  bestFor?: ImageType[];
  imageTypes?: ImageType[];
  articleTypes?: ArticleVisualType[];
  humanPresence?: VisualIntent['humanPresence'] | 'none' | string;
}

export interface DifferencePlan {
  previousStrategyId?: string;
  newStrategyId: VisualStrategyId;
  changedDimensions: string[];
  reason: string;
}

export interface ImageQualityEvaluation {
  overall: number;
  articleRelevance: number;
  specificity: number;
  photographicRealism: number;
  composition: number;
  technicalAccuracy: number;
  anatomy: number;
  genericness: number;
  novelty: number;
  equipmentAccuracy?: number;
  visualClarity?: number;
  issues: string[];
  shouldRegenerate: boolean;
  reason: string;
  nextStrategy?: Partial<CompositionPlan> & {
    strategyId?: VisualStrategyId | string;
    keepConcept?: boolean;
    adjustments?: string[];
  };
  environment?: number;
  evaluatedFromActualImage?: boolean;
  relevance?: number;
  realism?: number;
  problems?: string[];
  humanAnatomy?: number;
  subjectClarity?: number;
  editorialQuality?: number;
  visualNovelty?: number;
}

export interface NoveltyEvaluation {
  exactDuplicate: boolean;
  sha256Match?: boolean;
  sha256?: string;
  perceptualHash?: string;
  perceptualSimilarity?: number;
  compositionSimilarity: number;
  semanticSimilarity: number;
  noveltyScore: number;
  isAcceptable?: boolean;
  tooSimilar?: boolean;
  reason?: string;
  comparedAgainst?: number;
  rejectionReason?: string;
}

export interface CompositionFingerprint {
  dominantSubject?: string;
  visualStrategy?: string;
  cameraStrategy?: string;
  shotType?: string;
  environmentClass?: string;
  subjectPlacement?: string;
  humanPresence: boolean;
  timeOfDay?: string;
  weather?: string;
  composition?: string;
  visualHierarchy?: string;
  subject?: string;
  cameraAngle?: string;
  environment?: string;
  dominantObjects?: string[];
}

export interface ImagePromptVariables {
  visualStyle?: string;
  brandColorPalette?: {
    primaryColor?: string;
    secondaryColor?: string;
    brandName?: string;
    colorApplication?: string;
  };
  natureElements?: string;
  lightingAtmosphere?: string;
  technicalGearMaterials?: string[];
  cameraOptics?: string;
  negativeConstraints?: string[];
}

export interface GeneratedImageAsset {
  id: string;
  imageId: string;
  siteId: string;
  articleId?: string | number;
  lineageId?: string;
  familyId?: string;
  parentImageId?: string;
  type: ImageType;
  imageType: ImageType;
  version: number;
  generationVersion: number;
  source: 'gemini' | 'unsplash_fallback';
  prompt: string;
  visualIntent?: VisualIntent;
  visualConcept: VisualConcept;
  compositionPlan?: CompositionPlan;
  visualBrief: Record<string, any>;
  strategy: VisualStrategy;
  differencePlan?: DifferencePlan;
  fingerprint: CompositionFingerprint;
  hash: string;
  perceptualHash: string;
  quality: ImageQualityEvaluation;
  genericnessScore: number;
  noveltyScore: number;
  noveltyEvaluation?: NoveltyEvaluation;
  userFeedback?: {
    code: FeedbackCode | string;
    text?: string;
  };
  status: 'active' | 'candidate' | 'rejected' | 'accepted';
  rejectionReason?: string;
  referenceImageUrl?: string;
  url: string;
  aspectRatio: string;
  createdAt: string;
  persianCaption: string;
  persianTitle: string;
  semanticDescription?: string;
  isAiGenerated: boolean;
  generationError?: string;
  modelUsed?: string;
  attempts?: number;
  attempt?: number;
  issues?: string[];
  stageHistory?: GenerationStage[];
}

export interface FallbackImage {
  id: string;
  title: string;
  perspective?: string;
  url: string;
  description?: string;
  isAiGenerated: false;
  source: 'unsplash_fallback';
}

export interface PipelineFailure {
  success: false;
  stage: string;
  errorCode: string;
  message: string;
  retryable: boolean;
  fallbackOptions?: FallbackImage[];
  fallbackImages?: FallbackImage[];
}

export interface PipelineSuccess {
  success: true;
  imageUrl: string;
  image: GeneratedImageAsset;
  variations: any[];
  persianCaption: string;
  detailedPrompt: string;
  promptSuggestions: string[];
  source: 'gemini';
  message: string;
  strategy?: VisualStrategy;
  visualConcept?: VisualConcept;
  visualIntent?: VisualIntent;
  quality?: ImageQualityEvaluation;
  attempts?: number;
}

export type PipelineResult = PipelineSuccess | PipelineFailure;
export type VisualPipelineResult = PipelineResult;

export interface GenerateMasterVisualParams {
  siteId?: string;
  articleId?: string | number;
  imageType?: ImageType;
  article?: StructuredArticleContext;
  title?: string;
  content?: string;
  prompt?: string;
  section?: string;
  aspectRatio?: string;
  userFeedback?: string;
  userInstructions?: string;
  feedbackCode?: ImageFeedbackCode;
  promptVariables?: ImagePromptVariables;
  rejectionFeedback?: {
    reason: string;
    previousImageId?: string;
    adjustments?: string;
    code?: ImageFeedbackCode;
  };
  productReferenceImage?: string;
  previousGenerations?: string[];
  previousImageId?: string;
  forceNewStrategy?: boolean;
  regenerationMode?: 'new' | 'same_concept' | 'different_concept';
  familyId?: string;
  lineageId?: string;
  async?: boolean;
  onStage?: (stage: GenerationStage, detail?: string) => void;
}

export type ArticleType = ArticleVisualType;
export type RegenerationMode = 'new' | 'same_concept' | 'different_concept';
