/** Decision Engine v1 — deterministic prioritization over persisted signals. */

export const DECISION_ENGINE_VERSION = 1;

export type DecisionSignalType =
  | 'CONTENT_DECAY'
  | 'CONTENT_DECLINE'
  | 'STALE_CONTENT'
  | 'STALE_RESEARCH'
  | 'SOURCE_CHANGED'
  | 'RESEARCH_CONFLICT'
  | 'HIGH_RISK_CLAIM'
  | 'SEO_ISSUE'
  | 'CONTENT_GAP'
  | 'CANNIBALIZATION_RISK'
  | 'LOW_PERFORMANCE'
  | 'PERFORMANCE_OPPORTUNITY'
  | 'PUBLISHING_BLOCKER'
  | 'FAILED_OPERATION'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_ERROR'
  | 'PERF_NEEDS_SYNC';

export type SignalSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface DecisionSignal {
  type: DecisionSignalType;
  siteId: string;
  entityId?: string;
  articleId?: string | number;
  severity: SignalSeverity;
  /** 0–1 strength from evidence quality / magnitude. */
  strength: number;
  evidence: string[];
  detectedAt: string;
  source: string;
}

export type DecisionAction =
  | 'RESEARCH'
  | 'REFRESH_RESEARCH'
  | 'UPDATE_ARTICLE'
  | 'FIX_SEO'
  | 'ADD_INTERNAL_LINKS'
  | 'REVIEW_SOURCE'
  | 'SYNC_CONTENT'
  | 'SYNC_PERFORMANCE'
  | 'REVIEW_ARTICLE'
  | 'REVIEW_CONTENT'
  | 'RETRY_OPERATION'
  | 'CONFIGURE_PROVIDER'
  | 'CREATE_ARTICLE'
  | 'DEFER';

export type FeasibilityStatus =
  | 'AVAILABLE'
  | 'BLOCKED'
  | 'REQUIRES_REVIEW'
  | 'INSUFFICIENT_DATA';

export type DecisionStatus =
  | 'OPEN'
  | 'SELECTED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'EXPIRED';

export type QualitativeImpact = 'LOW' | 'MEDIUM' | 'HIGH';
export type DecisionConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type DecisionRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DecisionScoreBreakdown {
  impact: number;
  confidence: number;
  urgency: number;
  riskAdjustment: number;
  effort: number;
  /** final = impact * confidence * urgency * riskAdjustment / max(effort, 0.15) */
  final: number;
}

export interface DecisionBlocker {
  code: string;
  message: string;
  resolvesWith?: DecisionAction;
}

export interface Decision {
  id: string;
  siteId: string;
  decisionEngineVersion: number;
  type: DecisionAction;
  entityId?: string;
  articleId?: string | number;
  title: string;
  priority: SignalSeverity;
  score: number;
  scoreBreakdown: DecisionScoreBreakdown;
  confidence: DecisionConfidence;
  expectedImpact: QualitativeImpact;
  effort: number;
  risk: DecisionRisk;
  reasons: string[];
  signals: DecisionSignal[];
  recommendedAction: DecisionAction;
  feasibilityStatus: FeasibilityStatus;
  blockers: DecisionBlocker[];
  prerequisiteDecisionId?: string;
  parentDecisionId?: string;
  recommendationId?: string;
  createdAt: string;
  updatedAt: string;
  status: DecisionStatus;
  explanation: DecisionExplanation;
}

export interface DecisionAlternative {
  action: DecisionAction;
  score: number;
  reason: string;
}

export interface DecisionExplanation {
  whyThis: string;
  whyNow: string;
  whatHappensIfExecuted: string;
  whatWillNotHappen: string;
  expectedBenefit: string;
  alternatives: DecisionAlternative[];
  whyRejectedHigherRisk?: string;
}

export interface ArticleDecisionContext {
  articleId: string | number;
  title: string;
  performance?: {
    decayStatus?: string;
    freshnessClass?: string;
    seoStatus?: string;
    opportunities: string[];
  };
  research?: {
    staleSessions: number;
    conflicts: number;
  };
  sourceImpacts: number;
  seoIssues: number;
  cannibalizationRisk?: 'none' | 'low' | 'moderate' | 'severe';
  publishingState?: string;
  signals: DecisionSignal[];
}

export interface DecisionEngineResult {
  siteId: string;
  generatedAt: string;
  decisionEngineVersion: number;
  signals: DecisionSignal[];
  decisions: Decision[];
  topActions: Decision[];
  nextBest: Decision | null;
  articleContexts: ArticleDecisionContext[];
}

export type AutomationPolicy =
  | 'MONITOR_ONLY'
  | 'RECOMMEND'
  | 'AUTO_RESEARCH'
  | 'AUTO_UPDATE_DRAFT'
  | 'APPROVAL_REQUIRED';

export const BATCH_ACTION_LIMIT = 5;
