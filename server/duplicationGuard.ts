import { db } from './db.js';

export interface DuplicateCheckParams {
  siteId: string;
  title: string;
  keyword?: string;
  searchIntent?: string;
  content?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  cannibalizationRisk: 'none' | 'low' | 'moderate' | 'severe';
  similarityScore: number; // 0 to 100
  matchedArticles: {
    id: string | number;
    title: string;
    reason: string;
    overlapType: 'exact_title' | 'same_keyword' | 'same_intent' | 'semantic_overlap';
  }[];
  verdictMessage: string;
}

function safeString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (val.rendered) return safeString(val.rendered);
    if (val.raw) return safeString(val.raw);
  }
  return String(val);
}

function normalizeText(text: string): string {
  return safeString(text)
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    'در', 'به', 'از', 'که', 'این', 'رو', 'با', 'برای', 'آن', 'یک', 'تا', 'بر', 'یا', 'را', 'است',
    'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'with', 'and', 'or', 'is', 'to'
  ]);
  const tokens = normalizeText(text).split(' ').filter((w) => w.length > 1 && !stopWords.has(w));
  return new Set(tokens);
}

function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : (intersection / union) * 100;
}

export function checkDuplication(params: DuplicateCheckParams): DuplicateCheckResult {
  const { siteId, title, keyword = '', searchIntent = '' } = params;
  const existingArticles = db.getArticles(siteId);

  const normInputTitle = normalizeText(title);
  const inputTitleTokens = tokenize(title);
  const inputKeywordTokens = tokenize(keyword);

  const matchedArticles: DuplicateCheckResult['matchedArticles'] = [];
  let maxSimilarity = 0;

  for (const article of existingArticles) {
    const existingTitle = safeString(article.title?.rendered || article.title || '');
    const normExistingTitle = normalizeText(existingTitle);
    const existingTokens = tokenize(existingTitle);

    // 1. Exact or near-exact match
    if (normInputTitle === normExistingTitle) {
      matchedArticles.push({
        id: article.id,
        title: existingTitle,
        reason: 'عنوان مقاله دقیقاً با این مقاله موجود یکسان است.',
        overlapType: 'exact_title'
      });
      maxSimilarity = 100;
      continue;
    }

    // 2. Title token similarity
    const titleSim = calculateJaccardSimilarity(inputTitleTokens, existingTokens);
    if (titleSim > maxSimilarity) {
      maxSimilarity = titleSim;
    }

    if (titleSim >= 65) {
      matchedArticles.push({
        id: article.id,
        title: existingTitle,
        reason: `شباهت واژگانی بالا (${Math.round(titleSim)}٪) بین عنوان‌ها وجود دارد.`,
        overlapType: 'semantic_overlap'
      });
    }

    // 3. Keyword / Slug match
    if (keyword) {
      const existingSlug = (article.slug || '').replace(/-/g, ' ');
      const slugSim = calculateJaccardSimilarity(inputKeywordTokens, tokenize(existingSlug));
      if (slugSim >= 75) {
        matchedArticles.push({
          id: article.id,
          title: existingTitle,
          reason: `کلمه کلیدی «${keyword}» دقیقاً در نامک یا مبحث این مقاله هدف‌گذاری شده است.`,
          overlapType: 'same_keyword'
        });
        maxSimilarity = Math.max(maxSimilarity, slugSim);
      }
    }
  }

  const roundedScore = Math.round(maxSimilarity);
  let cannibalizationRisk: DuplicateCheckResult['cannibalizationRisk'] = 'none';
  let isDuplicate = false;
  let verdictMessage = 'موضوع کاملاً جدید و متمایز است؛ خطر هم‌نوع‌خواری سئو (Cannibalization) وجود ندارد.';

  if (roundedScore >= 80 || matchedArticles.some((m) => m.overlapType === 'exact_title')) {
    cannibalizationRisk = 'severe';
    isDuplicate = true;
    verdictMessage = 'خطر شدید هم‌پوشانی و کپی محتوا! مقاله‌ای بسیار نزدیک در سایت وجود دارد.';
  } else if (roundedScore >= 50) {
    cannibalizationRisk = 'moderate';
    verdictMessage = 'هم‌پوشانی متوسط؛ توصیه می‌شود زاویه دید، کلمه کلیدی یا بخش‌های مقاله را بازطراحی کنید.';
  } else if (roundedScore >= 25) {
    cannibalizationRisk = 'low';
    verdictMessage = 'خطر اندک؛ مقاله می‌تواند به عنوان محتوای مکمل یا خوشه فرعی منتشر شود.';
  }

  return {
    isDuplicate,
    cannibalizationRisk,
    similarityScore: roundedScore,
    matchedArticles,
    verdictMessage
  };
}
