import crypto from 'crypto';
import { db } from '../db.js';
import {
  MISSION_SCHEMA_VERSION,
  type Mission,
  type MissionOutcome,
  type MissionPlan,
  type MissionStore,
  type PlanDiff
} from './types.js';

function empty(siteId: string): MissionStore {
  return {
    schemaVersion: MISSION_SCHEMA_VERSION,
    siteId,
    missions: [],
    plans: [],
    diffs: [],
    outcomes: [],
    measurements: []
  };
}

export function loadMissionStore(siteId: string): MissionStore {
  const raw = db.getMissionStore(siteId);
  if (!raw || typeof raw !== 'object') return empty(siteId);
  return {
    schemaVersion: Number(raw.schemaVersion) || MISSION_SCHEMA_VERSION,
    siteId,
    missions: (Array.isArray(raw.missions) ? raw.missions : []).filter(
      (m: Mission) => m.siteId === siteId
    ),
    plans: (Array.isArray(raw.plans) ? raw.plans : []).filter((p: MissionPlan) => p.siteId === siteId),
    diffs: Array.isArray(raw.diffs) ? raw.diffs.slice(0, 50) : [],
    outcomes: (Array.isArray(raw.outcomes) ? raw.outcomes : [])
      .filter((o: any) => !o.siteId || o.siteId === siteId)
      .slice(0, 50),
    measurements: (Array.isArray(raw.measurements) ? raw.measurements : []).filter(
      (m: any) => m.siteId === siteId
    )
  };
}

export function saveMissionStore(siteId: string, store: MissionStore): MissionStore {
  const next: MissionStore = {
    ...store,
    siteId,
    schemaVersion: MISSION_SCHEMA_VERSION,
    missions: store.missions.filter((m) => m.siteId === siteId).slice(0, 40),
    plans: store.plans.filter((p) => p.siteId === siteId).slice(0, 80),
    diffs: store.diffs.slice(0, 50),
    outcomes: (store.outcomes || []).filter((o) => !o.siteId || o.siteId === siteId).slice(0, 50),
    measurements: (store.measurements || []).filter((m) => m.siteId === siteId).slice(0, 80)
  };
  db.saveMissionStore(siteId, next);
  return next;
}

export function newMissionId(): string {
  return `msn-${crypto.randomBytes(5).toString('hex')}`;
}

export function newPlanId(): string {
  return `mpl-${crypto.randomBytes(5).toString('hex')}`;
}

export function newTaskId(): string {
  return `mtk-${crypto.randomBytes(5).toString('hex')}`;
}

export function getMission(siteId: string, missionId: string): Mission | undefined {
  return loadMissionStore(siteId).missions.find((m) => m.id === missionId && m.siteId === siteId);
}

export function listMissions(siteId: string): Mission[] {
  return loadMissionStore(siteId).missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertMission(siteId: string, mission: Mission): Mission {
  if (mission.siteId !== siteId) throw new Error('Site mismatch');
  const store = loadMissionStore(siteId);
  const idx = store.missions.findIndex((m) => m.id === mission.id);
  if (idx >= 0) store.missions[idx] = mission;
  else store.missions.unshift(mission);
  saveMissionStore(siteId, store);
  return mission;
}

export function getPlan(siteId: string, planId: string): MissionPlan | undefined {
  return loadMissionStore(siteId).plans.find((p) => p.id === planId && p.siteId === siteId);
}

export function getActivePlan(siteId: string, mission: Mission): MissionPlan | undefined {
  if (mission.activePlanId) {
    const plan = getPlan(siteId, mission.activePlanId);
    if (plan) return plan;
  }
  return loadMissionStore(siteId)
    .plans.filter((p) => p.missionId === mission.id)
    .sort((a, b) => b.version - a.version)[0];
}

export function savePlan(siteId: string, plan: MissionPlan): MissionPlan {
  if (plan.siteId !== siteId) throw new Error('Site mismatch');
  const store = loadMissionStore(siteId);
  const idx = store.plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) store.plans[idx] = plan;
  else store.plans.unshift(plan);
  saveMissionStore(siteId, store);
  return plan;
}

export function appendDiff(siteId: string, diff: PlanDiff): void {
  const store = loadMissionStore(siteId);
  store.diffs.unshift(diff);
  saveMissionStore(siteId, store);
}

export function listDiffs(siteId: string, missionId: string): PlanDiff[] {
  return loadMissionStore(siteId).diffs.filter((d) => d.missionId === missionId);
}

export function getLatestDiff(siteId: string, missionId: string): PlanDiff | null {
  const diffs = listDiffs(siteId, missionId);
  if (!diffs.length) return null;
  const plans = loadMissionStore(siteId).plans.filter((p) => p.missionId === missionId);
  const latest = plans.length ? Math.max(...plans.map((p) => p.version)) : 0;
  return diffs.find((d) => d.planVersionTo === latest) || diffs[0] || null;
}

export function saveOutcome(siteId: string, outcome: MissionOutcome): void {
  const store = loadMissionStore(siteId);
  const idx = store.outcomes.findIndex((o) => o.missionId === outcome.missionId);
  if (idx >= 0) store.outcomes[idx] = outcome;
  else store.outcomes.unshift(outcome);
  saveMissionStore(siteId, store);
}

export function getOutcome(siteId: string, missionId: string): MissionOutcome | undefined {
  return loadMissionStore(siteId).outcomes.find((o) => o.missionId === missionId);
}
