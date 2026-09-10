import crypto from 'crypto';
import { jaccard, tokenize } from '../intelligence/text.js';
import { auditDraftLinks } from './linking.js';
import type {
  ArticleDraft,
  CheckStatus,
  ContentBrief,
  DifferentiationDecision,
  SeoCheck,
  SeoPreflightReport
} from './types.js';

function check(
  id: string,
  label: string,
  status: CheckStatus,
  detail: string,
  value?: string | number
): SeoCheck {
  return { id, label, status, detail, value };
}

/**
 * SEO checks run against the actual draft. Every recommendation names the
 * concrete element that failed, so there is no "add more keywords" advice.
 */
export function runSeoPreflight(params: {
  draft: ArticleDraft;
  brief: ContentBrief;
  decision?: DifferentiationDecision;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
}): SeoPreflightReport {
  const { draft, brief } = params;
  const checks: SeoCheck[] = [];
  const recommendations: string[] = [];

  const keywordTokens = tokenize(brief.primaryKeyword);
  const bodyTokens = tokenize(draft.content);
  const h2s = (draft.content.match(/^##\s+(.+)$/gm) || []).map((line) => line.replace(/^##\s+/, '').trim());
  const h1s = (draft.content.match(/^#\s+(.+)$/gm) || []).map((line) => line.replace(/^#\s+/, '').trim());
  const linkAudit = auditDraftLinks({ content: draft.content, suggestions: brief.internalLinks });
  const [metaMin, metaMax] = brief.seoRequirements.metaDescriptionRange;
  const wordCount = draft.content.split(/\s+/).filter(Boolean).length;

  // Title
  const titleHasKeyword = jaccard(keywordTokens, tokenize(draft.title)) > 0;
  const titleLengthOk = draft.title.length > 15 && draft.title.length <= brief.seoRequirements.titleMaxLength;
  checks.push(
    check(
      'title',
      'عنوان مقاله',
      titleHasKeyword && titleLengthOk ? 'pass' : titleHasKeyword ? 'warn' : 'fail',
      titleHasKeyword
        ? titleLengthOk
          ? 'عنوان شامل کلیدواژه و در طول مناسب است.'
          : `طول عنوان ${draft.title.length} کاراکتر است و در نتایج گوگل بریده می‌شود.`
        : `کلیدواژهٔ «${brief.primaryKeyword}» در عنوان نیست.`,
      draft.title.length
    )
  );
  if (!titleHasKeyword) recommendations.push(`«${brief.primaryKeyword}» را در ابتدای عنوان «${draft.title}» بگنجانید.`);
  if (titleHasKeyword && !titleLengthOk) {
    recommendations.push(`عنوان را به زیر ${brief.seoRequirements.titleMaxLength} کاراکتر کوتاه کنید.`);
  }

  // Meta description
  const metaLength = draft.metaDescription.length;
  const metaStatus: CheckStatus = !metaLength ? 'fail' : metaLength >= metaMin && metaLength <= metaMax ? 'pass' : 'warn';
  checks.push(
    check(
      'meta_description',
      'توضیحات متا',
      metaStatus,
      !metaLength
        ? 'توضیحات متا نوشته نشده است.'
        : `طول فعلی ${metaLength} کاراکتر (بازهٔ هدف ${metaMin}–${metaMax}).`,
      metaLength
    )
  );
  if (metaStatus !== 'pass') {
    recommendations.push(
      !metaLength
        ? `یک توضیحات متای ${metaMin}–${metaMax} کاراکتری با کلیدواژهٔ «${brief.primaryKeyword}» بنویسید.`
        : `توضیحات متا را به بازهٔ ${metaMin}–${metaMax} کاراکتر برسانید (الان ${metaLength}).`
    );
  }

  // Slug
  const slugOk = /^[a-z0-9-]+$/.test(draft.slug) && draft.slug.length >= 3 && draft.slug.length <= 70;
  checks.push(
    check(
      'slug',
      'نامک (Slug)',
      draft.slug ? (slugOk ? 'pass' : 'warn') : 'fail',
      draft.slug ? (slugOk ? `نامک: ${draft.slug}` : `نامک «${draft.slug}» با سبک kebab-latin هم‌خوان نیست.`) : 'نامک خالی است.',
      draft.slug
    )
  );

  // Primary keyword usage in body
  const keywordInBody = jaccard(keywordTokens, bodyTokens) > 0;
  checks.push(
    check(
      'primary_keyword',
      'کلیدواژهٔ اصلی در متن',
      keywordInBody ? 'pass' : 'fail',
      keywordInBody ? `«${brief.primaryKeyword}» در متن آمده است.` : `«${brief.primaryKeyword}» در متن مقاله دیده نمی‌شود.`
    )
  );

  // Secondary keywords
  const usedSecondary = brief.secondaryKeywords.filter((keyword) => jaccard(tokenize(keyword), bodyTokens) > 0);
  checks.push(
    check(
      'secondary_keywords',
      'کلیدواژه‌های فرعی',
      brief.secondaryKeywords.length === 0
        ? 'unknown'
        : usedSecondary.length >= Math.ceil(brief.secondaryKeywords.length / 2)
          ? 'pass'
          : 'warn',
      brief.secondaryKeywords.length === 0
        ? 'بریف کلیدواژهٔ فرعی نداشت.'
        : `${usedSecondary.length} از ${brief.secondaryKeywords.length} کلیدواژهٔ فرعی استفاده شده است.`,
      usedSecondary.length
    )
  );
  const unusedSecondary = brief.secondaryKeywords.filter((keyword) => !usedSecondary.includes(keyword));
  if (unusedSecondary.length > 0) {
    recommendations.push(`کلیدواژه‌های استفاده‌نشده را در بخش‌های مرتبط بیاورید: ${unusedSecondary.slice(0, 3).join('، ')}`);
  }

  // Search intent alignment
  const intentSignals: Record<string, RegExp> = {
    informational: /چگونه|چطور|نحوه|راهنما|آموزش/,
    commercial: /مقایسه|بهترین|انتخاب|بررسی|معیار/,
    transactional: /خرید|قیمت|سفارش|موجودی/,
    navigational: /برند|فروشگاه|رسمی/
  };
  const intentMatch = intentSignals[brief.searchIntent]?.test(draft.content) ?? false;
  checks.push(
    check(
      'search_intent',
      'هم‌راستایی با نیت جستجو',
      intentMatch ? 'pass' : 'warn',
      intentMatch
        ? `زبان مقاله با نیت «${brief.searchIntent}» هم‌خوان است.`
        : `مقاله سیگنال روشنی از نیت «${brief.searchIntent}» ندارد.`
    )
  );

  // Heading structure
  const headingStatus: CheckStatus = h1s.length === 1 && h2s.length >= brief.seoRequirements.minH2Count ? 'pass' : h2s.length > 0 ? 'warn' : 'fail';
  checks.push(
    check(
      'headings',
      'ساختار سرتیترها',
      headingStatus,
      `${h1s.length} سرتیتر H1 و ${h2s.length} سرتیتر H2 (حداقل ${brief.seoRequirements.minH2Count} H2 لازم بود).`,
      h2s.length
    )
  );
  if (h1s.length > 1) recommendations.push('فقط یک H1 در مقاله نگه دارید؛ بقیه را به H2 تبدیل کنید.');

  // Internal links + anchor text
  checks.push(
    check(
      'internal_links',
      'لینک‌های داخلی',
      linkAudit.used.length >= brief.seoRequirements.minInternalLinks ? 'pass' : linkAudit.markdownLinkCount > 0 ? 'warn' : 'fail',
      `${linkAudit.used.length} لینک از ${brief.internalLinks.length} پیشنهاد بریف استفاده شده (${linkAudit.markdownLinkCount} لینک مارک‌داون در متن).`,
      linkAudit.used.length
    )
  );
  const genericAnchors = (draft.content.match(/\[(اینجا|کلیک کنید|بیشتر بخوانید|این لینک)\]/g) || []).length;
  checks.push(
    check(
      'anchor_text',
      'متن لنگر لینک‌ها',
      genericAnchors === 0 ? 'pass' : 'warn',
      genericAnchors === 0 ? 'متن لنگرها توصیفی است.' : `${genericAnchors} لینک با متن لنگر عمومی مثل «اینجا» دارید.`,
      genericAnchors
    )
  );
  for (const missing of linkAudit.missing.slice(0, 2)) {
    recommendations.push(`لینک «${missing.anchorText}» به «${missing.targetTitle}» را ${missing.placement} قرار دهید.`);
  }

  // Canonical readiness (a unique slug is what the app can actually check)
  checks.push(
    check(
      'canonical',
      'آمادگی Canonical',
      draft.slug ? 'pass' : 'fail',
      draft.slug
        ? 'نامک یکتا برای تولید آدرس canonical آماده است.'
        : 'بدون نامک، وردپرس آدرس canonical دلخواه می‌سازد.'
    )
  );

  // FAQ + schema opportunity
  checks.push(
    check(
      'faq',
      'سوالات متداول',
      draft.faq.length >= 2 ? 'pass' : draft.faq.length === 1 ? 'warn' : 'fail',
      `${draft.faq.length} سوال متداول نوشته شده است.`,
      draft.faq.length
    )
  );
  checks.push(
    check(
      'schema',
      'فرصت داده‌های ساخت‌یافته',
      draft.faq.length >= 2 ? 'pass' : 'warn',
      draft.faq.length >= 2
        ? 'با این بخش سوالات متداول می‌توان اسکیمای FAQPage ثبت کرد.'
        : 'برای اسکیمای FAQPage حداقل ۲ پرسش و پاسخ لازم است.'
    )
  );

  // Images
  checks.push(
    check(
      'featured_image',
      'تصویر شاخص',
      params.featuredImageUrl ? 'pass' : 'warn',
      params.featuredImageUrl ? 'تصویر شاخص انتخاب شده است.' : 'تصویر شاخص هنوز ساخته یا انتخاب نشده است.'
    )
  );
  checks.push(
    check(
      'image_alt',
      'متن جایگزین تصویر',
      params.featuredImageAlt ? 'pass' : params.featuredImageUrl ? 'warn' : 'unknown',
      params.featuredImageAlt
        ? `alt فعلی: ${params.featuredImageAlt}`
        : params.featuredImageUrl
          ? `متن جایگزین خالی است؛ پیشنهاد بریف: ${brief.visualRequirements.altTextHint}`
          : 'تا انتخاب تصویر، متن جایگزین قابل بررسی نیست.'
    )
  );

  // Uniqueness (comes from the differentiation engine, not a guess)
  const uniqueness: CheckStatus = !params.decision
    ? 'unknown'
    : params.decision.recommendation === 'CREATE_NEW'
      ? 'pass'
      : params.decision.recommendation === 'REJECT_DUPLICATE'
        ? 'fail'
        : 'warn';
  checks.push(
    check(
      'uniqueness',
      'یکتایی مقاله',
      uniqueness,
      params.decision
        ? `تصمیم موتور تمایز: ${params.decision.recommendation} (شباهت ${params.decision.similarityScore}٪).`
        : 'بررسی تمایز اجرا نشده است.'
    )
  );

  // Depth
  checks.push(
    check(
      'content_depth',
      'عمق محتوا',
      wordCount >= brief.seoRequirements.minWordCount
        ? 'pass'
        : wordCount >= brief.seoRequirements.minWordCount * 0.7
          ? 'warn'
          : 'fail',
      `${wordCount} کلمه در برابر هدف ${brief.seoRequirements.minWordCount} کلمه.`,
      wordCount
    )
  );

  const failed = checks.filter((row) => row.status === 'fail').length;
  const warned = checks.filter((row) => row.status === 'warn').length;
  const score = Math.max(0, Math.min(100, 100 - failed * 15 - warned * 5));

  return {
    id: `seo-${crypto.createHash('sha1').update(`${draft.id}:${draft.contentHash}`).digest('hex').slice(0, 10)}`,
    siteId: draft.siteId,
    checkedAt: new Date().toISOString(),
    score,
    passed: failed === 0,
    checks,
    recommendations: [...new Set(recommendations)]
  };
}
