import type { IndexedArticle } from '../intelligence/types.js';
import type {
  ArticleHealth,
  ContentDecayAssessment,
  FreshnessIssue,
  HealthDimension,
  HealthDimensionStatus,
  LinkingImpact,
  PerformanceTrend,
  WordpressArticleBaseline
} from './types.js';

function dim(
  status: HealthDimensionStatus,
  reasons: string[],
  checks: HealthDimension['checks']
): HealthDimension {
  return { status, reasons, checks };
}

function worst(statuses: HealthDimensionStatus[]): HealthDimensionStatus {
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.every((status) => status === 'unknown')) return 'unknown';
  return 'pass';
}

export function assessArticleHealth(params: {
  siteId: string;
  article: IndexedArticle;
  baseline: WordpressArticleBaseline;
  freshnessIssues: FreshnessIssue[];
  decay: ContentDecayAssessment;
  linkingImpact: LinkingImpact;
  trend?: PerformanceTrend;
  searchConsoleConnected: boolean;
}): ArticleHealth {
  const { baseline, article, freshnessIssues, decay, linkingImpact, trend } = params;

  const contentChecks: HealthDimension['checks'] = [
    {
      id: 'word_count',
      label: 'طول محتوا',
      status: baseline.wordCount >= 700 ? 'pass' : baseline.wordCount >= 400 ? 'warning' : 'error',
      detail: `${baseline.wordCount} کلمه`
    },
    {
      id: 'headings',
      label: 'ساختار سرتیتر',
      status: article.normalized.headings.length >= 3 ? 'pass' : 'warning',
      detail: `${article.normalized.headings.length} سرتیتر`
    }
  ];
  const contentStatus = worst(contentChecks.map((check) => check.status));

  const seoChecks: HealthDimension['checks'] = [
    {
      id: 'slug',
      label: 'نامک',
      status: baseline.slug ? 'pass' : 'warning',
      detail: baseline.slug || 'نامک خالی است'
    },
    {
      id: 'featured_image',
      label: 'تصویر شاخص',
      status: baseline.hasFeaturedImage ? 'pass' : 'warning',
      detail: baseline.hasFeaturedImage ? 'وجود دارد' : 'وجود ندارد'
    },
    {
      id: 'excerpt',
      label: 'چکیده',
      status: article.excerpt && article.excerpt.length > 40 ? 'pass' : 'warning',
      detail: article.excerpt ? `${article.excerpt.length} کاراکتر` : 'خالی'
    }
  ];
  const seoStatus = worst(seoChecks.map((check) => check.status));

  const highFresh = freshnessIssues.filter((issue) => issue.severity === 'high').length;
  const midFresh = freshnessIssues.filter((issue) => issue.severity === 'medium').length;
  const freshnessStatus: HealthDimensionStatus =
    highFresh > 0 ? 'error' : midFresh > 0 || freshnessIssues.length > 0 ? 'warning' : 'pass';
  const freshnessChecks: HealthDimension['checks'] = [
    {
      id: 'freshness_class',
      label: 'کلاس تازگی ایندکس',
      status:
        baseline.freshnessClass === 'healthy'
          ? 'pass'
          : baseline.freshnessClass === 'likely_outdated'
            ? 'error'
            : baseline.freshnessClass === 'needs_review'
              ? 'warning'
              : 'unknown',
      detail: baseline.freshnessClass
    },
    {
      id: 'freshness_issues',
      label: 'مسائل تازگی',
      status: freshnessStatus,
      detail: `${freshnessIssues.length} مورد`
    }
  ];

  const linkChecks: HealthDimension['checks'] = [
    {
      id: 'outgoing',
      label: 'لینک‌های خروجی داخلی',
      status: baseline.internalLinkCount >= 2 ? 'pass' : baseline.internalLinkCount === 1 ? 'warning' : 'error',
      detail: `${baseline.internalLinkCount} لینک`
    },
    {
      id: 'incoming',
      label: 'لینک‌های ورودی',
      status: linkingImpact.incoming.length >= 1 ? 'pass' : linkingImpact.isOrphan ? 'error' : 'warning',
      detail: `${linkingImpact.incoming.length} مقاله به این صفحه لینک می‌دهند`
    }
  ];
  const linkStatus = worst(linkChecks.map((check) => check.status));

  const factChecks: HealthDimension['checks'] = [
    {
      id: 'catalog_alignment',
      label: 'هم‌راستایی با کاتالوگ',
      status: freshnessIssues.some((issue) => issue.type === 'outdated_product_mention') ? 'warning' : 'pass',
      detail: freshnessIssues.some((issue) => issue.type === 'outdated_product_mention')
        ? 'ذکر محصول خارج از کاتالوگ'
        : 'نشانه‌ای از محصول قدیمی پیدا نشد'
    }
  ];

  const performanceChecks: HealthDimension['checks'] = params.searchConsoleConnected
    ? [
        {
          id: 'trend',
          label: 'روند عملکرد',
          status:
            trend?.direction === 'FALLING'
              ? 'error'
              : trend?.direction === 'RISING'
                ? 'pass'
                : trend?.direction === 'INSUFFICIENT_DATA'
                  ? 'unknown'
                  : 'pass',
          detail: trend?.reason || 'روند محاسبه نشده'
        }
      ]
    : [
        {
          id: 'search_console',
          label: 'Search Console',
          status: 'unknown',
          detail: 'Search Console is not connected'
        }
      ];
  const performanceStatus = worst(performanceChecks.map((check) => check.status));

  const dimensions = {
    content: dim(
      contentStatus,
      contentChecks.filter((check) => check.status !== 'pass').map((check) => check.detail),
      contentChecks
    ),
    seo: dim(
      seoStatus,
      seoChecks.filter((check) => check.status !== 'pass').map((check) => check.detail),
      seoChecks
    ),
    freshness: dim(
      freshnessStatus,
      freshnessIssues.slice(0, 4).map((issue) => issue.reason),
      freshnessChecks
    ),
    internalLinks: dim(
      linkStatus,
      linkChecks.filter((check) => check.status !== 'pass').map((check) => check.detail),
      linkChecks
    ),
    facts: dim(
      factChecks[0].status,
      factChecks.filter((check) => check.status !== 'pass').map((check) => check.detail),
      factChecks
    ),
    performance: dim(
      performanceStatus,
      performanceStatus === 'unknown' ? ['Search Console is not connected'] : [trend?.reason || ''].filter(Boolean),
      performanceChecks
    )
  };

  const statuses = Object.values(dimensions).map((dimension) => dimension.status);
  const actionable = statuses.filter((status) => status !== 'unknown');
  let overallStatus: ArticleHealth['overallStatus'] = 'healthy';
  if (actionable.includes('error') || decay.status === 'DECAYED' || decay.status === 'DECLINING') {
    overallStatus = 'attention';
  } else if (actionable.includes('warning') || decay.status === 'WATCH') {
    overallStatus = 'watch';
  } else if (actionable.length === 0) {
    overallStatus = 'unknown';
  }

  const reasons = [
    ...decay.reasons.slice(0, 3),
    ...freshnessIssues.slice(0, 2).map((issue) => issue.reason),
    linkingImpact.isOrphan ? 'مقاله تقریباً یتیم است (لینک ورودی ندارد).' : ''
  ].filter(Boolean);

  return {
    siteId: params.siteId,
    articleId: article.id,
    title: article.title,
    overallStatus,
    dimensions,
    reasons,
    assessedAt: new Date().toISOString()
  };
}
