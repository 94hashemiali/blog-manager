import { runDecisionEngine } from '../decision/engine.js';
import { getDecision } from '../decision/store.js';
import { applyPolicyToDecision } from '../decision/policy.js';
import { executeRecommendation } from '../operations/execute.js';
import { getRecommendation } from '../operations/recommendations.js';
import { emitDomainEvent } from '../jobs/events.js';
import { getOpsJob } from '../jobs/store.js';
import { dependenciesSatisfied, compareTasksDeterministic } from './graph.js';
import { replanMission } from './planner.js';
import { isReviewTask } from './tasks.js';
import {
  getActivePlan,
  getMission,
  newMissionId,
  savePlan,
  upsertMission
} from './store.js';
import { reevaluateMissionAfterTaskChange } from './softReplan.js';
import { captureBaseline } from './measurement.js';
import { evaluateAndPersistMissionOutcome } from './outcome.js';
import {
  MAX_CONCURRENT_MISSION_TASKS,
  type Mission,
  type MissionPlan,
  type MissionTask,
  type NextTaskResult
} from './types.js';

function emit(type: any, siteId: string, entityId?: string, metadata?: Record<string, unknown>) {
  emitDomainEvent({ type, siteId, entityId, metadata });
}

export function getNextExecutableTask(siteId: string, missionId: string): NextTaskResult {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) {
    return { task: null, reason: 'NO_ACTIONABLE_TASK', detail: 'Mission not found' };
  }
  if (mission.status === 'COMPLETED') {
    return { task: null, reason: 'MISSION_COMPLETED' };
  }
  if (mission.status === 'PAUSED' || mission.status === 'CANCELLED') {
    return { task: null, reason: 'MISSION_PAUSED', detail: mission.status };
  }
  if (mission.status === 'WAITING_FOR_REVIEW') {
    const plan = getActivePlan(siteId, mission);
    const byIdEarly = new Map((plan?.tasks || []).map((t) => [t.id, t]));
    const review = plan?.tasks
      .filter((t) => t.status === 'WAITING_FOR_REVIEW')
      .filter((t) => dependenciesSatisfied(t, byIdEarly))
      .sort(compareTasksDeterministic)[0];
    if (review) {
      return {
        task: review,
        reason: 'WAITING_FOR_REVIEW',
        detail: review.title
      };
    }
    // Review still blocked by deps — continue normal selection below
  }
  if (
    mission.status !== 'RUNNING' &&
    mission.status !== 'READY' &&
    mission.status !== 'WAITING_FOR_REVIEW'
  ) {
    return { task: null, reason: 'MISSION_NOT_RUNNING', detail: mission.status };
  }

  const plan = getActivePlan(siteId, mission);
  if (!plan) return { task: null, reason: 'NO_ACTIONABLE_TASK', detail: 'No plan' };

  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const running = plan.tasks.filter((t) => t.status === 'RUNNING');
  if (running.length >= MAX_CONCURRENT_MISSION_TASKS) {
    return { task: running[0], reason: 'CONCURRENCY_LIMIT' };
  }

  const terminal = ['COMPLETED', 'SKIPPED', 'CANCELLED', 'STALE', 'FAILED'];
  if (plan.tasks.length > 0 && plan.tasks.every((t) => terminal.includes(t.status))) {
    return { task: null, reason: 'MISSION_COMPLETED' };
  }

  const candidates = plan.tasks
    .filter((t) => t.status === 'PENDING' || t.status === 'READY' || t.status === 'WAITING_FOR_REVIEW')
    .filter((t) => dependenciesSatisfied(t, byId))
    .filter((t) => {
      if (t.status === 'WAITING_FOR_REVIEW' || isReviewTask(t)) return true;
      return t.blockers.length === 0;
    })
    .sort(compareTasksDeterministic);

  if (!candidates.length) {
    const blocked = plan.tasks.some((t) => t.status === 'BLOCKED' || t.blockers.length > 0);
    const pendingDeps = plan.tasks.some(
      (t) =>
        (t.status === 'PENDING' || t.status === 'READY' || t.status === 'WAITING_FOR_REVIEW') &&
        !dependenciesSatisfied(t, byId)
    );
    if (blocked && !pendingDeps) return { task: null, reason: 'BLOCKED' };
    if (pendingDeps) return { task: null, reason: 'WAITING_FOR_DEPENDENCY' };
    return { task: null, reason: 'NO_ACTIONABLE_TASK' };
  }

  const next = candidates[0];
  if (next.status === 'WAITING_FOR_REVIEW' || isReviewTask(next)) {
    return { task: next, reason: 'WAITING_FOR_REVIEW' };
  }
  return { task: next };
}

function refreshPlanTask(
  siteId: string,
  plan: MissionPlan,
  taskId: string,
  patch: Partial<MissionTask>
): MissionPlan {
  const tasks = plan.tasks.map((t) =>
    t.id === taskId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
  );
  const next = { ...plan, tasks };
  savePlan(siteId, next);
  return next;
}

/** Detect stale decision before execute. */
export function detectStaleTask(
  siteId: string,
  task: MissionTask
): { stale: boolean; reason?: string; currentAction?: string } {
  if (!task.decisionId && !task.plannedAction) return { stale: false };

  const engine = runDecisionEngine(siteId, { persist: false, topN: 20 });
  let current = task.decisionId
    ? engine.decisions.find((d) => d.id === task.decisionId)
    : undefined;

  if (!current && task.articleId != null) {
    current = engine.decisions.find(
      (d) =>
        d.articleId != null &&
        String(d.articleId) === String(task.articleId) &&
        (d.recommendedAction === task.plannedAction ||
          d.recommendedAction === task.decisionAction)
    );
  }
  if (!current && task.entityId) {
    current = engine.decisions.find(
      (d) =>
        d.entityId === task.entityId &&
        (d.recommendedAction === task.plannedAction ||
          d.recommendedAction === task.decisionAction)
    );
  }

  // Decision gone and was update/create → likely resolved or changed
  if (!current) {
    const related = engine.decisions.find(
      (d) =>
        (task.articleId != null &&
          d.articleId != null &&
          String(d.articleId) === String(task.articleId)) ||
        (task.entityId && d.entityId === task.entityId)
    );
    if (related && task.plannedAction && related.recommendedAction !== task.plannedAction) {
      return {
        stale: true,
        reason: `Decision changed to ${related.recommendedAction}`,
        currentAction: related.recommendedAction
      };
    }
    // No related decision — treat as still ok for sync/retry/configure; stale for content mutations
    if (
      task.type === 'UPDATE_ARTICLE' ||
      task.type === 'CREATE_ARTICLE' ||
      task.type === 'FIX_SEO' ||
      task.type === 'RESEARCH'
    ) {
      return { stale: true, reason: 'Underlying decision no longer present' };
    }
    return { stale: false };
  }

  if (task.plannedAction && current.recommendedAction !== task.plannedAction) {
    return {
      stale: true,
      reason: `Decision changed from ${task.plannedAction} to ${current.recommendedAction}`,
      currentAction: current.recommendedAction
    };
  }

  if (
    current.feasibilityStatus === 'BLOCKED' &&
    current.blockers.some((b) => b.code === 'RESEARCH_CONFLICT')
  ) {
    return { stale: true, reason: 'Update blocked by research conflict', currentAction: current.recommendedAction };
  }

  void getDecision;
  return { stale: false, currentAction: current.recommendedAction };
}

export function startMission(siteId: string, missionId: string): {
  mission: Mission;
  next: NextTaskResult;
} {
  let mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  if (mission.status === 'CANCELLED') throw new Error('Mission cancelled');
  if (mission.status === 'PAUSED') throw new Error('Mission is paused — use resume');
  if (mission.status === 'COMPLETED') throw new Error('Mission already completed');

  if (!mission.activePlanId) {
    const { mission: planned } = replanMission(siteId, missionId, 'Plan on start');
    mission = planned;
  }

  const now = new Date().toISOString();
  mission = {
    ...mission,
    status: 'RUNNING',
    startedAt: mission.startedAt || now,
    updatedAt: now
  };
  upsertMission(siteId, mission);
  emit('MISSION_STARTED', siteId, missionId);
  try {
    captureBaseline(siteId, missionId);
  } catch (err) {
    console.warn('baseline capture failed', err);
  }
  mission = getMission(siteId, missionId) || mission;

  const next = getNextExecutableTask(siteId, missionId);
  if (next.reason === 'WAITING_FOR_REVIEW') {
    mission = {
      ...mission,
      status: 'WAITING_FOR_REVIEW',
      updatedAt: new Date().toISOString()
    };
    upsertMission(siteId, mission);
    emit('MISSION_WAITING_REVIEW', siteId, missionId, { taskId: next.task?.id });
  }

  return { mission: getMission(siteId, missionId) || mission, next };
}

export function pauseMission(siteId: string, missionId: string): Mission {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  if (mission.status === 'CANCELLED' || mission.status === 'COMPLETED') {
    throw new Error(`Cannot pause mission in ${mission.status}`);
  }
  const updated = {
    ...mission,
    status: 'PAUSED' as const,
    updatedAt: new Date().toISOString()
  };
  upsertMission(siteId, updated);
  emit('MISSION_PAUSED', siteId, missionId);
  return updated;
}

/** Resume a PAUSED mission → RUNNING (or WAITING_FOR_REVIEW if next needs human). */
export function resumeMission(siteId: string, missionId: string): {
  mission: Mission;
  next: NextTaskResult;
} {
  let mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  if (mission.status !== 'PAUSED') {
    throw new Error(`Mission is ${mission.status}, not PAUSED`);
  }
  if (!mission.activePlanId) {
    const { mission: planned } = replanMission(siteId, missionId, 'Plan on resume');
    mission = planned;
  }
  // Catch job completions / domain drift while paused
  syncMissionTaskJobs(siteId, missionId);
  mission = getMission(siteId, missionId) || mission;

  mission = {
    ...mission,
    status: 'RUNNING',
    updatedAt: new Date().toISOString()
  };
  upsertMission(siteId, mission);
  emit('MISSION_STARTED', siteId, missionId, { resumed: true });
  reevaluateMissionAfterTaskChange(siteId, missionId, 'Resume re-evaluation');
  mission = getMission(siteId, missionId) || mission;

  const next = getNextExecutableTask(siteId, missionId);
  if (next.reason === 'WAITING_FOR_REVIEW') {
    mission = {
      ...mission,
      status: 'WAITING_FOR_REVIEW',
      updatedAt: new Date().toISOString()
    };
    upsertMission(siteId, mission);
    emit('MISSION_WAITING_REVIEW', siteId, missionId, { taskId: next.task?.id });
  }
  return { mission: getMission(siteId, missionId) || mission, next };
}

export function cancelMission(siteId: string, missionId: string): Mission {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const plan = getActivePlan(siteId, mission);
  if (plan) {
    const tasks = plan.tasks.map((t) =>
      t.status === 'PENDING' || t.status === 'READY' || t.status === 'WAITING_FOR_REVIEW'
        ? { ...t, status: 'CANCELLED' as const, updatedAt: new Date().toISOString() }
        : t
    );
    savePlan(siteId, { ...plan, tasks });
  }
  const updated = {
    ...mission,
    status: 'CANCELLED' as const,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  upsertMission(siteId, updated);
  emit('MISSION_CANCELLED', siteId, missionId);
  try {
    evaluateAndPersistMissionOutcome(siteId, missionId);
  } catch (err) {
    console.warn('cancel outcome evaluate failed', err);
  }
  return getMission(siteId, missionId) || updated;
}

/**
 * Execute next (or specific) task through Recommendation → Job path.
 */
export function executeMissionTask(
  siteId: string,
  missionId: string,
  taskId?: string
): {
  mission: Mission;
  task: MissionTask;
  message: string;
  opsJobId?: string;
  productionJobId?: string;
  replanned?: boolean;
} {
  let mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  if (mission.status === 'PAUSED' || mission.status === 'CANCELLED') {
    throw new Error(`Mission is ${mission.status}`);
  }
  if (mission.status === 'DRAFT' || mission.status === 'PLANNING') {
    throw new Error('Mission not started');
  }

  let plan = getActivePlan(siteId, mission);
  if (!plan) throw new Error('No active plan');

  const nextInfo = getNextExecutableTask(siteId, missionId);
  const task = taskId ? plan.tasks.find((t) => t.id === taskId) : nextInfo.task;
  if (!task) throw new Error(nextInfo.detail || nextInfo.reason || 'No executable task');

  if (taskId) {
    if (!nextInfo.task || taskId !== nextInfo.task.id) {
      throw new Error(
        nextInfo.reason === 'WAITING_FOR_DEPENDENCY'
          ? 'Task blocked by unfinished dependencies'
          : `Not next executable task (${nextInfo.reason || 'order'})`
      );
    }
  }

  // Stale check
  const stale = detectStaleTask(siteId, task);
  if (stale.stale) {
    plan = refreshPlanTask(siteId, plan, task.id, {
      status: 'STALE',
      result: { message: stale.reason, at: new Date().toISOString() }
    });
    emit('MISSION_TASK_STALE', siteId, missionId, { taskId: task.id, reason: stale.reason });
    const { mission: replanned, plan: newPlan } = replanMission(
      siteId,
      missionId,
      stale.reason || 'Stale decision'
    );
    emit('MISSION_REPLANNED', siteId, missionId, { reason: stale.reason });
    return {
      mission: replanned,
      task: newPlan.tasks.find((t) => t.id === task.id) || {
        ...task,
        status: 'STALE'
      },
      message: `Task stale: ${stale.reason}. Mission replanned.`,
      replanned: true
    };
  }

  // Review gate — never auto-execute review/create; pause for human approve
  if (
    task.status === 'WAITING_FOR_REVIEW' ||
    task.type === 'REVIEW_SOURCE' ||
    task.type === 'REVIEW_CONTENT' ||
    task.type === 'CREATE_ARTICLE'
  ) {
    mission = {
      ...mission,
      status: 'WAITING_FOR_REVIEW',
      updatedAt: new Date().toISOString()
    };
    upsertMission(siteId, mission);
    plan = refreshPlanTask(siteId, plan, task.id, { status: 'WAITING_FOR_REVIEW' });
    emit('MISSION_WAITING_REVIEW', siteId, missionId, { taskId: task.id });
    return {
      mission,
      task: plan.tasks.find((t) => t.id === task.id)!,
      message: 'Waiting for human review — use approve endpoint'
    };
  }

  // Ensure recommendation exists
  let recommendationId = task.recommendationId;
  if (!recommendationId && task.decisionId) {
    const engine = runDecisionEngine(siteId, { persist: true, topN: 20 });
    const decision =
      engine.decisions.find((d) => d.id === task.decisionId) ||
      engine.decisions.find(
        (d) =>
          d.recommendedAction === task.plannedAction &&
          ((task.articleId != null &&
            d.articleId != null &&
            String(d.articleId) === String(task.articleId)) ||
            (task.entityId && d.entityId === task.entityId))
      );
    if (decision) {
      const applied = applyPolicyToDecision(siteId, decision, 'RECOMMEND');
      recommendationId = applied.recommendationId;
    }
  }
  if (!recommendationId) {
    throw new Error('No recommendation linked to task — cannot execute');
  }

  const existingRec = getRecommendation(siteId, recommendationId);
  if (existingRec?.status === 'IN_PROGRESS' && existingRec.linkedJobId) {
    plan = refreshPlanTask(siteId, plan, task.id, {
      status: 'RUNNING',
      recommendationId,
      jobId: existingRec.linkedJobId,
      result: { message: 'Reused in-progress job', opsJobId: existingRec.linkedJobId }
    });
    return {
      mission,
      task: plan.tasks.find((t) => t.id === task.id)!,
      message: 'Already in progress',
      opsJobId: existingRec.linkedJobId,
      productionJobId: existingRec.linkedProductionJobId
    };
  }

  plan = refreshPlanTask(siteId, plan, task.id, {
    status: 'RUNNING',
    recommendationId
  });
  emit('MISSION_TASK_STARTED', siteId, missionId, { taskId: task.id });

  try {
    const out = executeRecommendation(siteId, recommendationId);
    const jobId = out.opsJobId || out.recommendation.linkedJobId;
    // Review/ack path may complete immediately without job
    const completedImmediately =
      !jobId &&
      (out.recommendation.status === 'ACKNOWLEDGED' ||
        out.recommendation.status === 'COMPLETED' ||
        out.recommendation.status === 'EXPIRED');

    if (completedImmediately) {
      plan = refreshPlanTask(siteId, plan, task.id, {
        status: out.recommendation.status === 'EXPIRED' ? 'SKIPPED' : 'COMPLETED',
        recommendationId,
        jobId,
        result: {
          message: out.message,
          opsJobId: jobId,
          productionJobId: out.productionJobId,
          at: new Date().toISOString()
        }
      });
      emit('MISSION_TASK_COMPLETED', siteId, missionId, { taskId: task.id });
      mission = maybeCompleteOrAdvance(siteId, missionId);
      reevaluateMissionAfterTaskChange(siteId, missionId, 'Task completed immediately');
      mission = getMission(siteId, missionId) || mission;
      return {
        mission,
        task: getActivePlan(siteId, mission)!.tasks.find((t) => t.id === task.id)!,
        message: out.message,
        opsJobId: jobId,
        productionJobId: out.productionJobId
      };
    }

    plan = refreshPlanTask(siteId, plan, task.id, {
      status: 'RUNNING',
      recommendationId,
      jobId,
      result: {
        message: out.message,
        opsJobId: jobId,
        productionJobId: out.productionJobId,
        at: new Date().toISOString()
      }
    });

    return {
      mission,
      task: plan.tasks.find((t) => t.id === task.id)!,
      message: out.message,
      opsJobId: jobId,
      productionJobId: out.productionJobId
    };
  } catch (err: any) {
    plan = refreshPlanTask(siteId, plan, task.id, {
      status: 'FAILED',
      result: { message: err?.message || 'Execute failed', at: new Date().toISOString() }
    });
    emit('MISSION_TASK_FAILED', siteId, missionId, {
      taskId: task.id,
      error: err?.message
    });
    maybeCompleteOrAdvance(siteId, missionId);
    reevaluateMissionAfterTaskChange(siteId, missionId, 'Task failed');
    throw err;
  }
}

export function approveMissionTask(
  siteId: string,
  missionId: string,
  taskId: string
): { mission: Mission; task: MissionTask; message: string } {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  let plan = getActivePlan(siteId, mission);
  if (!plan) throw new Error('No plan');
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('Task not found');
  if (task.status !== 'WAITING_FOR_REVIEW' && !isReviewTask(task)) {
    throw new Error('Only review tasks can be approved');
  }

  // Execute review recommendation (ack) then mark completed
  if (task.recommendationId) {
    try {
      executeRecommendation(siteId, task.recommendationId);
    } catch {
      // ack-only failures ok if already acknowledged
    }
  }

  plan = refreshPlanTask(siteId, plan, taskId, {
    status: 'COMPLETED',
    result: {
      message: 'Human approved review task',
      at: new Date().toISOString()
    }
  });

  let updated: Mission = {
    ...mission,
    status: 'RUNNING',
    updatedAt: new Date().toISOString()
  };
  upsertMission(siteId, updated);
  emit('MISSION_TASK_COMPLETED', siteId, missionId, { taskId, approved: true });
  updated = maybeCompleteOrAdvance(siteId, missionId);
  reevaluateMissionAfterTaskChange(siteId, missionId, 'Review approved');
  updated = getMission(siteId, missionId) || updated;
  return {
    mission: updated,
    task: getActivePlan(siteId, updated)!.tasks.find((t) => t.id === taskId)!,
    message: 'Review approved'
  };
}

/** Sync RUNNING tasks from job store; complete mission when done. */
export function syncMissionTaskJobs(siteId: string, missionId: string): Mission {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const plan = getActivePlan(siteId, mission);
  if (!plan) return mission;

  let changed = false;
  let tasks = [...plan.tasks];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.status !== 'RUNNING' || !t.jobId) continue;
    const job = getOpsJob(t.jobId, siteId);
    if (!job) continue;
    if (job.status === 'COMPLETED') {
      tasks[i] = {
        ...t,
        status: 'COMPLETED',
        updatedAt: new Date().toISOString(),
        result: { ...t.result, message: 'Job completed', at: new Date().toISOString() }
      };
      changed = true;
      emit('MISSION_TASK_COMPLETED', siteId, missionId, { taskId: t.id, jobId: t.jobId });
    } else if (
      job.status === 'FAILED' ||
      job.status === 'CANCELLED' ||
      job.status === 'RECOVERY_REQUIRED'
    ) {
      tasks[i] = {
        ...t,
        status: 'FAILED',
        updatedAt: new Date().toISOString(),
        result: {
          ...t.result,
          message: `Job ${job.status}`,
          at: new Date().toISOString()
        }
      };
      changed = true;
      emit('MISSION_TASK_FAILED', siteId, missionId, { taskId: t.id, jobId: t.jobId });
    }
  }

  if (changed) {
    savePlan(siteId, { ...plan, tasks });
  }
  const updated = maybeCompleteOrAdvance(siteId, missionId);
  if (changed) {
    reevaluateMissionAfterTaskChange(siteId, missionId, 'Job sync task change');
  }
  return getMission(siteId, missionId) || updated;
}

function maybeCompleteOrAdvance(siteId: string, missionId: string): Mission {
  let mission = getMission(siteId, missionId)!;
  const plan = getActivePlan(siteId, mission);
  if (!plan) return mission;

  const allDone = plan.tasks.every((t) =>
    ['COMPLETED', 'SKIPPED', 'CANCELLED', 'STALE', 'FAILED'].includes(t.status)
  );
  const anyFailed = plan.tasks.some((t) => t.status === 'FAILED');
  const waiting = plan.tasks.some((t) => t.status === 'WAITING_FOR_REVIEW');

  if (waiting) {
    mission = {
      ...mission,
      status: 'WAITING_FOR_REVIEW',
      updatedAt: new Date().toISOString()
    };
    upsertMission(siteId, mission);
    return mission;
  }

  if (allDone) {
    mission = {
      ...mission,
      status: anyFailed ? 'FAILED' : 'COMPLETED',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    upsertMission(siteId, mission);
    emit(anyFailed ? 'MISSION_TASK_FAILED' : 'MISSION_COMPLETED', siteId, missionId);
    try {
      evaluateAndPersistMissionOutcome(siteId, missionId);
    } catch (err) {
      console.warn('outcome evaluate failed', err);
    }
    return getMission(siteId, missionId) || mission;
  }

  if (mission.status !== 'RUNNING' && mission.status !== 'PAUSED') {
    mission = { ...mission, status: 'RUNNING', updatedAt: new Date().toISOString() };
    upsertMission(siteId, mission);
  }
  return mission;
}

export function createMission(
  siteId: string,
  input: {
    title: string;
    description?: string;
    goal?: import('./types.js').MissionGoal;
    targetDate?: string;
  }
): Mission {
  const now = new Date().toISOString();
  const mission: Mission = {
    id: newMissionId(),
    siteId,
    title: input.title,
    description: input.description || '',
    goal: input.goal || 'CUSTOM',
    status: 'DRAFT',
    planVersion: 0,
    createdAt: now,
    updatedAt: now,
    targetDate: input.targetDate
  };
  upsertMission(siteId, mission);
  emit('MISSION_CREATED', siteId, mission.id);
  return mission;
}
