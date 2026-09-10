import {
  generateMasterVisualAsset,
  type GenerateMasterVisualParams,
  type ImageType,
  type StructuredArticleContext
} from './imageEngine.js';

export interface GenerateVisualParams {
  siteId: string;
  articleId?: string | number;
  imageType: ImageType;
  title?: string;
  topic?: string;
  content?: string;
  article?: StructuredArticleContext;
  section?: string;
  aspectRatio?: string;
  userInstructions?: string;
  userFeedback?: string;
  feedbackCode?: GenerateMasterVisualParams['feedbackCode'];
  productReferenceImage?: string;
  rejectionFeedback?: {
    reason: string;
    previousImageId?: string;
    adjustments?: string;
    code?: GenerateMasterVisualParams['feedbackCode'];
  };
  previousGenerations?: string[];
  previousImageId?: string;
  forceNewStrategy?: boolean;
  regenerationMode?: GenerateMasterVisualParams['regenerationMode'];
  familyId?: string;
  promptVariables?: GenerateMasterVisualParams['promptVariables'];
  articleBrief?: GenerateMasterVisualParams['articleBrief'];
  onStage?: GenerateMasterVisualParams['onStage'];
}

export async function generateVisualAsset(params: GenerateVisualParams) {
  const effectiveTitle = params.title || params.topic || 'تجهیزات کوهنوردی و طبیعت‌گردی';
  const effectiveArticle: StructuredArticleContext = params.article || {
    title: effectiveTitle,
    content: params.content || '',
    sections: params.section ? [{ heading: params.section, text: '' }] : []
  };

  const userFeedback = params.userFeedback || params.userInstructions ||
    (params.rejectionFeedback
      ? `${params.rejectionFeedback.reason} ${params.rejectionFeedback.adjustments || ''}`.trim()
      : undefined);

  return generateMasterVisualAsset({
    siteId: params.siteId,
    articleId: params.articleId,
    imageType: params.imageType || 'HERO',
    article: effectiveArticle,
    title: effectiveTitle,
    content: params.content,
    section: params.section,
    aspectRatio: params.aspectRatio || '16:9',
    userFeedback,
    feedbackCode: params.feedbackCode || params.rejectionFeedback?.code,
    productReferenceImage: params.productReferenceImage,
    previousGenerations: params.previousGenerations,
    previousImageId: params.previousImageId || params.rejectionFeedback?.previousImageId,
    forceNewStrategy: Boolean(params.rejectionFeedback || params.forceNewStrategy),
    regenerationMode: params.regenerationMode || (params.forceNewStrategy ? 'different_concept' : 'new'),
    familyId: params.familyId,
    promptVariables: params.promptVariables,
    articleBrief: params.articleBrief,
    rejectionFeedback: params.rejectionFeedback,
    onStage: params.onStage
  });
}
