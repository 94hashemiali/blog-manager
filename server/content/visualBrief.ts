import type { ArticleBriefVisualContext } from '../visual/types.js';
import type { ArticleKind } from '../intelligence/types.js';
import type { ArticleDraft, ContentBrief, ResearchPacket, VisualBrief } from './types.js';

function roleFor(articleType: ArticleKind): string {
  switch (articleType) {
    case 'comparison':
      return 'مقالهٔ مقایسه‌ای؛ تصویر باید تفاوت گزینه‌ها را نشان دهد';
    case 'how_to':
    case 'tutorial':
      return 'مقالهٔ آموزشی؛ تصویر باید لحظهٔ انجام کار را نشان دهد';
    case 'buying_guide':
      return 'راهنمای خرید؛ تصویر باید معیار انتخاب را قابل دیدن کند';
    case 'product_review':
      return 'بررسی محصول؛ تصویر باید جزئیات ساخت محصول را نشان دهد';
    case 'technical':
      return 'مقالهٔ فنی؛ تصویر باید جزئیات مکانیکی یا متریال را نشان دهد';
    default:
      return 'مقالهٔ اطلاعاتی؛ تصویر باید زمینهٔ واقعی استفاده را نشان دهد';
  }
}

function compositionFor(articleType: ArticleKind): string {
  switch (articleType) {
    case 'comparison':
      return 'دو یا سه سوژه در یک فریم با فاصلهٔ مشخص و نور یکسان';
    case 'how_to':
    case 'tutorial':
      return 'نمای نزدیک دست‌ها و ابزار، عمق میدان کم';
    case 'product_review':
      return 'نمای سه‌چهارم محصول با جزئیات دوخت و اتصالات';
    default:
      return 'نمای متوسط با سوژهٔ مشخص در پیش‌زمینه و محیط قابل تشخیص در پس‌زمینه';
  }
}

/**
 * Translates the content brief into the visual contract that the existing Art
 * Director pipeline consumes. This module does not generate images; it only
 * states what the image must show and what it must not become.
 */
export function buildVisualBrief(params: {
  brief: Pick<
    ContentBrief,
    'workingTitle' | 'primaryKeyword' | 'recommendedArticleType' | 'recommendedAngle' | 'productsToMention' | 'targetAudience'
  >;
  research?: Pick<ResearchPacket, 'productInformation' | 'evidence'>;
}): VisualBrief {
  const { brief } = params;
  const products = brief.productsToMention.filter(Boolean);
  const catalogAttributes = (params.research?.productInformation || [])
    .flatMap((product) => product.knownAttributes)
    .filter(Boolean);

  // Only attributes that came from the catalog are passed through as facts.
  const technicalFacts = [...new Set(catalogAttributes)].slice(0, 6);

  return {
    articleRole: roleFor(brief.recommendedArticleType),
    imagePurpose: brief.recommendedAngle || `نشان دادن موضوع «${brief.workingTitle}» به شکل مشخص و غیرکلی`,
    requiredSubject: products[0] || brief.primaryKeyword,
    composition: compositionFor(brief.recommendedArticleType),
    equipment: products.slice(0, 4),
    environment: 'محیط واقعی استفاده متناسب با موضوع مقاله، بدون صحنه‌آرایی استودیویی اضافی',
    technicalFacts,
    prohibitedConcepts: [
      'غروب کلیشه‌ای کوهستان بدون سوژهٔ مشخص',
      'عکس استوک عمومی بدون ارتباط با موضوع',
      'متن یا لوگوی جعلی روی تصویر',
      'نمایش مشخصات فنی نادرست روی محصول'
    ],
    placement: 'تصویر شاخص بالای مقاله',
    altTextHint: `${brief.workingTitle} — ${products[0] || brief.primaryKeyword}`
  };
}

/**
 * Adapter to the existing visual engine. The Art Director, prompt builder,
 * critic and novelty stages are unchanged; this only supplies them with the
 * production brief instead of a bare topic string.
 */
export function toVisualEngineRequest(params: {
  brief: ContentBrief;
  visualBrief: VisualBrief;
  draft?: ArticleDraft;
  siteId: string;
}): {
  siteId: string;
  title: string;
  content: string;
  imageType: 'HERO';
  articleBrief: ArticleBriefVisualContext;
} {
  const { brief, visualBrief } = params;
  return {
    siteId: params.siteId,
    title: params.draft?.title || brief.workingTitle,
    content: params.draft?.content || brief.outline.map((section) => `## ${section.heading}\n${section.purpose}`).join('\n\n'),
    imageType: 'HERO',
    articleBrief: {
      uniqueAngle: brief.recommendedAngle,
      contentCluster: brief.internalLinks[0]?.targetTitle,
      primaryKeyword: brief.primaryKeyword,
      secondaryKeywords: brief.secondaryKeywords,
      searchIntent: brief.searchIntent,
      audience: brief.targetAudience,
      productsToMention: brief.productsToMention,
      requiredSections: brief.outline.map((section) => section.heading),
      visualIntent: {
        visualPurpose: visualBrief.imagePurpose,
        mainSubjectHint: visualBrief.requiredSubject,
        thingsToAvoid: visualBrief.prohibitedConcepts
      }
    }
  };
}
