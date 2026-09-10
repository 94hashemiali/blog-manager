export type EvidenceSource = 'observed' | 'calculated' | 'inferred' | 'estimated' | 'unknown' | 'seed';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface EvidenceField<T> {
  value: T;
  confidence: ConfidenceLevel;
  sourceType: EvidenceSource;
  source?: string;
  reason?: string;
}

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';
export type ArticleKind =
  | 'buying_guide'
  | 'how_to'
  | 'tutorial'
  | 'comparison'
  | 'product_review'
  | 'list'
  | 'informational'
  | 'technical';

export type CannibalizationAction =
  | 'do_not_create'
  | 'update_existing'
  | 'merge_with_existing'
  | 'create_supporting'
  | 'create_different_intent'
  | 'create_comparison'
  | 'create_tutorial'
  | 'create_commercial_investigation'
  | 'create_new';

export type OverlapKind =
  | 'exact_duplicate'
  | 'near_duplicate'
  | 'semantic_duplicate'
  | 'same_search_intent'
  | 'same_primary_keyword'
  | 'same_topic_different_intent'
  | 'supporting'
  | 'cluster_sibling';

export type GapKind =
  | 'competitor_covers_we_dont'
  | 'weak_coverage'
  | 'missing_supporting'
  | 'missing_commercial'
  | 'missing_informational'
  | 'missing_comparison'
  | 'missing_tutorial'
  | 'outdated_article'
  | 'thin_article'
  | 'poor_internal_linking'
  | 'product_without_content';

export type FreshnessStatus = 'healthy' | 'needs_review' | 'likely_outdated';

export type TopicLifecycleStatus =
  | 'IDEA'
  | 'RESEARCHED'
  | 'APPROVED'
  | 'BRIEF_READY'
  | 'GENERATING'
  | 'REVIEW'
  | 'APPROVED_FOR_PUBLISH'
  | 'PUBLISHED'
  | 'REJECTED';

export interface NormalizedArticle {
  title: string;
  headings: string[];
  paragraphs: string[];
  lists: string[];
  tables: string[];
  faq: { question: string; answer: string }[];
  links: { href: string; text: string; internal: boolean }[];
  productMentions: string[];
  entities: string[];
  keywords: string[];
  category?: string;
  tags: string[];
  plainText: string;
}

export interface ContentFingerprint {
  articleId: string | number;
  siteId: string;
  normalizedTitle: string;
  slug: string;
  primaryTopic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  entities: string[];
  articleType: ArticleKind;
  searchIntent: SearchIntent;
  contentClusterId?: string;
  importantConcepts: string[];
  productRelationships: string[];
  headingStructure: string[];
  semanticSummary: string;
  contentHash: string;
  tokenSet: string[];
}

export interface IndexedArticle {
  id: string | number;
  siteId: string;
  wpId?: number;
  title: string;
  slug: string;
  url?: string;
  date?: string;
  modified?: string;
  status?: string;
  categories: string[];
  tags: string[];
  excerpt: string;
  content: string;
  featuredImage?: string;
  author?: string;
  normalized: NormalizedArticle;
  fingerprint: ContentFingerprint;
  freshness: FreshnessStatus;
  freshnessReason: string;
  wordCount: number;
  sourceType: EvidenceSource;
}

export interface IndexedTerm {
  id: number | string;
  name: string;
  slug: string;
  description?: string;
  count?: number;
}

export interface IndexedProduct {
  id: number | string;
  name: string;
  slug: string;
  url?: string;
  description?: string;
  shortDescription?: string;
  categories: string[];
  tags: string[];
  price?: string;
  stockStatus?: string;
  images: string[];
  attributes: string[];
  sourceType: EvidenceSource;
}

export interface ClusterHealth {
  score: number;
  strengths: string[];
  weaknesses: string[];
  missingContent: string[];
  recommendedNextActions: string[];
  pillarExists: boolean;
  supportingCount: number;
  productCoverage: number;
  intentCoverage: { informational: number; commercial: number; comparison: number; tutorial: number };
  cannibalizationRisk: 'none' | 'low' | 'moderate' | 'severe';
  contentDepth: number;
  internalLinkingCompleteness: number;
}

export interface ContentClusterRecord {
  id: string;
  siteId: string;
  name: string;
  pillarTopic: string;
  pillarArticleId?: string | number;
  articleIds: Array<string | number>;
  topics: { title: string; keyword: string; status: 'existing' | 'planned' | 'missing'; articleId?: string | number }[];
  health: ClusterHealth;
  sourceType: EvidenceSource;
}

export interface ContentGapRecord {
  id: string;
  siteId: string;
  kind: GapKind;
  topic: string;
  clusterId?: string;
  articleId?: string | number;
  productName?: string;
  reason: string;
  evidence: string[];
  sourceType: EvidenceSource;
  confidence: ConfidenceLevel;
}

export interface ScoreBreakdown {
  score: number;
  factors: Array<{
    id: string;
    label: string;
    value: number;
    weight: number;
    contribution: number;
    sourceType: EvidenceSource;
    confidence: ConfidenceLevel;
    evidence: string;
  }>;
  reason: string;
}

export interface TopicOpportunityRecord {
  id: string;
  siteId: string;
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: SearchIntent;
  contentType: 'guide' | 'review' | 'comparison' | 'tutorial' | 'listicle';
  clusterId?: string;
  clusterName?: string;
  businessValue: EvidenceField<number>;
  trafficPotential: EvidenceField<'High' | 'Medium' | 'Low'>;
  conversionPotential: EvidenceField<number>;
  contentGap: EvidenceField<number>;
  cannibalizationRisk: EvidenceField<'none' | 'low' | 'moderate' | 'severe'>;
  productRelevance: EvidenceField<number>;
  priority: number;
  confidence: ConfidenceLevel;
  whyThisArticle: string;
  scoring: ScoreBreakdown;
  recommendedAction: CannibalizationAction;
  productsToMention: string[];
  sourceType: EvidenceSource;
  lifecycle?: TopicLifecycleStatus;
}

export interface ArticleBrief {
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: SearchIntent;
  audience: string;
  articleType: ArticleKind | string;
  uniqueAngle: string;
  contentCluster: string;
  businessGoal: string;
  productsToMention: string[];
  internalLinks: Array<{ articleTitle: string; slug?: string; anchorText: string; reason: string }>;
  competitorDifferentiation: string;
  requiredSections: string[];
  forbiddenOverlap: string[];
  evidenceLevel: EvidenceSource;
  siteId: string;
  opportunityId?: string;
  visualIntent?: {
    visualPurpose: string;
    mainSubjectHint: string;
    thingsToAvoid: string[];
  };
}

export interface InternalLinkRec {
  sourceArticleId: string | number;
  sourceTitle: string;
  targetArticleId: string | number;
  targetTitle: string;
  anchorText: string;
  reason: string;
}

export interface CompetitorRecord {
  id: string;
  siteId: string;
  name: string;
  domain: string;
  verified: boolean;
  pagesAnalyzed: number;
  articleCount: number;
  topicCoverage: string[];
  categories: string[];
  contentPatterns: string[];
  strengths: string[];
  weaknesses: string[];
  contentGaps: string[];
  overlapWithOurSite: string[];
  lastScannedAt?: string;
  sourceType: EvidenceSource;
  confidence: ConfidenceLevel;
  notes?: string;
}

export interface SiteContentIndex {
  schemaVersion: number;
  siteId: string;
  indexedAt: string;
  lastSyncedAt?: string;
  lastFullSyncAt?: string;
  lastIncrementalSyncAt?: string;
  wordpressUrl?: string;
  woocommerceAvailable: boolean;
  articleTotalFromWp?: number;
  articles: IndexedArticle[];
  categories: IndexedTerm[];
  tags: IndexedTerm[];
  products: IndexedProduct[];
  internalLinks: InternalLinkRec[];
  clusters: ContentClusterRecord[];
  gaps: ContentGapRecord[];
  opportunities: TopicOpportunityRecord[];
  fingerprints: ContentFingerprint[];
  syncError?: string;
}

export interface SyncProgress {
  stage: string;
  detail?: string;
  done?: number;
  total?: number;
}

export const CONTENT_INDEX_SCHEMA_VERSION = 1;

export const SYNC_STAGES = [
  'connecting',
  'fetching_articles',
  'fetching_categories',
  'fetching_tags',
  'detecting_products',
  'normalizing',
  'fingerprints',
  'clusters',
  'gaps',
  'updating_intelligence'
] as const;
