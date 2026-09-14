/**
 * Soft replan without importing executor — avoids circular deps with job sync.
 */
import { replanMission } from './planner.js';
import { getActivePlan, getMission } from './store.js';
import type { MissionStatus } from './types.js';

const ACTIVE: MissionStatus[] = ['RUNNING', 'READY', 'WAITING_FOR_REVIEW'];
const COOLDOWN_MS = 20_000;
const lastSoftReplanAt = new Map<string, number>();

export function softReplan(
  siteId: string,
  missionId: string,
  reason: string,
  opts?: { force?: boolean }
): boolean {
  const mission = getMission(siteId, missionId);
  if (!mission || !ACTIVE.includes(mission.status)) return false;
  const plan = getActivePlan(siteId, mission);
  if (!plan) return false;
  const pendingLeft = plan.tasks.some((t) =>
    ['PENDING', 'READY', 'WAITING_FOR_REVIEW', 'BLOCKED', 'STALE'].includes(t.status)
  );
  if (!pendingLeft) return false;

  const key = `${siteId}:${missionId}`;
  const now = Date.now();
  if (!opts?.force && (lastSoftReplanAt.get(key) || 0) + COOLDOWN_MS > now) {
    return false;
  }

  try {
    const { diff } = replanMission(siteId, missionId, reason);
    lastSoftReplanAt.set(key, now);
    const meaningful =
      diff.addedTasks.length > 0 ||
      diff.removedTasks.length > 0 ||
      diff.changedTasks.length > 0;
    // Version always bumps; empty-ish diffs still ok for score/id refresh.
    // Cooldown prevents thrash on empty domain noise.
    void meaningful;
    return true;
  } catch (err) {
    console.warn('mission soft replan failed', siteId, missionId, err);
    return false;
  }
}

export function reevaluateMissionAfterTaskChange(
  siteId: string,
  missionId: string,
  reason: string
): void {
  softReplan(siteId, missionId, reason, { force: true });
}
