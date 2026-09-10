import { jaccard, normalizeTitle, tokenize } from '../intelligence/text.js';
import { auditDraftLinks } from './linking.js';
import { isHighRiskClaim } from './evidence.js';
import type {
  ArticleDraft,
  ArticleValidationReport,
  ContentBrief,
  DifferentiationDecision,
  ResearchPacket,
  ValidationIssue
} from './types.js';

/** Filler phrases that signal generic AI prose rather than useful guidance. */
const GENERIC_PHRASES = [
  'در دنیای امروز',
  'بدون شک',
  'همانطور که می‌دانید',
  'در این مقاله سعی کردیم',
  'امیدواریم این مقاله',
  'لازم به ذکر است',
  'در نهایت می‌توان گفت'
];

function words(text: string): string[] {
  return text
    .replace(/[#*_>`|\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function paragraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith('#'));
}

function countRepeatedParagraphs(blocks: string[]): number {
  let repeats = 0;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[i].length < 80 || blocks[j].length < 80) continue;
      if (jaccard(tokenize(blocks[i]), tokenize(blocks[j])) >= 70) repeats++;
    }
  }
  return repeats;
}

function duplicateHeadings(content: string): string[] {
  const headings = (content.match(/^#{2,3}\s+(.+)$/gm) || []).map((line) =>
    normalizeTitle(line.replace(/^#{2,3}\s+/, ''))
  );
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const heading of headings) {
    if (seen.has(heading)) duplicates.add(heading);
    seen.add(heading);
  }
  return [...duplicates];
}

/**
 * Deterministic post-generation validation. Every metric is computed from the
 * draft itself, so the same draft always scores the same. Gemini is not used.
 */
export function validateArticleDraft(params: {
  draft: ArticleDraft;
  brief: ContentBrief;
  research?: ResearchPacket;
  decision?: DifferentiationDecision;
}): ArticleValidationReport {
  const { draft, brief } = params;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const recommendations: string[] = [];

  const blocks = paragraphs(draft.content);
  const wordCount = words(draft.content).length;
  const h2Count = (draft.content.match(/^##\s+/gm) || []).length;
  const h3Count = (draft.content.match(/^###\s+/gm) || []).length;
  const dupHeadings = duplicateHeadings(draft.content);
  const repeatedParagraphs = countRepeatedParagraphs(blocks);
  const genericPhraseHits = GENERIC_PHRASES.filter((phrase) => draft.content.includes(phrase));

  const keywordTokens = tokenize(brief.primaryKeyword);
  const keywordInTitle = jaccard(keywordTokens, tokenize(draft.title)) > 0;
  const keywordInFirstParagraph = blocks.length > 0 && jaccard(keywordTokens, tokenize(blocks[0])) > 0;

  const linkAudit = auditDraftLinks({ content: draft.content, suggestions: brief.internalLinks });

  const draftHeadings = new Set(
    (draft.content.match(/^##\s+(.+)$/gm) || []).map((line) => normalizeTitle(line.replace(/^##\s+/, '')))
  );
  const missingSections = brief.outline
    .map((section) => section.heading)
    .filter((heading) => {
      const normalized = normalizeTitle(heading);
      for (const present of draftHeadings) {
        if (present === normalized || jaccard(tokenize(present), tokenize(normalized)) >= 45) return false;
      }
      return true;
    });

  const emptySections = draft.sections
    .filter((section) => words(section.content).length < 40)
    .map((section) => section.heading);

  // --- CONTENT ---
  if (wordCount < brief.seoRequirements.minWordCount * 0.6) {
    errors.push({
      id: 'content_too_short',
      area: 'content',
      message: `مقاله ${wordCount} کلمه است؛ حداقل مورد نیاز ${brief.seoRequirements.minWordCount} کلمه بود.`
    });
  } else if (wordCount < brief.seoRequirements.minWordCount) {
    warnings.push({
      id: 'content_under_target',
      area: 'content',
      message: `طول مقاله (${wordCount} کلمه) کمتر از هدف بریف (${brief.seoRequirements.minWordCount}) است.`
    });
  }

  if (emptySections.length > 0) {
    errors.push({
      id: 'empty_sections',
      area: 'content',
      message: `این بخش‌ها تقریباً خالی هستند: ${emptySections.join('، ')}`
    });
  }

  if (missingSections.length > 0) {
    (missingSections.length > 2 ? errors : warnings).push({
      id: 'missing_sections',
      area: 'content',
      message: `بخش‌های خواسته‌شده در بریف نوشته نشده‌اند: ${missingSections.join('، ')}`
    });
  }

  if (dupHeadings.length > 0) {
    warnings.push({
      id: 'duplicate_headings',
      area: 'content',
      message: `سرتیترهای تکراری: ${dupHeadings.join('، ')}`
    });
  }

  if (repeatedParagraphs > 0) {
    warnings.push({
      id: 'repeated_paragraphs',
      area: 'content',
      message: `${repeatedParagraphs} جفت پاراگراف تقریباً یکسان پیدا شد.`
    });
    recommendations.push('پاراگراف‌های تکراری را ادغام کنید تا مقاله متورم به نظر نرسد.');
  }

  if (blocks.length > 0 && words(blocks[0]).length < 40) {
    warnings.push({ id: 'weak_intro', area: 'content', message: 'مقدمه کوتاه‌تر از آن است که مسئلهٔ مخاطب را روشن کند.' });
  }

  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock || words(lastBlock).length < 35) {
    warnings.push({ id: 'weak_conclusion', area: 'content', message: 'جمع‌بندی مقاله ضعیف یا ناقص است.' });
  }

  if (genericPhraseHits.length >= 3) {
    warnings.push({
      id: 'generic_language',
      area: 'content',
      message: `عبارت‌های کلیشه‌ای زیاد است: ${genericPhraseHits.join('، ')}`
    });
  }

  // --- SEO ---
  if (!keywordInTitle) {
    errors.push({ id: 'keyword_missing_in_title', area: 'seo', message: 'کلیدواژهٔ اصلی در عنوان نیست.' });
  }
  if (!keywordInFirstParagraph) {
    warnings.push({
      id: 'keyword_missing_in_intro',
      area: 'seo',
      message: 'کلیدواژهٔ اصلی در پاراگراف اول نیامده است.'
    });
  }
  if (draft.title.length > brief.seoRequirements.titleMaxLength) {
    warnings.push({
      id: 'title_too_long',
      area: 'seo',
      message: `عنوان ${draft.title.length} کاراکتر است؛ بیش از ${brief.seoRequirements.titleMaxLength} کاراکتر در نتایج بریده می‌شود.`
    });
  }
  const [metaMin, metaMax] = brief.seoRequirements.metaDescriptionRange;
  if (!draft.metaDescription) {
    errors.push({ id: 'meta_missing', area: 'seo', message: 'توضیحات متا خالی است.' });
  } else if (draft.metaDescription.length < metaMin || draft.metaDescription.length > metaMax) {
    warnings.push({
      id: 'meta_length',
      area: 'seo',
      message: `طول توضیحات متا ${draft.metaDescription.length} کاراکتر است؛ بازهٔ هدف ${metaMin}–${metaMax} بود.`
    });
  }
  if (!draft.slug) {
    errors.push({ id: 'slug_missing', area: 'seo', message: 'نامک (slug) تعیین نشده است.' });
  }
  if (h2Count < brief.seoRequirements.minH2Count) {
    warnings.push({
      id: 'heading_structure',
      area: 'seo',
      message: `تعداد سرتیتر H2 (${h2Count}) کمتر از ${brief.seoRequirements.minH2Count} است.`
    });
  }
  if (linkAudit.used.length < brief.seoRequirements.minInternalLinks) {
    warnings.push({
      id: 'internal_links',
      area: 'seo',
      message: `فقط ${linkAudit.used.length} از ${brief.internalLinks.length} لینک داخلی پیشنهادی استفاده شده است.`
    });
    recommendations.push(
      linkAudit.missing.length > 0
        ? `لینک به «${linkAudit.missing[0].targetTitle}» را ${linkAudit.missing[0].placement} اضافه کنید.`
        : 'لینک‌های داخلی پیشنهادی بریف را در متن قرار دهید.'
    );
  }
  if (brief.seoRequirements.requireFaq && draft.faq.length === 0) {
    warnings.push({ id: 'faq_missing', area: 'seo', message: 'بخش سوالات متداول ساخته نشده است.' });
  }

  // --- QUALITY / FACTS ---
  const needsVerification: string[] = [];
  const verifiedClaims = new Set(
    (params.research?.evidence || []).filter((item) => item.verified).map((item) => normalizeTitle(item.claim))
  );
  for (const claim of draft.claims) {
    const normalized = normalizeTitle(claim.claim);
    const isVerified = [...verifiedClaims].some(
      (known) => known === normalized || jaccard(tokenize(known), tokenize(normalized)) >= 55
    );
    if (!isVerified && (claim.sourceHint === 'ai_inference' || claim.sourceHint === 'unknown' || isHighRiskClaim(claim.claim))) {
      needsVerification.push(claim.claim);
    }
  }

  const unknownProducts = draft.productsMentioned.filter(
    (name) => brief.productsToMention.length > 0 && !brief.productsToMention.some((known) => known.includes(name) || name.includes(known))
  );
  if (unknownProducts.length > 0) {
    errors.push({
      id: 'unknown_products',
      area: 'quality',
      message: `محصولاتی نام برده شده که در کاتالوگ این سایت نیستند: ${unknownProducts.join('، ')}`
    });
  }

  const fabricationHits = brief.mustNotFabricate.filter(
    (risk) => risk.length > 12 && draft.content.includes(risk.slice(0, Math.min(24, risk.length)))
  );
  if (fabricationHits.length > 0) {
    warnings.push({
      id: 'must_not_fabricate_hit',
      area: 'quality',
      message: `متن به موضوعی اشاره کرده که در فهرست «قابل تأیید نیست» بود: ${fabricationHits[0]}`
    });
  }

  if (params.decision?.recommendation === 'REJECT_DUPLICATE') {
    errors.push({
      id: 'duplicate_decision',
      area: 'quality',
      message: 'موتور تمایز این موضوع را تکراری تشخیص داده بود؛ انتشار مجاز نیست.'
    });
  }

  if (needsVerification.length > 0) {
    recommendations.push(`${needsVerification.length} ادعای بدون منبع باید پیش از انتشار تأیید یا حذف شود.`);
  }

  // Deterministic score: start at 100, subtract fixed penalties.
  const score = Math.max(
    0,
    Math.min(100, 100 - errors.length * 18 - warnings.length * 6 - Math.min(20, needsVerification.length * 2))
  );

  return {
    passed: errors.length === 0,
    score,
    errors,
    warnings,
    needsVerification,
    recommendations,
    metrics: {
      wordCount,
      h2Count,
      h3Count,
      paragraphCount: blocks.length,
      internalLinkCount: linkAudit.markdownLinkCount,
      faqCount: draft.faq.length,
      keywordInTitle,
      keywordInFirstParagraph,
      duplicateHeadings: dupHeadings,
      repeatedParagraphs,
      genericPhraseHits,
      missingSections,
      emptySections
    },
    checkedAt: new Date().toISOString()
  };
}
