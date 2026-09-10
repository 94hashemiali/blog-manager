import type { IndexedArticle } from '../intelligence/types.js';
import type {
  ArticleHealth,
  ContentDecayAssessment,
  FreshnessIssue,
  LinkingImpact,
  PerformanceOpportunity,
  PerformanceTrend,
  WordpressArticleBaseline
} from './types.js';

function opportunityId(siteId: string, articleId: string | number, type: string): string {
  return `popp-${siteId}-${articleId}-${type}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Builds explainable performance/content opportunities from real signals only.
 */
export function buildPerformanceOpportunities(params: {
  siteId: string;
  article: IndexedArticle;
  baseline: WordpressArticleBaseline;
  decay: ContentDecayAssessment;
  freshnessIssues: FreshnessIssue[];
  health: ArticleHealth;
  linkingImpact: LinkingImpact;
  trend?: PerformanceTrend;
}): PerformanceOpportunity[] {
  const { siteId, article, baseline, decay, freshnessIssues, linkingImpact, trend } = params;
  const opportunities: PerformanceOpportunity[] = [];

  if (decay.status === 'DECLINING' || decay.status === 'DECAYED' || decay.status === 'WATCH') {
    const evidence = decay.reasons.slice(0, 4);
    if ((baseline.daysSinceModification ?? 0) >= 180 || freshnessIssues.length > 0 || trend?.direction === 'FALLING') {
      opportunities.push({
        id: opportunityId(siteId, article.id, 'UPDATE_ARTICLE'),
        siteId,
        articleId: article.id,
        articleTitle: article.title,
        type: 'UPDATE_ARTICLE',
        reason: 'علائم کهنگی یا افت کیفیت محتوا برای این مقاله ثبت شده است.',
        evidence,
        severity: decay.status === 'DECAYED' ? 'high' : decay.status === 'DECLINING' ? 'high' : 'medium',
        confidence: evidence.length >= 2 ? 'high' : 'medium',
        recommendedAction: 'UPDATE',
        priority: decay.status === 'DECAYED' ? 90 : decay.status === 'DECLINING' ? 80 : 65,
        contributingSignals: decay.signals.map((signal) => signal.type),
        quality: 'VERIFIED'
      });
    }
  }

  if (!baseline.hasFeaturedImage) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'REPLACE_VISUAL'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'REPLACE_VISUAL',
      reason: 'تصویر شاخص برای این مقاله ثبت نشده است.',
      evidence: ['featured image missing in WordPress/content index'],
      severity: 'low',
      confidence: 'high',
      recommendedAction: 'REPLACE_VISUAL',
      priority: 40,
      contributingSignals: ['missing_featured_image'],
      quality: 'VERIFIED'
    });
  }

  if (linkingImpact.isOrphan || baseline.internalLinkCount === 0) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'ADD_INTERNAL_LINKS'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'ADD_INTERNAL_LINKS',
      reason: linkingImpact.isOrphan
        ? 'مقاله لینک ورودی/خروجی داخلی معناداری ندارد.'
        : 'تعداد لینک‌های داخلی خروجی کافی نیست.',
      evidence: [
        `incoming=${linkingImpact.incoming.length}`,
        `outgoing=${baseline.internalLinkCount}`,
        ...linkingImpact.potentialNewLinks.slice(0, 3).map((link) => `candidate: ${link.title}`)
      ],
      severity: linkingImpact.isOrphan ? 'high' : 'medium',
      confidence: 'high',
      recommendedAction: 'ADD_INTERNAL_LINKS',
      priority: linkingImpact.isOrphan ? 75 : 55,
      contributingSignals: ['orphan_or_thin_links'],
      quality: 'VERIFIED'
    });
  }

  if (freshnessIssues.some((issue) => issue.type === 'outdated_product_mention' || issue.type === 'missing_current_product')) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'ADD_PRODUCT_LINKS'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'ADD_PRODUCT_LINKS',
      reason: 'کاتالوگ محصولات با اشارهٔ فعلی مقاله هم‌خوان نیست.',
      evidence: freshnessIssues
        .filter((issue) => issue.type === 'outdated_product_mention' || issue.type === 'missing_current_product')
        .map((issue) => issue.reason),
      severity: 'medium',
      confidence: 'high',
      recommendedAction: 'ADD_PRODUCT_LINKS',
      priority: 60,
      contributingSignals: ['product_catalog_mismatch'],
      quality: 'VERIFIED'
    });
  }

  if (freshnessIssues.some((issue) => issue.type === 'old_year_reference' || issue.type === 'stale_faq')) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'REFRESH_FACTS'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'REFRESH_FACTS',
      reason: 'ارجاع زمانی یا FAQ احتمالاً قدیمی است.',
      evidence: freshnessIssues
        .filter((issue) => issue.type === 'old_year_reference' || issue.type === 'stale_faq')
        .map((issue) => issue.reason),
      severity: 'medium',
      confidence: 'medium',
      recommendedAction: 'UPDATE',
      priority: 58,
      contributingSignals: ['stale_facts'],
      quality: 'VERIFIED'
    });
  }

  if (baseline.wordCount > 0 && baseline.wordCount < 500 && article.normalized.headings.length <= 2) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'EXPAND_MISSING_SECTION'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'EXPAND_MISSING_SECTION',
      reason: 'مقاله کوتاه است و ساختار بخش‌ها ضعیف به نظر می‌رسد.',
      evidence: [`wordCount=${baseline.wordCount}`, `headings=${article.normalized.headings.length}`],
      severity: 'medium',
      confidence: 'high',
      recommendedAction: 'EXPAND',
      priority: 62,
      contributingSignals: ['thin_content'],
      quality: 'VERIFIED'
    });
  }

  if (decay.signals.some((signal) => signal.type === 'cannibalization_changes')) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'FIX_CANNIBALIZATION'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'FIX_CANNIBALIZATION',
      reason: 'سیگنال هم‌نوع‌خواری برای این مقاله دیده شده است.',
      evidence: decay.signals.filter((signal) => signal.type === 'cannibalization_changes').map((signal) => signal.evidence),
      severity: 'high',
      confidence: 'medium',
      recommendedAction: 'MERGE',
      priority: 85,
      contributingSignals: ['cannibalization'],
      quality: 'VERIFIED'
    });
  }

  if (linkingImpact.potentialNewLinks.length >= 2 && linkingImpact.clusterName) {
    opportunities.push({
      id: opportunityId(siteId, article.id, 'CREATE_SUPPORTING_ARTICLE'),
      siteId,
      articleId: article.id,
      articleTitle: article.title,
      type: 'CREATE_SUPPORTING_ARTICLE',
      reason: `خوشهٔ «${linkingImpact.clusterName}» هنوز لینک‌های پشتیبانی‌نشده دارد.`,
      evidence: linkingImpact.potentialNewLinks.slice(0, 3).map((link) => link.title),
      severity: 'low',
      confidence: 'medium',
      recommendedAction: 'EXPAND',
      priority: 45,
      contributingSignals: ['cluster_link_gap'],
      quality: 'VERIFIED'
    });
  }

  return opportunities.sort((a, b) => b.priority - a.priority);
}
