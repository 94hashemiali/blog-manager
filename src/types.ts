export interface WPPost {
  id: number | string;
  site_id?: string;
  date: string;
  modified?: string;
  slug: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'local_draft';
  type?: string;
  link?: string;
  title: {
    rendered: string;
    raw?: string;
  };
  content: {
    rendered: string;
    raw?: string;
  };
  excerpt: {
    rendered: string;
    raw?: string;
  };
  featured_media_url?: string;
  categories: number[];
  category_names?: string[];
  tags: number[];
  tag_names?: string[];
  author_name?: string;
  is_local?: boolean;
  local_updated_at?: string;
  // Extended fields for AI Content OS
  version?: number;
  versions?: ArticleVersion[];
  primary_keyword?: string;
  secondary_keywords?: string[];
  search_intent?: SearchIntent;
  content_cluster?: string;
  meta_description?: string;
  seo_score?: number;
  duplicate_risk?: {
    score: number;
    riskLevel: 'safe' | 'moderate' | 'high';
    similarArticleTitles?: string[];
    reason?: string;
  };
  suggested_internal_links?: InternalLinkRecommendation[];
  suggested_products?: ProductConnection[];
  images?: ImageAsset[];
}

export interface ArticleVersion {
  version: number;
  createdAt: string;
  title: string;
  content: string;
  excerpt: string;
  metaDescription?: string;
  generationStrategy?: string;
  changedDimensions?: string[];
  contentHash: string;
}

export type SearchIntent = 'informational' | 'commercial' | 'transactional' | 'navigational';

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
  description?: string;
}

export interface WPTag {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface SiteSettings {
  siteUrl: string;
  username: string;
  appPassword?: string;
  autoSync: boolean;
}

// -------------------------------------------------------------
// PART 2: MULTI-WORDPRESS WEBSITE MANAGEMENT
// -------------------------------------------------------------
export interface ManagedSite {
  id: string;
  name: string;
  url: string;
  description: string;
  language: string;
  wordpress: {
    baseUrl: string;
    username: string;
    applicationPassword?: string;
    hasPassword?: boolean;
  };
  brand: {
    name: string;
    description: string;
    logo?: string;
    primaryColor: string;
    secondaryColor: string;
  };
  seo: {
    domain: string;
    targetCountry: string;
    targetLanguage: string;
    targetAudience: string;
  };
  content: {
    tone: string;
    topics: string[];
    excludedTopics: string[];
  };
  profile?: SiteProfile;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------
// PART 3: WEBSITE INTELLIGENCE & SITE PROFILE
// -------------------------------------------------------------
export interface SiteProfile {
  niche: string;
  audience: string[];
  mainTopics: string[];
  subTopics: string[];
  products: string[];
  categories: string[];
  contentStyle: string;
  brandVoice: string;
  existingContentCount: number;
  contentClusters: ContentCluster[];
  contentGaps: ContentGap[];
  lastAnalyzedAt: string;
}

// -------------------------------------------------------------
// PART 4, 5, 6: SEO, COMPETITOR & KEYWORD OPPORTUNITY ENGINE
// -------------------------------------------------------------
export interface Competitor {
  id: string;
  name: string;
  domain: string;
  discoveredAuto: boolean;
  coveredCategories: string[];
  strengths: string[];
  topTopics: string[];
  lastScannedAt?: string;
}

export interface KeywordOpportunity {
  id: string;
  keyword: string;
  topic: string;
  searchIntent: SearchIntent;
  contentType: 'guide' | 'review' | 'comparison' | 'tutorial' | 'listicle';
  estimatedDemand: 'High' | 'Medium' | 'Low';
  competitionLevel: 'High' | 'Medium' | 'Low';
  businessValue: number; // 1-10
  trafficPotential: number; // 1-10
  conversionPotential: number; // 1-10
  contentGap: number; // 1-10
  seasonality: string;
  priorityScore: number;
  reason: string;
  isEstimate: boolean;
  source: string;
}

export interface ContentGap {
  id: string;
  topic: string;
  competitorsCovering: number;
  siteCoverage: number; // 0-10
  businessValue: number; // 1-10
  trafficPotential: number; // 1-10
  gapScore: number; // 1-100
  reason: string;
}

export interface ContentCluster {
  id: string;
  name: string;
  pillarTopic: string;
  existingArticlesCount: number;
  missingArticlesCount: number;
  topics: {
    title: string;
    keyword: string;
    status: 'existing' | 'planned' | 'missing';
    articleId?: string | number;
  }[];
}

// -------------------------------------------------------------
// PART 7: CONTENT CALENDAR & TOPIC LIFECYCLE
// -------------------------------------------------------------
export type TopicLifecycleStatus = 
  | 'IDEA' 
  | 'RESEARCHED' 
  | 'APPROVED' 
  | 'GENERATING' 
  | 'REVIEW' 
  | 'APPROVED_FOR_PUBLISH' 
  | 'PUBLISHED' 
  | 'REJECTED';

export interface TopicOpportunity {
  id: string;
  siteId: string;
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: SearchIntent;
  contentType: 'guide' | 'review' | 'comparison' | 'tutorial' | 'listicle';
  lifecycle: TopicLifecycleStatus;
  priorityScore: number;
  businessValue: number;
  trafficPotential: number;
  conversionPotential: number;
  contentGap: number;
  competitionLevel: 'High' | 'Medium' | 'Low';
  estimatedDemand: 'High' | 'Medium' | 'Low';
  targetAudience: string;
  reason: string;
  contentClusterId?: string;
  articleId?: string | number;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

// -------------------------------------------------------------
// PART 8: DUPLICATION PREVENTION & FINGERPRINTING
// -------------------------------------------------------------
export interface ContentFingerprint {
  titleNormalized: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  topicCluster: string;
  contentHash: string;
  entities: string[];
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

// -------------------------------------------------------------
// PART 12-21: VISUAL ASSETS & IMAGE NOVELTY ENGINE
// -------------------------------------------------------------
export type ImageType = 'HERO' | 'ARTICLE' | 'PRODUCT' | 'COMPARISON' | 'TUTORIAL';

export interface VisualBrief {
  subject: string;
  action: string;
  environment: string;
  location?: string;
  season?: string;
  weather?: string;
  equipment: string[];
  people: string[];
  composition: string;
  cameraPosition: string;
  lighting: string;
  visualHierarchy: string;
  negativeConstraints: string[];
}

export interface ImagePlanItem {
  type: ImageType;
  purpose: string;
  section: string;
  concept: string;
  priority: number;
}

export interface ImageNovelty {
  exactDuplicate: boolean;
  perceptualSimilarity: number; // 0-100%
  semanticSimilarity: number; // 0-100%
  noveltyScore: number; // 0-100 (higher = more unique)
  isAcceptable: boolean;
  rejectionReason?: string;
}

export interface ImageQualityEvaluation {
  relevance: number; // 1-10
  realism: number; // 1-10
  composition: number; // 1-10
  equipmentAccuracy: number; // 1-10
  anatomy: number; // 1-10
  novelty: number; // 1-10
  overall: number; // 1-10
  problems: string[];
  shouldRegenerate: boolean;
}

export interface ImageAsset {
  imageId: string;
  siteId: string;
  articleId?: string | number;
  imageType: ImageType;
  prompt: string;
  visualFingerprint: string;
  perceptualHash: string;
  semanticDescription: string;
  noveltyScore: number;
  quality?: ImageQualityEvaluation;
  generationVersion: number;
  createdAt: string;
  url: string;
  aspectRatio: string;
  status: 'active' | 'candidate' | 'rejected';
  rejectionReason?: string;
  perspective?: string;
  isAiGenerated?: boolean;
}

// -------------------------------------------------------------
// PART 25 & 26: INTERNAL LINKING & PRODUCT CONNECTIONS
// -------------------------------------------------------------
export interface InternalLinkRecommendation {
  articleId: string | number;
  articleTitle: string;
  url?: string;
  anchorText: string;
  reason: string;
  targetSection?: string;
}

export interface ProductConnection {
  name: string;
  category: string;
  reason: string;
  suggestedAnchor: string;
}

// -------------------------------------------------------------
// PART 29: GENERATION JOBS
// -------------------------------------------------------------
export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface GenerationJob {
  id: string;
  siteId: string;
  type: 'site_analysis' | 'competitor_research' | 'article_generation' | 'image_generation' | 'regenerate_diff';
  status: JobStatus;
  progress: number; // 0-100
  statusMessage: string;
  createdAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

// -------------------------------------------------------------
// EXISTING AI REQUEST INTERFACES (PRESERVED)
// -------------------------------------------------------------
export interface AIGenerateRequest {
  topic: string;
  tone?: 'educational' | 'practical' | 'engaging' | 'gear_review';
  targetAudience?: string;
  keywords?: string[];
  includeFaq?: boolean;
  outlineOnly?: boolean;
  siteId?: string;
  opportunityId?: string;
  avoidPreviousVersion?: {
    version: number;
    title: string;
    content: string;
    changedDimensions: string[];
  };
}

export interface AIOptimizeRequest {
  action: 'meta_description' | 'catchy_titles' | 'faq_generation' | 'improve_persian' | 'suggest_tags' | 'auto_seo_suite' | 'expand_section' | 'generate_intro' | 'generate_conclusion';
  title?: string;
  content?: string;
  focusKeyword?: string;
  siteId?: string;
}

export interface AutoSeoSuggestions {
  titles: string[];
  metaDescription: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  suggestedSlug?: string;
  h2Headings: string[];
  readabilityFeedback?: string;
}

