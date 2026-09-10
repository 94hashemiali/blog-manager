import type { ConfidenceLevel } from '../intelligence/types.js';
import type { EvidenceItem, EvidenceSourceType, SearchIntent } from '../content/types.js';

export type { ConfidenceLevel };

export type ResearchSourceKind =
  | 'OFFICIAL_SOURCE'
  | 'PRODUCT_MANUFACTURER'
  | 'GOVERNMENT'
  | 'ACADEMIC'
  | 'REPUTABLE_PUBLICATION'
  | 'WORDPRESS'
  | 'PRODUCT_CATALOG'
  | 'USER_PROVIDED'
  | 'COMMUNITY'
  | 'UNKNOWN';

export type SourceFetchStatus = 'ok' | 'failed' | 'blocked' | 'cached' | 'unsupported_type';

export type SourceFreshness = 'CURRENT' | 'RECENT' | 'STALE' | 'UNKNOWN';

export type ClaimType =
  | 'PRODUCT_SPEC'
  | 'PRICE'
  | 'DATE'
  | 'TECHNICAL'
  | 'SCIENTIFIC'
  | 'SAFETY'
  | 'COMPARISON'
  | 'GENERAL'
  | 'OPINION';

export type ClaimStatus =
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'UNSUPPORTED'
  | 'CONTRADICTED'
  | 'NEEDS_VERIFICATION'
  | 'OPINION';

export type ConflictResolutionStatus =
  | 'UNRESOLVED'
  | 'RESOLVED_BY_AUTHORITY'
  | 'RESOLVED_BY_NEWER_SOURCE'
  | 'USER_DECISION';

export type ResearchQualityStatus = 'PASS' | 'WARNING' | 'BLOCKED';

export type FreshnessRequirement = 'high' | 'medium' | 'low';

export type WebResearchProviderStatus = 'not_configured' | 'configured' | 'error';

export interface ResearchPlan {
  id: string;
  siteId: string;
  topic: string;
  primaryQuestion: string;
  supportingQuestions: string[];
  searchIntent: SearchIntent;
  requiredFacts: string[];
  requiredProductFacts: string[];
  requiredTechnicalFacts: string[];
  preferredSourceTypes: ResearchSourceKind[];
  sourceExclusions: string[];
  freshnessRequirement: FreshnessRequirement;
  highRiskTopics: string[];
  generatedAt: string;
  modelUsed?: string;
}

export interface ResearchSourceCandidate {
  url: string;
  title?: string;
  snippet?: string;
  provider: string;
  sourceTypeHint?: ResearchSourceKind;
}

export interface ResearchSourceDocument {
  id: string;
  siteId: string;
  url: string;
  title: string;
  domain: string;
  sourceType: ResearchSourceKind;
  publisher?: string;
  fetchedAt: string;
  publishedAt?: string;
  modifiedAt?: string;
  language?: string;
  content: string;
  contentHash: string;
  status: SourceFetchStatus;
  freshness: SourceFreshness;
  error?: string;
  isDemo?: boolean;
  rawContentType?: string;
  byteLength?: number;
}

export interface ExtractedEvidence {
  id: string;
  siteId: string;
  sourceId: string;
  claim: string;
  evidenceText: string;
  location: string;
  confidence: ConfidenceLevel;
  sourceType: ResearchSourceKind;
  verified: boolean;
}

export interface ResearchClaim {
  id: string;
  siteId: string;
  text: string;
  type: ClaimType;
  status: ClaimStatus;
  evidenceIds: string[];
  sourceIds: string[];
  confidence: ConfidenceLevel;
  reason: string;
  highRisk: boolean;
}

export interface ResearchConflict {
  id: string;
  siteId: string;
  claim: string;
  sourceAId: string;
  sourceBId: string;
  evidenceAId?: string;
  evidenceBId?: string;
  difference: string;
  severity: 'low' | 'medium' | 'high';
  resolutionStatus: ConflictResolutionStatus;
}

export interface ResearchQualityGate {
  status: ResearchQualityStatus;
  reasons: string[];
  blocking: string[];
  warnings: string[];
  assessedAt: string;
}

export interface ResearchProviderStatus {
  provider: 'web_search' | 'manual_url' | 'wordpress' | 'product_catalog';
  status: WebResearchProviderStatus | 'connected' | 'available';
  label: string;
  detail: string;
  configured: boolean;
}

export interface ResearchSession {
  id: string;
  siteId: string;
  topic: string;
  plan: ResearchPlan;
  sources: ResearchSourceDocument[];
  extractedEvidence: ExtractedEvidence[];
  claims: ResearchClaim[];
  conflicts: ResearchConflict[];
  unknownFacts: string[];
  qualityGate: ResearchQualityGate;
  providers: ResearchProviderStatus[];
  researchConfidence: ConfidenceLevel;
  packetEvidence: EvidenceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchStore {
  schemaVersion: number;
  siteId: string;
  sourcesByUrl: Record<string, ResearchSourceDocument>;
  sessions: ResearchSession[];
}

export const RESEARCH_SCHEMA_VERSION = 1;

/** Map research source kinds onto the production EvidenceSourceType. */
export function toEvidenceSourceType(kind: ResearchSourceKind): EvidenceSourceType {
  switch (kind) {
    case 'WORDPRESS':
      return 'wordpress';
    case 'PRODUCT_CATALOG':
      return 'product_catalog';
    case 'USER_PROVIDED':
      return 'user_input';
    case 'OFFICIAL_SOURCE':
    case 'PRODUCT_MANUFACTURER':
    case 'GOVERNMENT':
    case 'ACADEMIC':
      return 'official_source';
    case 'REPUTABLE_PUBLICATION':
    case 'COMMUNITY':
      return 'external_source';
    default:
      return 'unknown';
  }
}

export function authorityRank(kind: ResearchSourceKind): number {
  const ranks: Record<ResearchSourceKind, number> = {
    PRODUCT_MANUFACTURER: 100,
    GOVERNMENT: 95,
    ACADEMIC: 90,
    OFFICIAL_SOURCE: 85,
    PRODUCT_CATALOG: 80,
    WORDPRESS: 70,
    REPUTABLE_PUBLICATION: 60,
    USER_PROVIDED: 50,
    COMMUNITY: 30,
    UNKNOWN: 10
  };
  return ranks[kind];
}
