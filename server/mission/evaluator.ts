import { getNextExecutableTask, syncMissionTaskJobs } from './executor.js';
import { getActivePlan, getMission, getOutcome } from './store.js';
import { getMeasurement } from './measurement.js';
import { buildMissionOutcomeReport } from './outcome.js';
import type { MissionEvaluation, MissionOutcome } from './types.js';
import type { MissionOutcomeReport } from './measurementTypes.js';

export function evaluateMission(siteId: string, missionId: string): MissionEvaluation {
  syncMissionTaskJobs(siteId, missionId);
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const plan = getActivePlan(siteId, mission);
  const tasks = plan?.tasks || [];
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED' || t.status === 'SKIPPED').length;
  const runningTasks = tasks.filter((t) => t.status === 'RUNNING').length;
  const pendingTasks = tasks.filter((t) => t.status === 'PENDING' || t.status === 'READY').length;
  const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
  const reviewTasks = tasks.filter((t) => t.status === 'WAITING_FOR_REVIEW').length;
  const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;
  const staleTasks = tasks.filter((t) => t.status === 'STALE').length;
  const total = tasks.length || 1;
  const progress = Math.round((completedTasks / total) * 100);

  const next = getNextExecutableTask(siteId, missionId);

  return {
    missionId,
    siteId,
    status: mission.status,
    planVersion: mission.planVersion,
    progress,
    completedTasks,
    runningTasks,
    pendingTasks,
    blockedTasks,
    reviewTasks,
    failedTasks,
    staleTasks,
    nextTask: next.task,
    nextReason: next.reason
  };
}

/**
 * Read-only outcome view. Persistence happens only on terminal executor hooks.
 * Never invent before/after record counts.
 */
export function captureMissionOutcome(siteId: string, missionId: string): MissionOutcome {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const cached = getOutcome(siteId, missionId);
  if (cached?.report) return cached;
  const report = buildMissionOutcomeReport(siteId, missionId);
  return legacyFromReport(siteId, missionId, report);
}

function legacyFromReport(
  siteId: string,
  missionId: string,
  report: MissionOutcomeReport
): MissionOutcome {
  const mission = getMission(siteId, missionId)!;
  return {
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
    outcomeMeasurementId: mission.outcomeMeasurementId,
    nextState: report.nextState,
    report
  };
}

export function getMissionOutcome(siteId: string, missionId: string): MissionOutcome | undefined {
  return getOutcome(siteId, missionId) || undefined;
}

/** Read-only report. Prefer cached persisted report when present. */
export function getMissionOutcomeReport(siteId: string, missionId: string): MissionOutcomeReport {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const cached = getOutcome(siteId, missionId);
  if (cached?.report) return cached.report;
  return buildMissionOutcomeReport(siteId, missionId);
}

export function getMissionBaseline(siteId: string, missionId: string) {
  const mission = getMission(siteId, missionId);
  if (!mission?.baselineMeasurementId) return null;
  return getMeasurement(siteId, mission.baselineMeasurementId) || null;
}
