import type { IndexedArticle } from '../intelligence/types.js';
import type {
  ContentDecayAssessment,
  ContentDecaySignal,
  DecayStatus,
  FreshnessIssue,
  PerformanceTrend,
  WordpressArticleBaseline
} from './types.js';

/**
 * Decay is evidence-driven. Age alone never forces DECAYED.
 */
export function assessDecay(params: {
  siteId: string;
  article: IndexedArticle;
  baseline: WordpressArticleBaseline;
  freshnessIssues: FreshnessIssue[];
  trend?: PerformanceTrend;
  hasNewerSibling?: boolean;
  cannibalizationRisk?: 'none' | 'low' | 'moderate' | 'severe';
}): ContentDecayAssessment {
  const signals: ContentDecaySignal[] = [];

  if ((params.baseline.daysSinceModification ?? 0) >= 365) {
    signals.push({
      id: 'age-modified',
      type: 'old_modification_date',
      severity: (params.baseline.daysSinceModification ?? 0) >= 730 ? 'high' : 'medium',
      evidence: `آخرین ویرایش ${params.baseline.daysSinceModification} روز پیش بوده است.`,
      quality: 'VERIFIED'
    });
  }

  for (const issue of params.freshnessIssues) {
    signals.push({
      id: `fresh-${issue.id}`,
      type: issue.type,
      severity: issue.severity,
      evidence: issue.reason,
      quality: issue.quality
    });
  }

  if (params.trend?.direction === 'FALLING' && params.trend.changePercent != null) {
    signals.push({
      id: 'trend-falling',
      type: 'performance_decline',
      severity: Math.abs(params.trend.changePercent) >= 25 ? 'high' : 'medium',
      evidence: params.trend.reason,
      quality: 'VERIFIED'
    });
  } else if (!params.trend || params.trend.direction === 'INSUFFICIENT_DATA') {
    signals.push({
      id: 'trend-unknown',
      type: 'insufficient_performance_data',
      severity: 'low',
      evidence: 'دادهٔ Search Console برای تشخیص افت ترافیک موجود نیست.',
      quality: 'UNKNOWN'
    });
  }

  if (params.hasNewerSibling) {
    signals.push({
      id: 'newer-sibling',
      type: 'newer_competing_internal_article',
      severity: 'medium',
      evidence: 'مقالهٔ جدیدتری در همین خوشه/موضوع در ایندکس وجود دارد.',
      quality: 'VERIFIED'
    });
  }

  if (params.cannibalizationRisk === 'moderate' || params.cannibalizationRisk === 'severe') {
    signals.push({
      id: 'cannibalization',
      type: 'cannibalization_changes',
      severity: params.cannibalizationRisk === 'severe' ? 'high' : 'medium',
      evidence: `ریسک هم‌نوع‌خواری: ${params.cannibalizationRisk}`,
      quality: 'VERIFIED'
    });
  }

  const actionable = signals.filter((signal) => signal.type !== 'insufficient_performance_data');
  const high = actionable.filter((signal) => signal.severity === 'high').length;
  const medium = actionable.filter((signal) => signal.severity === 'medium').length;

  let status: DecayStatus;
  if (actionable.length === 0) {
    status = params.trend?.direction === 'INSUFFICIENT_DATA' || !params.trend ? 'INSUFFICIENT_DATA' : 'HEALTHY';
  } else if (high >= 2 || (high >= 1 && medium >= 2)) status = 'DECAYED';
  else if (high >= 1 || medium >= 2) status = 'DECLINING';
  else if (medium >= 1 || actionable.length >= 2) status = 'WATCH';
  else status = 'HEALTHY';

  // Age alone cannot produce DECAYED or DECLINING — it is only a watch signal.
  if (
    (status === 'DECAYED' || status === 'DECLINING') &&
    actionable.every((signal) => signal.type === 'old_modification_date')
  ) {
    status = 'WATCH';
  }

  return {
    siteId: params.siteId,
    articleId: params.article.id,
    status,
    signals,
    reasons: actionable.map((signal) => signal.evidence).slice(0, 6),
    assessedAt: new Date().toISOString()
  };
}
