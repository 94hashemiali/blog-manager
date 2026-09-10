import type { IndexedArticle, IndexedProduct } from '../intelligence/types.js';
import { normalizeTitle, tokenize, tokenOverlapCount } from '../intelligence/text.js';
import type { FreshnessIssue } from './types.js';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Deterministic freshness audit. Flags potential staleness without rewriting.
 */
export function auditFreshness(params: {
  article: IndexedArticle;
  products: IndexedProduct[];
  allArticles: IndexedArticle[];
  now?: Date;
}): FreshnessIssue[] {
  const { article, products, allArticles } = params;
  const now = params.now || new Date();
  const issues: FreshnessIssue[] = [];
  const text = `${article.title}\n${article.normalized.plainText}\n${article.normalized.headings.join('\n')}`;
  const normalizedDigits = text.replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit).toString());
  const years = [...normalizedDigits.matchAll(/\b(20[0-2]\d)\b/g)].map((match) => Number(match[1]));
  for (const year of years) {
    if (year <= CURRENT_YEAR - 2) {
      issues.push({
        id: `year-${year}`,
        type: 'old_year_reference',
        location: 'body',
        severity: year <= CURRENT_YEAR - 4 ? 'high' : 'medium',
        reason: `ارجاع به سال ${year} در متن مقاله دیده می‌شود.`,
        suggestedAction: 'سال‌های قدیمی را بازبینی یا حذف کنید مگر این‌که عمداً تاریخی باشند.',
        quality: 'VERIFIED'
      });
    }
  }

  const dateHits = [...text.matchAll(/\b(\d{4}[/-]\d{1,2}[/-]\d{1,2})\b/g)].map((match) => match[1]);
  for (const date of dateHits.slice(0, 5)) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime()) && now.getTime() - parsed.getTime() > 730 * 24 * 60 * 60 * 1000) {
      issues.push({
        id: `date-${date}`,
        type: 'stale_date_in_text',
        location: 'body',
        severity: 'medium',
        reason: `تاریخ ${date} در متن آمده و بیش از دو سال قدمت دارد.`,
        suggestedAction: 'بررسی کنید تاریخ هنوز مرتبط است یا باید به‌روز شود.',
        quality: 'VERIFIED'
      });
    }
  }

  const catalogNames = products.map((product) => product.name);
  const mentioned = article.normalized.productMentions || [];
  for (const mention of mentioned) {
    const stillExists = catalogNames.some(
      (name) => normalizeTitle(name).includes(normalizeTitle(mention)) || normalizeTitle(mention).includes(normalizeTitle(name))
    );
    if (catalogNames.length > 0 && mention.length > 6 && !stillExists && !/tent|boot|backpack|stove|pad|goretex|vibram/.test(mention)) {
      issues.push({
        id: `product-missing-${mention}`,
        type: 'outdated_product_mention',
        location: 'product_mentions',
        severity: 'medium',
        reason: `ذکر «${mention}» با کاتالوگ فعلی هم‌خوان نیست.`,
        suggestedAction: 'نام محصول را با موجودی فعلی فروشگاه تطبیق دهید یا حذف کنید.',
        quality: 'VERIFIED'
      });
    }
  }

  // Related products in the same category that never appear in the article.
  const category = article.categories[0];
  if (category) {
    const relatedProducts = products.filter((product) => product.categories.includes(category)).slice(0, 8);
    const missing = relatedProducts.filter(
      (product) => tokenOverlapCount(tokenize(article.normalized.plainText), tokenize(product.name)) === 0
    );
    if (relatedProducts.length >= 3 && missing.length >= 2) {
      issues.push({
        id: 'missing-current-products',
        type: 'missing_current_product',
        location: 'catalog',
        severity: 'low',
        reason: `${missing.length} محصول مرتبط در دستهٔ «${category}» در مقاله ذکر نشده‌اند.`,
        suggestedAction: `در نظر بگیرید محصولاتی مثل «${missing[0].name}» را اضافه کنید.`,
        quality: 'VERIFIED'
      });
    }
  }

  const knownIds = new Set(allArticles.map((row) => String(row.id)));
  const knownSlugs = new Set(allArticles.map((row) => row.slug).filter(Boolean));
  for (const link of article.normalized.links.filter((row) => row.internal)) {
    const slug = link.href.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').split(/[?#]/)[0];
    if (slug && !knownSlugs.has(slug) && !knownIds.has(slug) && !link.href.startsWith('#')) {
      // Relative paths that look like posts but are not in the index.
      if (slug.includes('-') || slug.length > 8) {
        issues.push({
          id: `broken-${slug}`,
          type: 'broken_internal_link',
          location: link.href,
          severity: 'high',
          reason: `لینک داخلی «${link.href}» در ایندکس فعلی پیدا نشد.`,
          suggestedAction: 'لینک را اصلاح یا حذف کنید.',
          quality: 'VERIFIED'
        });
      }
    }
  }

  for (const faq of article.normalized.faq.slice(0, 6)) {
    if (/۲۰۱[0-9]|201[0-9]|قیمت روز|امسال/.test(`${faq.question} ${faq.answer}`)) {
      issues.push({
        id: `faq-${normalizeTitle(faq.question).slice(0, 24)}`,
        type: 'stale_faq',
        location: 'faq',
        severity: 'medium',
        reason: `سوال متداول ممکن است قدیمی باشد: «${faq.question}»`,
        suggestedAction: 'FAQ را با اطلاعات فعلی بازبینی کنید.',
        quality: 'VERIFIED'
      });
    }
  }

  if (/بهترین .+ ۲۰(1|2)[0-9]|best .+ 20(1|2)\d/i.test(text)) {
    issues.push({
      id: 'outdated-best-of',
      type: 'outdated_terminology',
      location: 'title_or_body',
      severity: 'medium',
      reason: 'عبارت «بهترین … سال» معمولاً سریع کهنه می‌شود.',
      suggestedAction: 'عنوان یا بخش را به معیارهای پایدار (نه سال) بازنویسی کنید.',
      quality: 'VERIFIED'
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}
