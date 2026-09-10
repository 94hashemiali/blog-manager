export { performanceRouter } from './routes.js';
export { syncPerformanceForSite, getPerformanceOverview } from './sync.js';
export { calculateTrend } from './trends.js';
export { buildWordpressBaseline, daysBetween } from './metrics.js';
export { auditFreshness } from './freshness.js';
export { assessDecay } from './decay.js';
export { assessArticleHealth } from './health.js';
export { computeLinkingImpact } from './linkingImpact.js';
export { buildPerformanceOpportunities } from './opportunities.js';
export { buildImproveActions, buildCreateActions, buildNextActionsOverview } from './actions.js';
export { buildDeterministicUpdatePlan, enrichUpdatePlanWithAi } from './updatePlan.js';
export {
  defaultProviderStatuses,
  getSearchConsoleProvider,
  getAnalyticsProvider,
  validateSnapshot
} from './providers.js';
export { loadPerformanceStore, savePerformanceStore } from './store.js';
export { PERFORMANCE_SCHEMA_VERSION, MAX_DAILY_SNAPSHOTS_PER_ARTICLE } from './types.js';
export type {
  ArticleHealth,
  ArticleUpdatePlan,
  ContentActionRecommendation,
  ContentDecayAssessment,
  ContentPerformanceRecord,
  FreshnessIssue,
  LinkingImpact,
  PerformanceOpportunity,
  PerformanceOverview,
  PerformanceSnapshot,
  PerformanceTrend,
  ProviderStatus,
  WordpressArticleBaseline
} from './types.js';
