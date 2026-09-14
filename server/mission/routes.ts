import { Router } from 'express';
import { db } from '../db.js';
import { emitDomainEvent } from '../jobs/events.js';
import { captureMissionOutcome, evaluateMission } from './evaluator.js';
import {
  approveMissionTask,
  cancelMission,
  createMission,
  executeMissionTask,
  getNextExecutableTask,
  pauseMission,
  startMission,
  syncMissionTaskJobs
} from './executor.js';
import { getExecutionOrder } from './graph.js';
import { planMission, replanMission } from './planner.js';
import {
  getActivePlan,
  getLatestDiff,
  getMission,
  listMissions
} from './store.js';
import type { MissionGoal } from './types.js';
import { MISSION_GOALS } from './types.js';

export const missionRouter = Router();

function fail(res: any, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    error: { code, message, retryable: false },
    message
  });
}

missionRouter.post('/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const title = String(req.body?.title || '').trim();
  if (!title) return fail(res, 400, 'bad_request', 'title required');
  const goalRaw = String(req.body?.goal || 'CUSTOM');
  if (!MISSION_GOALS.includes(goalRaw as MissionGoal)) {
    return fail(res, 400, 'bad_request', `Invalid goal. Allowed: ${MISSION_GOALS.join(', ')}`);
  }
  const goal = goalRaw as MissionGoal;
  const mission = createMission(siteId, {
    title,
    description: String(req.body?.description || ''),
    goal,
    targetDate: req.body?.targetDate
  });
  res.json({ success: true, mission });
});

missionRouter.get('/:siteId', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  res.json({ success: true, missions: listMissions(siteId) });
});

missionRouter.get('/:siteId/:missionId', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const mission = getMission(siteId, missionId);
  if (!mission) return fail(res, 404, 'not_found', 'Mission not found');
  const plan = getActivePlan(siteId, mission);
  res.json({ success: true, mission, plan: plan || null });
});

missionRouter.post('/:siteId/:missionId/plan', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const out = planMission(siteId, missionId);
    emitDomainEvent({
      type: 'MISSION_PLANNED',
      siteId,
      entityId: missionId,
      metadata: { planVersion: out.plan.version }
    });
    res.json({ success: true, ...out });
  } catch (err: any) {
    return fail(res, 400, 'plan_failed', err?.message || 'Plan failed');
  }
});

missionRouter.get('/:siteId/:missionId/plan', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const mission = getMission(siteId, missionId);
  if (!mission) return fail(res, 404, 'not_found', 'Mission not found');
  const plan = getActivePlan(siteId, mission);
  if (!plan) return fail(res, 404, 'not_found', 'No plan');
  res.json({
    success: true,
    plan,
    order: getExecutionOrder(plan).map((t) => t.id)
  });
});

missionRouter.post('/:siteId/:missionId/start', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const out = startMission(siteId, missionId);
    res.json({ success: true, ...out });
  } catch (err: any) {
    return fail(res, 400, 'start_failed', err?.message || 'Start failed');
  }
});

missionRouter.post('/:siteId/:missionId/pause', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    res.json({ success: true, mission: pauseMission(siteId, missionId) });
  } catch (err: any) {
    return fail(res, 400, 'pause_failed', err?.message || 'Pause failed');
  }
});

missionRouter.post('/:siteId/:missionId/cancel', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    res.json({ success: true, mission: cancelMission(siteId, missionId) });
  } catch (err: any) {
    return fail(res, 400, 'cancel_failed', err?.message || 'Cancel failed');
  }
});

missionRouter.post('/:siteId/:missionId/replan', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const reason = String(req.body?.reason || 'Manual replan');
    const out = replanMission(siteId, missionId, reason);
    res.json({ success: true, ...out });
  } catch (err: any) {
    return fail(res, 400, 'replan_failed', err?.message || 'Replan failed');
  }
});

missionRouter.get('/:siteId/:missionId/tasks', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const mission = getMission(siteId, missionId);
  if (!mission) return fail(res, 404, 'not_found', 'Mission not found');
  syncMissionTaskJobs(siteId, missionId);
  const plan = getActivePlan(siteId, mission);
  res.json({
    success: true,
    tasks: plan?.tasks || [],
    edges: plan?.edges || [],
    order: plan ? getExecutionOrder(plan).map((t) => t.id) : []
  });
});

missionRouter.get('/:siteId/:missionId/next-task', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  syncMissionTaskJobs(siteId, missionId);
  res.json({ success: true, ...getNextExecutableTask(siteId, missionId) });
});

missionRouter.get('/:siteId/:missionId/evaluation', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const evaluation = evaluateMission(siteId, missionId);
    const outcome = captureMissionOutcome(siteId, missionId);
    res.json({ success: true, evaluation, outcome });
  } catch (err: any) {
    return fail(res, 400, 'eval_failed', err?.message || 'Evaluation failed');
  }
});

missionRouter.get('/:siteId/:missionId/diff', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  res.json({ success: true, diff: getLatestDiff(siteId, missionId) });
});

missionRouter.post('/:siteId/:missionId/tasks/:taskId/execute', (req, res) => {
  const { siteId, missionId, taskId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const out = executeMissionTask(siteId, missionId, taskId);
    res.json({ success: true, ...out });
  } catch (err: any) {
    return fail(res, 400, 'execute_failed', err?.message || 'Execute failed');
  }
});

missionRouter.post('/:siteId/:missionId/advance', (req, res) => {
  const { siteId, missionId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    syncMissionTaskJobs(siteId, missionId);
    const out = executeMissionTask(siteId, missionId);
    res.json({ success: true, ...out });
  } catch (err: any) {
    return fail(res, 400, 'advance_failed', err?.message || 'Advance failed');
  }
});

missionRouter.post('/:siteId/:missionId/tasks/:taskId/approve', (req, res) => {
  const { siteId, missionId, taskId } = req.params;
  if (!db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  try {
    const out = approveMissionTask(siteId, missionId, taskId);
    res.json({ success: true, ...out });
  } catch (err: any) {
    return fail(res, 400, 'approve_failed', err?.message || 'Approve failed');
  }
});
