import type { ConfidenceLevel } from '../intelligence/types.js';

export type { ConfidenceLevel };

export type DataQuality =
  | 'VERIFIED'
  | 'ESTIMATED'
  | 'IMPORTED'
  | 'USER_PROVIDED'
  | 'AI_INTERPRETED'
  | 'UNKNOWN'
  | 'DEMO_DATA';

export type PerformanceProviderKind = 'wordpress' | 'search_console' | 'analytics' | 'manual' | 'imported';

export type ProviderConnectionStatus =
  | 'connected'
  | 'not_connected'
  | 'misconfigured'
  | 'error';

export interface ProviderStatus {
  provider: PerformanceProviderKind;
  status: ProviderConnectionStatus;
  label: string;
  detail: string;
  lastSyncedAt?: string;
  configured: boolean;
}

export type TrendDirection = 'RISING' | 'FALLING' | 'STABLE' | 'VOLATILE' | 'INSUFFICIENT_DATA';

export interface PerformanceTrend {
  direction: TrendDirection;
  changePercent: number | null;
  confidence: ConfidenceLevel;
  sampleSize: number;
  recentPeriodDays: number;
  previousPeriodDays: number;
  metric: 'clicks' | 'impressions' | 'ctr' | 'position' | 'composite';
  reason: string;
}

export interface PerformanceSnapshot {
  id: string;
  siteId: string;
  articleId: string | number;
  date: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
  source: PerformanceProviderKind;
  quality: DataQuality;
}

/** Content metadata WordPress (and the local index) can actually observe. */
export interface WordpressArticleBaseline {
  siteId: string;
  articleId: string | number;
  wpId?: number;
  url?: string;
  title: string;
  slug: string;
  status?: string;
  publishDate?: string;
  modifiedDate?: string;
  categories: string[];
  tags: string[];
  wordCount: number;
  internalLinkCount: number;
  outboundLinkCount: number;
  imageCount: number;
  hasFeaturedImage: boolean;
  lastIndexedAt: string;
  contentAgeDays: number | null;
  daysSinceModification: number | null;
  freshnessClass: 'healthy' | 'needs_review' | 'likely_outdated' | 'unknown';
  quality: DataQuality;
}

export type DecayStatus = 'HEALTHY' | 'WATCH' | 'DECLINING' | 'DECAYED' | 'INSUFFICIENT_DATA';

export interface ContentDecaySignal {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  quality: DataQuality;
}

export interface ContentDecayAssessment {
  siteId: string;
  articleId: string | number;
  status: DecayStatus;
  signals: ContentDecaySignal[];
  reasons: string[];
  assessedAt: string;
}

export type FreshnessIssueType =
  | 'old_year_reference'
  | 'stale_date_in_text'
  | 'outdated_product_mention'
  | 'missing_current_product'
  | 'broken_internal_link'
  | 'stale_faq'
  | 'outdated_terminology'
  | 'stale_category_relationship';

export interface FreshnessIssue {
  id: string;
  type: FreshnessIssueType;
  location: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  suggestedAction: string;
  quality: DataQuality;
}

export type HealthDimensionStatus = 'pass' | 'warning' | 'error' | 'unknown';

export interface HealthDimension {
  status: HealthDimensionStatus;
  reasons: string[];
  checks: Array<{ id: string; label: string; status: HealthDimensionStatus; detail: string }>;
}

export interface ArticleHealth {
  siteId: string;
  articleId: string | number;
  title: string;
  overallStatus: 'healthy' | 'watch' | 'attention' | 'unknown';
  dimensions: {
    content: HealthDimension;
    seo: HealthDimension;
    freshness: HealthDimension;
    internalLinks: HealthDimension;
    facts: HealthDimension;
    performance: HealthDimension;
  };
  reasons: string[];
  assessedAt: string;
}

export type PerformanceOpportunityType =
  | 'UPDATE_ARTICLE'
  | 'IMPROVE_TITLE'
  | 'IMPROVE_META'
  | 'IMPROVE_SEARCH_INTENT_ALIGNMENT'
  | 'ADD_INTERNAL_LINKS'
  | 'FIX_CANNIBALIZATION'
  | 'MERGE_ARTICLES'
  | 'EXPAND_MISSING_SECTION'
  | 'ADD_PRODUCT_LINKS'
  | 'REFRESH_FACTS'
  | 'REPLACE_VISUAL'
  | 'CREATE_SUPPORTING_ARTICLE';

export type ActionRecommendationType =
  | 'UPDATE'
  | 'EXPAND'
  | 'REWRITE'
  | 'MERGE'
  | 'REDIRECT'
  | 'ADD_INTERNAL_LINKS'
  | 'ADD_PRODUCT_LINKS'
  | 'REPLACE_VISUAL'
  | 'LEAVE_ALONE'
  | 'NEEDS_DATA';

export interface PerformanceOpportunity {
  id: string;
  siteId: string;
  articleId: string | number;
  articleTitle: string;
  type: PerformanceOpportunityType;
  reason: string;
  evidence: string[];
  severity: 'low' | 'medium' | 'high';
  confidence: ConfidenceLevel;
  recommendedAction: ActionRecommendationType;
  priority: number;
  contributingSignals: string[];
  quality: DataQuality;
}

export interface ContentActionRecommendation {
  id: string;
  siteId: string;
  articleId?: string | number;
  title: string;
  group: 'CREATE' | 'IMPROVE';
  action: ActionRecommendationType | 'CREATE';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityScore: number;
  reasons: string[];
  contributingSignals: string[];
  evidence: string[];
  confidence: ConfidenceLevel;
  opportunityId?: string;
}

export interface LinkingImpact {
  siteId: string;
  articleId: string | number;
  incoming: Array<{ articleId: string | number; title: string }>;
  outgoing: Array<{ articleId: string | number; title: string }>;
  clusterName?: string;
  pillarTitle?: string;
  supportingTitles: string[];
  potentialNewLinks: Array<{ articleId: string | number; title: string; reason: string }>;
  isOrphan: boolean;
}

export interface ArticleUpdatePlan {
  siteId: string;
  articleId: string | number;
  whyUpdateNeeded: string[];
  sectionsToPreserve: string[];
  sectionsToModify: string[];
  sectionsToAdd: string[];
  factsToVerify: string[];
  internalLinksToAdd: Array<{ title: string; reason: string }>;
  productsToAdd: string[];
  productsToRemove: string[];
  visualAssetsToReview: string[];
  seoMetadataChanges: string[];
  expectedRisk: 'low' | 'medium' | 'high';
  requiredHumanReview: string[];
  source: 'deterministic' | 'ai_interpreted';
  quality: DataQuality;
  generatedAt: string;
  modelUsed?: string;
}

export interface ContentPerformanceRecord {
  siteId: string;
  articleId: string | number;
  baseline: WordpressArticleBaseline;
  decay: ContentDecayAssessment;
  freshnessIssues: FreshnessIssue[];
  health: ArticleHealth;
  trend?: PerformanceTrend;
  linkingImpact: LinkingImpact;
  opportunities: PerformanceOpportunity[];
  snapshots: PerformanceSnapshot[];
}

export interface PerformanceOverview {
  siteId: string;
  assessedAt: string;
  overall: 'healthy' | 'attention_needed' | 'needs_data';
  counts: {
    healthy: number;
    watch: number;
    declining: number;
    decayed: number;
    needsData: number;
    total: number;
  };
  providers: ProviderStatus[];
  topPriorities: ContentActionRecommendation[];
  createRecommendations: ContentActionRecommendation[];
  improveRecommendations: ContentActionRecommendation[];
  hasSearchPerformance: boolean;
  hasAnalytics: boolean;
}

export interface PerformanceStore {
  schemaVersion: number;
  siteId: string;
  providers: ProviderStatus[];
  records: ContentPerformanceRecord[];
  snapshots: PerformanceSnapshot[];
  opportunities: PerformanceOpportunity[];
  lastSyncedAt?: string;
  lastSyncSource?: PerformanceProviderKind;
  syncError?: string;
}

export const PERFORMANCE_SCHEMA_VERSION = 1;

/** Keep at most this many daily snapshots per article. */
export const MAX_DAILY_SNAPSHOTS_PER_ARTICLE = 90;
