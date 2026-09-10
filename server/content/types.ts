import type {
  ArticleKind,
  ConfidenceLevel,
  SearchIntent
} from '../intelligence/types.js';

export type { ArticleKind, ConfidenceLevel, SearchIntent };

/**
 * Lifecycle of a single article as it moves through the production pipeline.
 * Transitions are validated by canTransition() in pipeline.ts.
 */
export type ProductionStage =
  | 'idea'
  | 'researched'
  | 'brief_ready'
  | 'drafting'
  | 'draft_ready'
  | 'fact_checked'
  | 'seo_ready'
  | 'review'
  | 'approved'
  | 'publishing'
  | 'published'
  | 'needs_revision';

export const PRODUCTION_STAGES: ProductionStage[] = [
  'idea',
  'researched',
  'brief_ready',
  'drafting',
  'draft_ready',
  'fact_checked',
  'seo_ready',
  'review',
  'approved',
  'publishing',
  'published',
  'needs_revision'
];

// -------------------------------------------------------------
// EVIDENCE
// -------------------------------------------------------------

export type EvidenceSourceType =
  | 'wordpress'
  | 'product_catalog'
  | 'user_input'
  | 'official_source'
  | 'external_source'
  | 'ai_inference'
  | 'unknown';

/**
 * How much the application actually knows about a claim. Anything the app
 * cannot trace back to a real source stays UNKNOWN or NEEDS_VERIFICATION.
 */
export type EvidenceStatus =
  | 'VERIFIED'
  | 'NEEDS_VERIFICATION'
  | 'ESTIMATED'
  | 'UNKNOWN'
  | 'NOT_AVAILABLE';

export interface EvidenceItem {
  id: string;
  siteId: string;
  claim: string;
  source: string;
  sourceType: EvidenceSourceType;
  confidence: ConfidenceLevel;
  verified: boolean;
  status: EvidenceStatus;
  notes?: string;
  /** Optional snippet supporting the claim (from URL research). */
  evidenceText?: string;
  sourceId?: string;
  location?: string;
}

export interface EvidenceCoverage {
  totalClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  needsVerification: number;
  coverageRatio: number;
  highRiskClaims: string[];
  confidence: ConfidenceLevel;
}

// -------------------------------------------------------------
// RESEARCH
// -------------------------------------------------------------

export type SourceReliability = 'high' | 'medium' | 'low' | 'unknown';

export interface ResearchSource {
  id: string;
  label: string;
  url?: string;
  sourceType: EvidenceSourceType;
  reliability: SourceReliability;
  retrievedAt?: string;
  notes?: string;
}

export interface ResearchPacket {
  id: string;
  siteId: string;
  topic: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: SearchIntent;
  targetAudience: string;
  articleObjective: string;
  keyQuestions: string[];
  importantClaims: string[];
  productInformation: Array<{
    name: string;
    category?: string;
    knownAttributes: string[];
    sourceType: EvidenceSourceType;
  }>;
  existingSiteKnowledge: string[];
  internalContentReferences: Array<{
    articleId: string | number;
    title: string;
    slug?: string;
    relevance: string;
  }>;
  competitorObservations: string[];
  sources: ResearchSource[];
  evidence: EvidenceItem[];
  unknownFacts: string[];
  researchConfidence: ConfidenceLevel;
  generatedAt: string;
  modelUsed?: string;
  /** Research Intelligence v2 (optional for backward compatibility). */
  plan?: import('../research/types.js').ResearchPlan;
  claims?: import('../research/types.js').ResearchClaim[];
  conflicts?: import('../research/types.js').ResearchConflict[];
  qualityGate?: import('../research/types.js').ResearchQualityGate;
  webProviderStatus?: 'not_configured' | 'configured';
  researchSessionId?: string;
}

// -------------------------------------------------------------
// BRIEF
// -------------------------------------------------------------

export interface BriefSection {
  heading: string;
  purpose: string;
  talkingPoints: string[];
  targetWordCount: number;
  evidenceNeeded: string[];
}

export type LinkRelationshipType =
  | 'PILLAR_TO_CLUSTER'
  | 'CLUSTER_TO_PILLAR'
  | 'RELATED_CONTENT'
  | 'PRODUCT_TO_GUIDE'
  | 'GUIDE_TO_PRODUCT'
  | 'SUPPORTING_ARTICLE';

export interface InternalLinkSuggestion {
  targetArticleId: string | number;
  targetTitle: string;
  targetSlug?: string;
  anchorText: string;
  reason: string;
  placement: string;
  relationshipType: LinkRelationshipType;
  relevance: number;
}

export interface VisualBrief {
  articleRole: string;
  imagePurpose: string;
  requiredSubject: string;
  composition: string;
  equipment: string[];
  environment: string;
  technicalFacts: string[];
  prohibitedConcepts: string[];
  placement: string;
  altTextHint: string;
}

export interface SeoRequirements {
  primaryKeyword: string;
  secondaryKeywords: string[];
  titleMaxLength: number;
  metaDescriptionRange: [number, number];
  minWordCount: number;
  minH2Count: number;
  minInternalLinks: number;
  requireFaq: boolean;
  slugStyle: 'kebab-latin' | 'kebab-persian';
}

export interface ContentBrief {
  id: string;
  siteId: string;
  researchPacketId: string;
  workingTitle: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: SearchIntent;
  targetAudience: string;
  userProblem: string;
  articleGoal: string;
  recommendedAngle: string;
  differentiationStrategy: string;
  recommendedArticleType: ArticleKind;
  whyThisArticleShouldExist: string;
  howItDiffersFromExisting: string;
  outline: BriefSection[];
  questionsToAnswer: string[];
  internalLinks: InternalLinkSuggestion[];
  productsToMention: string[];
  evidenceRequirements: string[];
  visualRequirements: VisualBrief;
  seoRequirements: SeoRequirements;
  faqOpportunities: string[];
  risks: string[];
  mustNotFabricate: string[];
  version: number;
  createdAt: string;
  modelUsed?: string;
}

// -------------------------------------------------------------
// DIFFERENTIATION
// -------------------------------------------------------------

export type DifferentiationRecommendation =
  | 'CREATE_NEW'
  | 'UPDATE_EXISTING'
  | 'MERGE_EXISTING'
  | 'REJECT_DUPLICATE'
  | 'NEEDS_REVIEW';

export interface DifferentiationDecision {
  recommendation: DifferentiationRecommendation;
  confidence: ConfidenceLevel;
  similarityScore: number;
  cannibalizationRisk: 'none' | 'low' | 'moderate' | 'severe';
  isDuplicate: boolean;
  isCannibalization: boolean;
  isLegitimateSupporting: boolean;
  shouldUpdateExisting: boolean;
  targetArticleId?: string | number;
  targetArticleTitle?: string;
  reasons: string[];
  matchedArticles: Array<{
    id: string | number;
    title: string;
    similarity: number;
    overlapType: string;
    reason: string;
  }>;
}

// -------------------------------------------------------------
// DRAFT
// -------------------------------------------------------------

export interface DraftSection {
  heading: string;
  content: string;
}

export interface DraftClaim {
  claim: string;
  sourceHint: EvidenceSourceType;
  evidenceId?: string;
}

export interface ArticleDraft {
  id: string;
  siteId: string;
  jobId: string;
  briefId: string;
  version: number;
  title: string;
  slug: string;
  metaDescription: string;
  excerpt: string;
  content: string;
  sections: DraftSection[];
  tags: string[];
  faq: Array<{ question: string; answer: string }>;
  internalLinks: InternalLinkSuggestion[];
  productsMentioned: string[];
  claims: DraftClaim[];
  contentHash: string;
  generatedAt: string;
  modelUsed?: string;
  source: 'gemini' | 'user_edited';
}

// -------------------------------------------------------------
// VALIDATION
// -------------------------------------------------------------

export type IssueArea = 'content' | 'seo' | 'quality';

export interface ValidationIssue {
  id: string;
  area: IssueArea;
  message: string;
}

export interface ArticleValidationReport {
  passed: boolean;
  score: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  needsVerification: string[];
  recommendations: string[];
  metrics: {
    wordCount: number;
    h2Count: number;
    h3Count: number;
    paragraphCount: number;
    internalLinkCount: number;
    faqCount: number;
    keywordInTitle: boolean;
    keywordInFirstParagraph: boolean;
    duplicateHeadings: string[];
    repeatedParagraphs: number;
    genericPhraseHits: string[];
    missingSections: string[];
    emptySections: string[];
  };
  checkedAt: string;
}

// -------------------------------------------------------------
// FACT CHECK
// -------------------------------------------------------------

export type ClaimVerdict =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNSUPPORTED'
  | 'CONTRADICTED'
  | 'NEEDS_VERIFICATION'
  | 'OPINION';

export interface FactCheckClaim {
  claim: string;
  verdict: ClaimVerdict;
  sourceType: EvidenceSourceType;
  matchedEvidenceId?: string;
  reason: string;
  requiresAction: boolean;
}

export interface FactCheckReport {
  id: string;
  siteId: string;
  draftVersion: number;
  checkedAt: string;
  claims: FactCheckClaim[];
  summary: Record<ClaimVerdict, number>;
  evidenceCoverage: EvidenceCoverage;
  riskLevel: 'low' | 'moderate' | 'high';
  blocking: string[];
  modelUsed?: string;
  degraded?: boolean;
  degradedReason?: string;
}

// -------------------------------------------------------------
// SEO PREFLIGHT
// -------------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface SeoCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  value?: string | number;
}

export interface SeoPreflightReport {
  id: string;
  siteId: string;
  checkedAt: string;
  score: number;
  passed: boolean;
  checks: SeoCheck[];
  recommendations: string[];
}

// -------------------------------------------------------------
// PUBLISHING
// -------------------------------------------------------------

export type PublishOperation =
  | 'SAVE_LOCAL_DRAFT'
  | 'SAVE_WORDPRESS_DRAFT'
  | 'UPDATE_WORDPRESS_DRAFT'
  | 'PUBLISH'
  | 'UPDATE_PUBLISHED_ARTICLE';

export interface ChecklistItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  blocking: boolean;
}

export interface PublishingChecklist {
  id: string;
  siteId: string;
  checkedAt: string;
  canPublish: boolean;
  items: ChecklistItem[];
  blocking: ChecklistItem[];
  warnings: ChecklistItem[];
}

export interface PublishingResult {
  operation: PublishOperation;
  status: 'success' | 'failed';
  siteId: string;
  articleId: string;
  wordpressPostId?: number;
  url?: string;
  timestamp: string;
  previousStatus?: string;
  resultingStatus?: string;
  error?: string;
}

export interface PublishingHistoryEntry {
  id: string;
  articleId: string;
  siteId: string;
  wordpressPostId?: number;
  operation: PublishOperation;
  status: 'success' | 'failed';
  timestamp: string;
  previousStatus?: string;
  resultingUrl?: string;
  error?: string;
}

// -------------------------------------------------------------
// VERSIONS
// -------------------------------------------------------------

export type VersionAction =
  | 'AI_GENERATED'
  | 'SECTION_REGENERATED'
  | 'USER_EDITED'
  | 'SEO_OPTIMIZED'
  | 'FACT_CHECKED'
  | 'APPROVED'
  | 'RESTORED';

export interface ProductionVersion {
  version: number;
  timestamp: string;
  action: VersionAction;
  source: 'gemini' | 'user' | 'system';
  contentHash: string;
  title: string;
  content: string;
  excerpt?: string;
  metaDescription?: string;
  briefVersion?: number;
  validation?: ArticleValidationReport;
  userNotes?: string;
}

// -------------------------------------------------------------
// JOB
// -------------------------------------------------------------

export interface StageFailure {
  stage: string;
  reason: string;
  retryable: boolean;
  at: string;
}

export interface ContentProductionJob {
  id: string;
  siteId: string;
  stage: ProductionStage;
  /** CREATE is the default; UPDATE/MERGE preserve an existing article identity. */
  mode: 'CREATE' | 'UPDATE' | 'MERGE';
  topic: string;
  primaryKeyword: string;
  searchIntent: SearchIntent;
  opportunityId?: string;
  targetAudience?: string;
  sourceArticleId?: string | number;
  originalWordpressPostId?: number;
  originalContentHash?: string;
  updateReason?: string;
  updatePlan?: {
    whyUpdateNeeded: string[];
    sectionsToPreserve: string[];
    sectionsToModify: string[];
    sectionsToAdd: string[];
    factsToVerify: string[];
    expectedRisk: 'low' | 'medium' | 'high';
    requiredHumanReview: string[];
  };
  performanceSignals?: string[];
  decision?: DifferentiationDecision;
  research?: ResearchPacket;
  brief?: ContentBrief;
  draft?: ArticleDraft;
  validation?: ArticleValidationReport;
  factCheck?: FactCheckReport;
  seoPreflight?: SeoPreflightReport;
  internalLinks: InternalLinkSuggestion[];
  visualBrief?: VisualBrief;
  visualAssetIds: string[];
  versions: ProductionVersion[];
  publishingChecklist?: PublishingChecklist;
  publishingHistory: PublishingHistoryEntry[];
  wordpressPostId?: number;
  publishedUrl?: string;
  localArticleId?: string;
  stageHistory: Array<{ stage: ProductionStage; at: string; note?: string }>;
  failures: StageFailure[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductionStore {
  schemaVersion: number;
  siteId: string;
  jobs: ContentProductionJob[];
  publishingHistory: PublishingHistoryEntry[];
}

export const PRODUCTION_SCHEMA_VERSION = 1;

/** Marker used everywhere the application does not have a real value. */
export const NOT_AVAILABLE = 'NOT_AVAILABLE';
export const UNKNOWN = 'UNKNOWN';
