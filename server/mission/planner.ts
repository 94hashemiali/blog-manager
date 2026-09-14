import { runDecisionEngine } from '../decision/engine.js';
import { DECISION_ENGINE_VERSION, type Decision } from '../decision/types.js';
import { applyPolicyToDecision } from '../decision/policy.js';
import { emitDomainEvent } from '../jobs/events.js';
import {
  compareTasksDeterministic,
  getExecutionOrder,
  validateTaskGraph
} from './graph.js';
import {
  appendDiff,
  getActivePlan,
  getMission,
  newPlanId,
  savePlan,
  upsertMission
} from './store.js';
import { decisionToTask, taskLogicalKey } from './tasks.js';
import {
  GOAL_ACTION_FILTER,
  type Mission,
  type MissionEdge,
  type MissionGoal,
  type MissionPlan,
  type MissionTask,
  type PlanDiff
} from './types.js';

function filterDecisionsByGoal(decisions: Decision[], goal: MissionGoal): Decision[] {
  const allowed = GOAL_ACTION_FILTER[goal];
  const filtered = allowed
    ? decisions.filter((d) => allowed.includes(d.recommendedAction))
    : decisions.slice();
  return filtered
    .filter((d) => d.recommendedAction !== 'DEFER')
    .filter((d) => d.feasibilityStatus !== 'INSUFFICIENT_DATA')
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 12);
}

function sameArticle(a?: string | number, b?: string | number): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/**
 * Add dependency edges only when domain state requires them.
 */
export function wireDependencies(tasks: MissionTask[], decisions: Decision[]): MissionEdge[] {
  const edges: MissionEdge[] = [];
  const byLogical = new Map(tasks.map((t) => [t.logicalKey, t]));

  const add = (from: MissionTask, to: MissionTask, reason: string) => {
    if (from.id === to.id) return;
    if (!to.dependsOn.includes(from.id)) to.dependsOn.push(from.id);
    if (!from.blocks.includes(to.id)) from.blocks.push(to.id);
    if (!edges.some((e) => e.from === from.id && e.to === to.id)) {
      edges.push({ from: from.id, to: to.id, reason });
    }
  };

  for (const task of tasks) {
    if (task.type !== 'UPDATE_ARTICLE' && task.type !== 'FIX_SEO') continue;

    const decision = decisions.find((d) => d.id === task.decisionId);
    const signals = decision?.signals || [];
    const needsResearch = signals.some(
      (s) =>
        s.type === 'STALE_RESEARCH' ||
        s.type === 'SOURCE_CHANGED' ||
        (s.type === 'RESEARCH_CONFLICT' && (s.severity === 'HIGH' || s.severity === 'CRITICAL'))
    );
    const needsSourceReview = signals.some(
      (s) =>
        s.type === 'RESEARCH_CONFLICT' ||
        s.type === 'SOURCE_CHANGED' ||
        s.type === 'HIGH_RISK_CLAIM'
    );

    if (needsResearch) {
      const research = tasks.find(
        (t) =>
          t.type === 'RESEARCH' &&
          (sameArticle(t.articleId, task.articleId) ||
            (task.entityId && t.entityId === task.entityId) ||
            sameArticle(t.articleId, decision?.articleId))
      );
      if (research) add(research, task, 'Fresh research required before update');
    }

    if (needsSourceReview) {
      const review = tasks.find(
        (t) =>
          t.type === 'REVIEW_SOURCE' &&
          (sameArticle(t.articleId, task.articleId) || t.entityId === decision?.entityId)
      );
      if (review) add(review, task, 'Source/conflict review before update');
    }

    // Explicit prerequisiteDecisionId from Decision Engine
    if (decision?.prerequisiteDecisionId) {
      const prereqTask = tasks.find((t) => t.decisionId === decision.prerequisiteDecisionId);
      if (prereqTask) add(prereqTask, task, 'Decision Engine prerequisite');
    }
  }

  // CREATE → REVIEW_CONTENT when create exists and review/content risk present
  for (const create of tasks.filter((t) => t.type === 'CREATE_ARTICLE')) {
    const review = tasks.find(
      (t) =>
        t.type === 'REVIEW_CONTENT' &&
        (t.entityId === create.entityId || sameArticle(t.articleId, create.articleId))
    );
    if (review) add(create, review, 'Human review after create recommendation');
  }

  // UPDATE → REVIEW_CONTENT when both exist for same article and update has high risk
  for (const update of tasks.filter((t) => t.type === 'UPDATE_ARTICLE')) {
    const decision = decisions.find((d) => d.id === update.decisionId);
    const highRisk =
      decision?.risk === 'HIGH' ||
      decision?.feasibilityStatus === 'REQUIRES_REVIEW' ||
      (decision?.signals || []).some((s) => s.type === 'HIGH_RISK_CLAIM');
    if (!highRisk) continue;
    const review = tasks.find(
      (t) => t.type === 'REVIEW_CONTENT' && sameArticle(t.articleId, update.articleId)
    );
    if (review) add(update, review, 'High-risk update requires content review');
  }

  void byLogical;
  return edges;
}

export function buildMissionPlan(
  siteId: string,
  mission: Mission,
  opts: { persistDecisions?: boolean } = {}
): MissionPlan {
  const now = new Date().toISOString();
  const engine = runDecisionEngine(siteId, {
    persist: opts.persistDecisions === true,
    topN: 15
  });
  const decisions = filterDecisionsByGoal(engine.decisions, mission.goal);

  // Materialize recommendations for executable decisions (RECOMMEND policy — no auto job).
  for (const d of decisions) {
    if (
      d.feasibilityStatus === 'BLOCKED' ||
      d.recommendedAction === 'DEFER' ||
      d.feasibilityStatus === 'INSUFFICIENT_DATA'
    ) {
      continue;
    }
    applyPolicyToDecision(siteId, d, 'RECOMMEND');
  }

  // Re-read decisions after materialize for recommendationId links
  const refreshed = runDecisionEngine(siteId, { persist: false, topN: 20 });
  const byId = new Map(refreshed.decisions.map((d) => [d.id, d]));
  const plannedDecisions = decisions.map((d) => byId.get(d.id) || d);

  const tasks: MissionTask[] = [];
  const seenLogical = new Set<string>();
  for (const d of plannedDecisions) {
    const task = decisionToTask(d, mission.id, now);
    if (!task) continue;
    if (seenLogical.has(task.logicalKey)) continue;
    seenLogical.add(task.logicalKey);
    if (d.recommendationId) task.recommendationId = d.recommendationId;
    tasks.push(task);
  }

  tasks.sort(compareTasksDeterministic);
  const edges = wireDependencies(tasks, plannedDecisions);
  const graph = { tasks, edges };
  const validation = validateTaskGraph(graph, siteId);
  if (!validation.ok) {
    throw new Error(`Invalid task graph: ${validation.errors.join('; ')}`);
  }

  // Stabilize ready status for roots without review
  const order = getExecutionOrder(graph);
  void order;
  for (const t of tasks) {
    if (t.status === 'WAITING_FOR_REVIEW') continue;
    if (t.dependsOn.length === 0 && t.blockers.length === 0) t.status = 'READY';
  }

  const effort =
    tasks.length === 0
      ? 0
      : Math.round((tasks.reduce((a, t) => a + (t.effort ?? 0.5), 0) / tasks.length) * 100) / 100;

  const plan: MissionPlan = {
    id: newPlanId(),
    missionId: mission.id,
    siteId,
    version: mission.planVersion + 1,
    generatedAt: now,
    decisionEngineVersion: engine.decisionEngineVersion || DECISION_ENGINE_VERSION,
    tasks,
    edges,
    expectedImpact: tasks[0]?.expectedImpact,
    estimatedEffort: effort,
    blockers: tasks.flatMap((t) => t.blockers).slice(0, 10),
    assumptions: [
      'Plan derived solely from Decision Engine output',
      'No fabricated SEO/traffic metrics',
      'Publishing remains outside mission execution',
      `Goal filter: ${mission.goal}`
    ]
  };

  return plan;
}

export function diffPlans(prev: MissionPlan | null, next: MissionPlan, reason: string): PlanDiff {
  const prevKeys = new Map((prev?.tasks || []).map((t) => [t.logicalKey, t]));
  const nextKeys = new Map(next.tasks.map((t) => [t.logicalKey, t]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];

  for (const [key, t] of nextKeys) {
    const old = prevKeys.get(key);
    if (!old) added.push(t.title);
    else if (old.plannedAction !== t.plannedAction || old.type !== t.type) changed.push(t.title);
    else unchanged.push(t.title);
  }
  for (const [key, t] of prevKeys) {
    if (!nextKeys.has(key) && t.status !== 'COMPLETED' && t.status !== 'SKIPPED') {
      removed.push(t.title);
    }
  }

  return {
    missionId: next.missionId,
    planVersionFrom: prev?.version || 0,
    planVersionTo: next.version,
    addedTasks: added,
    removedTasks: removed,
    changedTasks: changed,
    unchangedTasks: unchanged,
    reason,
    at: new Date().toISOString()
  };
}

/**
 * Re-plan: preserve completed/running work, invalidate stale pending, add new.
 */
export function replanMission(
  siteId: string,
  missionId: string,
  reason = 'Re-plan requested'
): { mission: Mission; plan: MissionPlan; diff: PlanDiff } {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  if (mission.status === 'CANCELLED') throw new Error('Mission cancelled');

  const prev = getActivePlan(siteId, mission);
  const fresh = buildMissionPlan(siteId, mission, { persistDecisions: true });

  // Preserve completed / running / waiting review tasks from previous plan
  const preserved: MissionTask[] = [];
  const preservedKeys = new Set<string>();
  if (prev) {
    for (const t of prev.tasks) {
      if (
        t.status === 'COMPLETED' ||
        t.status === 'RUNNING' ||
        t.status === 'WAITING_FOR_REVIEW' ||
        t.status === 'SKIPPED'
      ) {
        preserved.push({ ...t });
        preservedKeys.add(t.logicalKey);
      }
    }
  }

  const mergedTasks: MissionTask[] = [...preserved];
  for (const t of fresh.tasks) {
    if (preservedKeys.has(t.logicalKey)) continue;
    // If previous had same logical pending but action changed → mark old stale conceptually via removal
    mergedTasks.push(t);
  }

  // Rebuild edges on merged set using fresh decisions (incl. RUNNING — drop obsolete deps)
  for (const t of mergedTasks) {
    t.dependsOn = [];
    t.blocks = [];
  }
  const engine = runDecisionEngine(siteId, { persist: false, topN: 20 });
  const edges = wireDependencies(
    mergedTasks.filter((t) => !['COMPLETED', 'SKIPPED', 'CANCELLED', 'STALE', 'FAILED'].includes(t.status)),
    engine.decisions
  );

  // Keep edges that only reference existing task ids
  const ids = new Set(mergedTasks.map((t) => t.id));
  const safeEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  for (const t of mergedTasks) {
    t.dependsOn = t.dependsOn.filter((id) => ids.has(id));
    t.blocks = t.blocks.filter((id) => ids.has(id));
  }

  const plan: MissionPlan = {
    ...fresh,
    tasks: mergedTasks,
    edges: safeEdges,
    version: (prev?.version || mission.planVersion) + 1
  };

  const validation = validateTaskGraph(plan, siteId);
  if (!validation.ok) throw new Error(`Invalid replanned graph: ${validation.errors.join('; ')}`);

  const diff = diffPlans(prev || null, plan, reason);
  savePlan(siteId, plan);
  appendDiff(siteId, diff);

  const updated: Mission = {
    ...mission,
    status:
      mission.status === 'DRAFT' || mission.status === 'PLANNING'
        ? 'READY'
        : mission.status === 'COMPLETED'
          ? 'READY'
          : mission.status,
    planVersion: plan.version,
    activePlanId: plan.id,
    planId: plan.id,
    updatedAt: new Date().toISOString()
  };
  upsertMission(siteId, updated);
  emitDomainEvent({
    type: 'MISSION_REPLANNED',
    siteId,
    entityId: mission.id,
    metadata: { reason, planVersion: plan.version }
  });

  return { mission: updated, plan, diff };
}

export function planMission(siteId: string, missionId: string): {
  mission: Mission;
  plan: MissionPlan;
  diff: PlanDiff;
} {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');

  const previousStatus = mission.status;
  const planning: Mission = {
    ...mission,
    status: 'PLANNING',
    updatedAt: new Date().toISOString()
  };
  upsertMission(siteId, planning);

  try {
    return replanMission(siteId, missionId, 'Initial plan generation');
  } catch (err) {
    const current = getMission(siteId, missionId);
    if (current?.status === 'PLANNING') {
      upsertMission(siteId, {
        ...current,
        status: previousStatus,
        updatedAt: new Date().toISOString()
      });
    }
    throw err;
  }
}

export { taskLogicalKey };
