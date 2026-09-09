import type { ImageFeedbackCode, VisualStrategyId } from './types.js';

export interface FeedbackDirection {
  code: ImageFeedbackCode;
  increaseSpecificity: boolean;
  avoidCinematic: boolean;
  enlargeProduct: boolean;
  changeConcept: boolean;
  instructions: string[];
  preferredStrategy?: VisualStrategyId;
}

const DIRECTIONS: Record<ImageFeedbackCode, FeedbackDirection> = {
  too_generic: {
    code: 'too_generic',
    increaseSpecificity: true,
    avoidCinematic: true,
    enlargeProduct: false,
    changeConcept: true,
    preferredStrategy: 'technical_demonstration',
    instructions: [
      'Increase article-specific action and identifiable equipment characteristics',
      'Avoid generic scenic mountain/tent/sunset compositions',
      'Make the photograph unusable for a different article on a different topic'
    ]
  },
  doesnt_match_article: {
    code: 'doesnt_match_article',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: true,
    instructions: [
      'Rebuild the visual idea from the article’s one core teaching point',
      'Show the exact subject named by the title and conclusions'
    ]
  },
  wrong_subject: {
    code: 'wrong_subject',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: true,
    changeConcept: true,
    instructions: ['Change the main subject to the article’s actual equipment or action']
  },
  wrong_product: {
    code: 'wrong_product',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: true,
    changeConcept: true,
    preferredStrategy: 'product_in_context',
    instructions: ['Match the referenced product identity; do not invent a generic substitute']
  },
  product_too_small: {
    code: 'product_too_small',
    increaseSpecificity: false,
    avoidCinematic: true,
    enlargeProduct: true,
    changeConcept: false,
    preferredStrategy: 'product_detail',
    instructions: [
      'Increase product prominence; product on the focal plane',
      'Move closer; reduce distracting background landscape'
    ]
  },
  too_cinematic: {
    code: 'too_cinematic',
    increaseSpecificity: false,
    avoidCinematic: true,
    enlargeProduct: false,
    changeConcept: false,
    instructions: [
      'Natural lighting, restrained grading, editorial photography',
      'No golden-hour hero glow, no teal-and-orange, no epic sky'
    ]
  },
  too_artificial: {
    code: 'too_artificial',
    increaseSpecificity: false,
    avoidCinematic: true,
    enlargeProduct: false,
    changeConcept: false,
    instructions: [
      'More photographic realism: imperfections, believable dirt, fabric wrinkles, accurate shadows'
    ]
  },
  wrong_environment: {
    code: 'wrong_environment',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: true,
    instructions: ['Change terrain and weather to match the article’s stated conditions']
  },
  wrong_composition: {
    code: 'wrong_composition',
    increaseSpecificity: false,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: false,
    instructions: ['Change camera height, subject placement, and foreground/background relationship']
  },
  anatomy_problem: {
    code: 'anatomy_problem',
    increaseSpecificity: false,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: false,
    preferredStrategy: 'product_in_context',
    instructions: [
      'If humans remain, hands/fingers/joints must be anatomically correct',
      'Prefer hands-only or no people if anatomy risk is high'
    ]
  },
  equipment_problem: {
    code: 'equipment_problem',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: false,
    preferredStrategy: 'product_detail',
    instructions: ['Fix physical construction: proportions, straps, poles, zippers, ground contact']
  },
  too_similar: {
    code: 'too_similar',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: true,
    instructions: [
      'Change at least three visual dimensions: shot scale, camera height, subject placement, action, weather, foreground'
    ]
  },
  other: {
    code: 'other',
    increaseSpecificity: true,
    avoidCinematic: false,
    enlargeProduct: false,
    changeConcept: false,
    instructions: []
  }
};

export function feedbackToDirection(code?: ImageFeedbackCode, extraText?: string): FeedbackDirection {
  const base = DIRECTIONS[code || 'other'];
  const extra = extraText?.trim();
  return {
    ...base,
    instructions: extra ? [...base.instructions, extra] : [...base.instructions]
  };
}

export function inferFeedbackCode(reason: string | undefined): ImageFeedbackCode | undefined {
  if (!reason) return undefined;
  const r = reason.toLowerCase();
  if (/generic|کلیش|کلیشه/.test(r)) return 'too_generic';
  if (/match|مرتبط|مقاله/.test(r) && /not|نیست|doesn/.test(r)) return 'doesnt_match_article';
  if (/subject|سوژه/.test(r)) return 'wrong_subject';
  if (/product not|محصول/.test(r) && /small|واضح|کوچک/.test(r)) return 'product_too_small';
  if (/wrong product|محصول/.test(r)) return 'wrong_product';
  if (/cinematic|سینمایی|sunset|غروب/.test(r)) return 'too_cinematic';
  if (/artificial|cgi|مصنوع/.test(r)) return 'too_artificial';
  if (/environment|محیط/.test(r)) return 'wrong_environment';
  if (/composition|ترکیب/.test(r)) return 'wrong_composition';
  if (/anatomy|دست|human|انسان/.test(r)) return 'anatomy_problem';
  if (/equipment|تجهیز/.test(r)) return 'equipment_problem';
  if (/similar|شبیه/.test(r)) return 'too_similar';
  return 'other';
}

export const FEEDBACK_OPTIONS: { code: ImageFeedbackCode; label: string }[] = [
  { code: 'too_generic', label: 'خیلی کلیشه‌ای است' },
  { code: 'doesnt_match_article', label: 'با مقاله هم‌خوانی ندارد' },
  { code: 'wrong_subject', label: 'سوژه اشتباه است' },
  { code: 'wrong_product', label: 'محصول اشتباه است' },
  { code: 'product_too_small', label: 'محصول خیلی کوچک است' },
  { code: 'too_cinematic', label: 'بیش از حد سینمایی است' },
  { code: 'too_artificial', label: 'مصنوعی به نظر می‌رسد' },
  { code: 'wrong_environment', label: 'محیط اشتباه است' },
  { code: 'wrong_composition', label: 'ترکیب‌بندی اشتباه است' },
  { code: 'anatomy_problem', label: 'مشکل آناتومی' },
  { code: 'equipment_problem', label: 'مشکل تجهیزات' },
  { code: 'too_similar', label: 'خیلی شبیه نسخه قبل است' },
  { code: 'other', label: 'سایر' }
];
