// Unified Visual Engine re-exporting and wrapping the comprehensive imageEngine
export * from './imageEngine.js';
import {
  generateMasterVisualAsset,
  ImageType,
  StructuredArticleContext
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
  productReferenceImage?: string;
  rejectionFeedback?: {
    reason: string;
    previousImageId?: string;
    adjustments?: string;
  };
  previousGenerations?: string[];
  forceNewStrategy?: boolean;
}

export async function generateVisualAsset(params: GenerateVisualParams) {
  const effectiveTitle = params.title || params.topic || 'تجهیزات کوهنوردی و طبیعت‌گردی';
  const effectiveArticle: StructuredArticleContext = params.article || {
    title: effectiveTitle,
    content: params.content || '',
    sections: params.section ? [{ heading: params.section, text: '' }] : []
  };

  const userFeedback = params.rejectionFeedback
    ? `${params.rejectionFeedback.reason} ${params.rejectionFeedback.adjustments || ''}`.trim()
    : params.userInstructions;

  return generateMasterVisualAsset({
    siteId: params.siteId || 'site-madanicamp',
    articleId: params.articleId,
    imageType: params.imageType || 'HERO',
    article: effectiveArticle,
    title: effectiveTitle,
    content: params.content,
    section: params.section,
    aspectRatio: params.aspectRatio || '16:9',
    userFeedback,
    productReferenceImage: params.productReferenceImage,
    previousGenerations: params.previousGenerations,
    forceNewStrategy: Boolean(params.rejectionFeedback || params.forceNewStrategy)
  });
}
