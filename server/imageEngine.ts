/**
 * Public image-generation API.
 * Implementation lives in server/visual/* so this file stays a compatibility facade.
 */
export {
  generateMasterVisualAsset,
  generateVisualAsset,
  generateHeroImage,
  generateArticleImage,
  generateProductImage,
  generateComparisonImage,
  generateTutorialImage,
  generateArticleImagePlan,
  loadQualityThresholds,
  qualityGateDecision,
  VISUAL_STRATEGIES,
  FEEDBACK_OPTIONS,
  createVisualJob,
  updateVisualJob,
  getVisualJob,
  GENERATION_STAGES
} from './visual/index.js';

export type {
  ImageType,
  StructuredArticleContext,
  VisualConcept,
  VisualStrategy,
  DifferencePlan,
  ImageQualityEvaluation,
  GeneratedImageAsset,
  GenerateMasterVisualParams,
  ImagePromptVariables,
  VisualPipelineResult,
  GenerationStage,
  ImageFeedbackCode
} from './visual/index.js';
