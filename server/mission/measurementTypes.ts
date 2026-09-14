/**
 * Mission measurement types — honest metrics only, never fabricate zeros.
 * Separated from lifecycle MissionStatus.
 */

export type MetricAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'DEMO_DATA' | 'UNKNOWN';

export interface MetricValue {
  state: MetricAvailability;
  value?: number;
  source?: string;
  detail?: string;
}

export type MeasurementKind = 'BASELINE' | 'OUTCOME';

export interface MissionMeasurementSnapshot {
  id: string;
  missionId: string;
  siteId: string;
  type: MeasurementKind;
  capturedAt: string;
  sourceVersions: {
    contentIndexAt?: string;
    performanceLastSyncedAt?: string;
    decisionEngineVersion?: string;
  };
  metrics: {
    content: {
      articleCount: MetricValue;
      staleArticleCount: MetricValue;
      contentGapCount: MetricValue;
      opportunityCount: MetricValue;
    };
    seo: {
      seoIssueCount: MetricValue;
      decayedArticleCount: MetricValue;
      orphanRiskCount: MetricValue;
    };
    performance: {
      impressions: MetricValue;
      clicks: MetricValue;
      ctr: MetricValue;
      averagePosition: MetricValue;
    };
    providers: {
      searchConsole: MetricValue;
      analytics: MetricValue;
      wordpress: MetricValue;
    };
  };
}

export type OutcomeClassification =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'NO_MEASURABLE_CHANGE'
  | 'REGRESSION'
  | 'INCONCLUSIVE'
  | 'FAILED_EXECUTION'
  | 'INSUFFICIENT_DATA';

export type ChangeAttribution = 'DIRECT_CHANGE' | 'OBSERVED_CHANGE' | 'UNKNOWN_CAUSE';

export interface AttributedChange {
  key: string;
  label: string;
  attribution: ChangeAttribution;
  before?: MetricValue;
  after?: MetricValue;
  delta?: number;
  evidence: string;
}

export type MissionNextState =
  | 'NO_FURTHER_ACTION'
  | 'CONTINUE_EXISTING_MISSION'
  | 'REPLAN_MISSION'
  | 'NEW_RECOMMENDATIONS'
  | 'INSUFFICIENT_DATA';

export interface MissionOutcomeReport {
  missionId: string;
  siteId: string;
  goal: string;
  missionStatus: string;
  classification: OutcomeClassification;
  executionConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  expectedImpactSummary: string[];
  execution: {
    completedTasks: number;
    failedTasks: number;
    skippedTasks: number;
    blockedTasks: number;
    reviewTasks: number;
    pendingTasks: number;
    jobsExecuted: number;
    decisionsEvaluated: number;
  };
  baseline?: MissionMeasurementSnapshot | null;
  outcome?: MissionMeasurementSnapshot | null;
  window: { baselineCapturedAt?: string; outcomeCapturedAt?: string };
  changes: AttributedChange[];
  unchanged: string[];
  unavailable: string[];
  evidence: Array<{ claim: string; source: string }>;
  unknowns: string[];
  matchedExpectations: 'YES' | 'PARTIAL' | 'NO' | 'UNKNOWN';
  nextState: MissionNextState;
  nextRecommendations: Array<{
    decisionId: string;
    action: string;
    title: string;
    priority: string;
  }>;
  replanAvailable: boolean;
  evaluatedAt: string;
}

/** Legacy task-count outcome — kept for store compat; prefer MissionOutcomeReport. */
export interface MissionOutcomeLegacy {
  missionId: string;
  siteId: string;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  decisionsEvaluated: number;
  jobsExecuted: number;
  startedAt?: string;
  completedAt?: string;
  /** @deprecated use MissionOutcomeReport.classification */
  performance?: 'INSUFFICIENT_DATA' | { beforeRecords: number; afterRecords: number };
  classification?: OutcomeClassification;
  baselineMeasurementId?: string;
  outcomeMeasurementId?: string;
  nextState?: MissionNextState;
  report?: MissionOutcomeReport;
}
