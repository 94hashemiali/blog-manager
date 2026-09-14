/**
 * Deterministic Mission outcome classification + post-mission next-state.
 * Consumes Decision Engine — does not rescore.
 */
import { runDecisionEngine } from '../decision/engine.js';
import { emitDomainEvent } from '../jobs/events.js';
import {
  captureOutcomeSnapshot,
  getMeasurement,
  getMissionMeasurements,
  listDirectTaskChanges
} from './measurement.js';
import type {
  AttributedChange,
  MetricValue,
  MissionMeasurementSnapshot,
  MissionNextState,
  MissionOutcomeReport,
  OutcomeClassification
} from './measurementTypes.js';
import { getActivePlan, getMission, saveOutcome, upsertMission } from './store.js';
import type { MissionOutcome } from './types.js';

function availableNumber(m?: MetricValue): number | null {
  if (!m) return null;
  if (m.state === 'AVAILABLE' && typeof m.value === 'number') return m.value;
  return null;
}

function compareMetric(
  key: string,
  label: string,
  before: MetricValue,
  after: MetricValue,
  lowerIsBetter = false
): AttributedChange | null {
  const b = availableNumber(before);
  const a = availableNumber(after);
  if (b == null || a == null) return null;
  const delta = a - b;
  if (delta === 0) return null;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return {
    key,
    label: `${label}: ${b} → ${a}`,
    attribution: 'OBSERVED_CHANGE',
    before,
    after,
    delta,
    evidence: improved
      ? `${before.source || 'store'} → ${after.source || 'store'} (observed; causality not proven)`
      : `${before.source || 'store'} → ${after.source || 'store'} (observed regression; causality not proven)`
  };
}

function buildObservedChanges(
  baseline: MissionMeasurementSnapshot | null | undefined,
  outcome: MissionMeasurementSnapshot | null | undefined
): { changes: AttributedChange[]; unchanged: string[]; unavailable: string[] } {
  const changes: AttributedChange[] = [];
  const unchanged: string[] = [];
  const unavailable: string[] = [];
  if (!baseline || !outcome) {
    unavailable.push('Baseline or outcome snapshot missing');
    return { changes, unchanged, unavailable };
  }

  const pairs: Array<[string, string, MetricValue, MetricValue, boolean?]> = [
    [
      'stale_articles',
      'Stale article count',
      baseline.metrics.content.staleArticleCount,
      outcome.metrics.content.staleArticleCount,
      true
    ],
    [
      'content_gaps',
      'Content gap count',
      baseline.metrics.content.contentGapCount,
      outcome.metrics.content.contentGapCount,
      true
    ],
    [
      'seo_issues',
      'SEO issue count',
      baseline.metrics.seo.seoIssueCount,
      outcome.metrics.seo.seoIssueCount,
      true
    ],
    [
      'decayed',
      'Decayed article count',
      baseline.metrics.seo.decayedArticleCount,
      outcome.metrics.seo.decayedArticleCount,
      true
    ],
    [
      'clicks',
      'Clicks',
      baseline.metrics.performance.clicks,
      outcome.metrics.performance.clicks,
      false
    ],
    [
      'impressions',
      'Impressions',
      baseline.metrics.performance.impressions,
      outcome.metrics.performance.impressions,
      false
    ]
  ];

  for (const [key, label, before, after, lowerIsBetter] of pairs) {
    if (before.state !== 'AVAILABLE' || after.state !== 'AVAILABLE') {
      unavailable.push(`${label}: ${before.state}/${after.state}`);
      continue;
    }
    const change = compareMetric(key, label, before, after, lowerIsBetter);
    if (change) changes.push(change);
    else unchanged.push(label);
  }

  for (const [name, m] of [
    ['Search Console', outcome.metrics.providers.searchConsole],
    ['Analytics', outcome.metrics.providers.analytics]
  ] as const) {
    if (m.state === 'UNAVAILABLE' || m.state === 'DEMO_DATA') {
      unavailable.push(`${name}: ${m.state}${m.detail ? ` (${m.detail})` : ''}`);
    }
  }

  return { changes, unchanged, unavailable };
}

function classify(params: {
  missionStatus: string;
  failedTasks: number;
  completedTasks: number;
  directCount: number;
  observed: AttributedChange[];
  unavailablePerf: boolean;
  anyAvailableSiteMetric: boolean;
}): OutcomeClassification {
  // Mixed complete+fail is PARTIAL, not total failure
  if (params.failedTasks > 0 && params.completedTasks === 0) {
    return 'FAILED_EXECUTION';
  }

  const improvements = params.observed.filter(
    (c) =>
      c.attribution === 'OBSERVED_CHANGE' &&
      typeof c.delta === 'number' &&
      (((c.key === 'clicks' || c.key === 'impressions') && c.delta > 0) ||
        ((c.key === 'stale_articles' ||
          c.key === 'seo_issues' ||
          c.key === 'decayed' ||
          c.key === 'content_gaps') &&
          c.delta < 0))
  );

  const regressions = params.observed.filter(
    (c) =>
      c.attribution === 'OBSERVED_CHANGE' &&
      typeof c.delta === 'number' &&
      (((c.key === 'clicks' || c.key === 'impressions') && c.delta < 0) ||
        ((c.key === 'stale_articles' ||
          c.key === 'seo_issues' ||
          c.key === 'decayed' ||
          c.key === 'content_gaps') &&
          c.delta > 0))
  );

  if (regressions.length > 0 && improvements.length === 0 && params.directCount === 0) {
    return 'REGRESSION';
  }

  if (!params.anyAvailableSiteMetric && params.directCount === 0) {
    return 'INSUFFICIENT_DATA';
  }

  if (params.directCount > 0 && params.failedTasks === 0 && params.missionStatus === 'COMPLETED') {
    if (regressions.length > 0 && improvements.length > 0) return 'PARTIAL_SUCCESS';
    if (regressions.length > 0) return 'PARTIAL_SUCCESS';
    // Direct work done + measured improvement
    if (improvements.length > 0) return 'SUCCESS';
    // Direct work done but site metrics flat / unavailable for comparison
    if (params.unavailablePerf || params.observed.length === 0) return 'PARTIAL_SUCCESS';
    return 'NO_MEASURABLE_CHANGE';
  }

  if (params.directCount > 0 && params.failedTasks > 0) return 'PARTIAL_SUCCESS';
  if (params.missionStatus === 'FAILED' && params.completedTasks > 0) return 'PARTIAL_SUCCESS';
  if (params.missionStatus === 'FAILED') return 'FAILED_EXECUTION';

  if (params.completedTasks > 0 && params.directCount === 0 && params.observed.length === 0) {
    return params.unavailablePerf ? 'INSUFFICIENT_DATA' : 'NO_MEASURABLE_CHANGE';
  }

  if (params.observed.length > 0 && params.directCount === 0) return 'INCONCLUSIVE';

  return 'INCONCLUSIVE';
}

function computeNextState(
  siteId: string,
  missionId: string,
  classification: OutcomeClassification
): {
  nextState: MissionNextState;
  nextRecommendations: MissionOutcomeReport['nextRecommendations'];
  replanAvailable: boolean;
} {
  if (classification === 'INSUFFICIENT_DATA') {
    return { nextState: 'INSUFFICIENT_DATA', nextRecommendations: [], replanAvailable: false };
  }

  const engine = runDecisionEngine(siteId, { persist: false, topN: 8 });
  const actionable = engine.decisions.filter(
    (d) => d.recommendedAction !== 'DEFER' && d.feasibilityStatus !== 'INSUFFICIENT_DATA'
  );
  const nextRecommendations = actionable.slice(0, 5).map((d) => ({
    decisionId: d.id,
    action: d.recommendedAction,
    title: d.title,
    priority: d.priority
  }));

  if (!actionable.length) {
    return { nextState: 'NO_FURTHER_ACTION', nextRecommendations: [], replanAvailable: false };
  }

  const mission = getMission(siteId, missionId);
  const plan = mission ? getActivePlan(siteId, mission) : undefined;
  const pendingKeys = new Set(
    (plan?.tasks || [])
      .filter((t) => ['PENDING', 'READY', 'WAITING_FOR_REVIEW', 'STALE', 'BLOCKED'].includes(t.status))
      .map((t) => t.logicalKey)
  );

  const overlapsPending = actionable.some((d) =>
    (plan?.tasks || []).some(
      (t) =>
        pendingKeys.has(t.logicalKey) &&
        ((t.articleId != null &&
          d.articleId != null &&
          String(t.articleId) === String(d.articleId)) ||
          (t.entityId && d.entityId && t.entityId === d.entityId) ||
          t.plannedAction === d.recommendedAction)
    )
  );

  const stillOpenProblems = actionable.length > 0;
  if (mission && ['RUNNING', 'WAITING_FOR_REVIEW', 'PAUSED', 'READY'].includes(mission.status)) {
    return {
      nextState: overlapsPending ? 'CONTINUE_EXISTING_MISSION' : 'REPLAN_MISSION',
      nextRecommendations,
      replanAvailable: true
    };
  }

  if (stillOpenProblems) {
    return {
      nextState: 'NEW_RECOMMENDATIONS',
      nextRecommendations,
      replanAvailable: true
    };
  }

  return { nextState: 'NO_FURTHER_ACTION', nextRecommendations: [], replanAvailable: false };
}

export function buildMissionOutcomeReport(siteId: string, missionId: string): MissionOutcomeReport {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const plan = getActivePlan(siteId, mission);
  const tasks = plan?.tasks || [];

  const baseline = mission.baselineMeasurementId
    ? getMeasurement(siteId, mission.baselineMeasurementId)
    : getMissionMeasurements(siteId, missionId).find((m) => m.type === 'BASELINE');
  const outcomeSnap = mission.outcomeMeasurementId
    ? getMeasurement(siteId, mission.outcomeMeasurementId)
    : getMissionMeasurements(siteId, missionId).find((m) => m.type === 'OUTCOME');

  const direct = listDirectTaskChanges(siteId, missionId).map((d) => ({
    key: d.key,
    label: d.label,
    attribution: d.attribution,
    delta: d.delta,
    evidence: d.evidence
  })) as AttributedChange[];

  const { changes: observed, unchanged, unavailable } = buildObservedChanges(
    baseline,
    outcomeSnap
  );
  const changes = [...direct, ...observed];

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
  const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;
  const skippedTasks = tasks.filter((t) => t.status === 'SKIPPED').length;
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
  const reviewTasks = tasks.filter((t) => t.status === 'WAITING_FOR_REVIEW').length;
  const pendingTasks = tasks.filter((t) => t.status === 'PENDING' || t.status === 'READY').length;
  const jobsExecuted = tasks.filter((t) => Boolean(t.jobId)).length;
  const decisionsEvaluated = tasks.filter((t) => Boolean(t.decisionId)).length;

  const unavailablePerf =
    !outcomeSnap ||
    (outcomeSnap.metrics.performance.clicks.state !== 'AVAILABLE' &&
      outcomeSnap.metrics.performance.impressions.state !== 'AVAILABLE');

  const anyAvailableSiteMetric = Boolean(
    baseline &&
      (availableNumber(baseline.metrics.content.articleCount) != null ||
        availableNumber(baseline.metrics.seo.seoIssueCount) != null)
  );

  const classification = classify({
    missionStatus: mission.status,
    failedTasks,
    completedTasks,
    directCount: direct.length,
    observed,
    unavailablePerf,
    anyAvailableSiteMetric
  });

  const expectedImpactSummary = [
    ...new Set(
      (plan?.tasks || [])
        .map((t) => t.expectedImpact)
        .filter(Boolean)
        .map((v) => `Expected impact: ${v}`)
    )
  ].slice(0, 6);

  const { nextState, nextRecommendations, replanAvailable } = computeNextState(
    siteId,
    missionId,
    classification
  );

  const matchedExpectations: MissionOutcomeReport['matchedExpectations'] =
    classification === 'SUCCESS'
      ? 'YES'
      : classification === 'PARTIAL_SUCCESS'
        ? 'PARTIAL'
        : classification === 'FAILED_EXECUTION' || classification === 'REGRESSION'
          ? 'NO'
          : 'UNKNOWN';

  const evidence = changes.map((c) => ({ claim: c.label, source: c.evidence }));
  const unknowns: string[] = [];
  if (unavailablePerf) unknowns.push('Traffic/SEO provider metrics unavailable or demo');
  if (!baseline) unknowns.push('No baseline snapshot');
  if (!outcomeSnap && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(mission.status)) {
    unknowns.push('No outcome snapshot yet');
  }
  for (const u of unavailable) unknowns.push(u);

  return {
    missionId,
    siteId,
    goal: mission.goal,
    missionStatus: mission.status,
    classification,
    executionConfidence:
      classification === 'SUCCESS' ? 'HIGH' : classification === 'PARTIAL_SUCCESS' ? 'MEDIUM' : 'LOW',
    expectedImpactSummary,
    execution: {
      completedTasks,
      failedTasks,
      skippedTasks,
      blockedTasks,
      reviewTasks,
      pendingTasks,
      jobsExecuted,
      decisionsEvaluated
    },
    baseline: baseline || null,
    outcome: outcomeSnap || null,
    window: {
      baselineCapturedAt: baseline?.capturedAt,
      outcomeCapturedAt: outcomeSnap?.capturedAt
    },
    changes,
    unchanged,
    unavailable,
    evidence,
    unknowns,
    matchedExpectations,
    nextState,
    nextRecommendations,
    replanAvailable,
    evaluatedAt: new Date().toISOString()
  };
}

/** Terminal evaluate: ensure outcome snapshot + persist report. */
export function evaluateAndPersistMissionOutcome(
  siteId: string,
  missionId: string
): MissionOutcomeReport {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');

  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(mission.status) && !mission.outcomeMeasurementId) {
    captureOutcomeSnapshot(siteId, missionId);
  }

  const report = buildMissionOutcomeReport(siteId, missionId);

  const legacy: MissionOutcome = {
    missionId,
    siteId,
    completedTasks: report.execution.completedTasks,
    failedTasks: report.execution.failedTasks,
    blockedTasks: report.execution.blockedTasks,
    reviewTasks: report.execution.reviewTasks,
    decisionsEvaluated: report.execution.decisionsEvaluated,
    jobsExecuted: report.execution.jobsExecuted,
    startedAt: mission.startedAt,
    completedAt: mission.completedAt,
    performance: report.classification === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : undefined,
    classification: report.classification,
    baselineMeasurementId: mission.baselineMeasurementId,
    outcomeMeasurementId: getMission(siteId, missionId)?.outcomeMeasurementId,
    nextState: report.nextState,
    report
  };
  saveOutcome(siteId, legacy);

  const latest = getMission(siteId, missionId)!;
  upsertMission(siteId, {
    ...latest,
    outcomeClassification: report.classification,
    nextState: report.nextState,
    updatedAt: new Date().toISOString()
  });

  emitDomainEvent({
    type: 'MISSION_OUTCOME_EVALUATED',
    siteId,
    entityId: missionId,
    metadata: {
      classification: report.classification,
      nextState: report.nextState,
      replanAvailable: report.replanAvailable
    }
  });
  emitDomainEvent({
    type: 'MISSION_REEVALUATED',
    siteId,
    entityId: missionId,
    metadata: { nextRecommendations: report.nextRecommendations.length }
  });

  return report;
}
