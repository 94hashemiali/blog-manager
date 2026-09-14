import { loadPerformanceStore } from '../performance/store.js';
import { getNextExecutableTask, syncMissionTaskJobs } from './executor.js';
import { getActivePlan, getMission, getOutcome, saveOutcome } from './store.js';
import type { MissionEvaluation, MissionOutcome } from './types.js';

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

export function captureMissionOutcome(siteId: string, missionId: string): MissionOutcome {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const plan = getActivePlan(siteId, mission);
  const tasks = plan?.tasks || [];
  const perf = loadPerformanceStore(siteId);
  const jobsExecuted = tasks.filter((t) => Boolean(t.jobId)).length;

  const outcome: MissionOutcome = {
    missionId,
    siteId,
    completedTasks: tasks.filter((t) => t.status === 'COMPLETED').length,
    failedTasks: tasks.filter((t) => t.status === 'FAILED').length,
    blockedTasks: tasks.filter((t) => t.status === 'BLOCKED').length,
    reviewTasks: tasks.filter((t) => t.status === 'WAITING_FOR_REVIEW').length,
    decisionsEvaluated: tasks.filter((t) => Boolean(t.decisionId)).length,
    jobsExecuted,
    startedAt: mission.startedAt,
    completedAt: mission.completedAt,
    performance:
      perf.records.length === 0
        ? 'INSUFFICIENT_DATA'
        : { beforeRecords: perf.records.length, afterRecords: perf.records.length }
  };
  saveOutcome(siteId, outcome);
  return outcome;
}

export function getMissionOutcome(siteId: string, missionId: string): MissionOutcome | undefined {
  return getOutcome(siteId, missionId) || undefined;
}
