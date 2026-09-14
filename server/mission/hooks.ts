/**
 * Mission lifecycle hooks — wire jobs/events → sync + deterministic replan.
 * No second queue. No LLM.
 */
import type { DomainEvent } from '../jobs/types.js';
import { getActivePlan, listMissions } from './store.js';
import { syncMissionTaskJobs } from './executor.js';
import { reevaluateMissionAfterTaskChange, softReplan } from './softReplan.js';
import type { Mission, MissionStatus } from './types.js';

const ACTIVE: MissionStatus[] = ['RUNNING', 'READY', 'WAITING_FOR_REVIEW'];

/** Job events sync precisely; other events soft-replan (ARTICLE_RESEARCHED left to JOB_COMPLETED). */
const STATE_CHANGE_EVENTS = new Set([
  'JOB_COMPLETED',
  'JOB_FAILED',
  'PERFORMANCE_SYNCED',
  'CONTENT_INDEXED',
  'CONTENT_IMPACT_RECORDED',
  'RESEARCH_BECAME_STALE'
]);

function isActive(m: Mission): boolean {
  return ACTIVE.includes(m.status);
}

/** Sync any mission task linked to this ops job; replan if task completed. */
export function syncMissionsForJob(siteId: string, jobId: string): void {
  for (const mission of listMissions(siteId)) {
    if (!isActive(mission) && mission.status !== 'PAUSED') continue;
    const plan = getActivePlan(siteId, mission);
    if (!plan?.tasks.some((t) => t.jobId === jobId)) continue;
    syncMissionTaskJobs(siteId, mission.id);
  }
}

export { softReplan, reevaluateMissionAfterTaskChange };

/**
 * Domain events that change site state → replan active missions.
 * JOB_* handled via syncMissionsForJob (more precise).
 */
export function applyMissionHooksForEvent(event: DomainEvent): void {
  if (!event.siteId || !STATE_CHANGE_EVENTS.has(event.type)) return;

  if (
    (event.type === 'JOB_COMPLETED' || event.type === 'JOB_FAILED') &&
    event.jobId
  ) {
    syncMissionsForJob(event.siteId, event.jobId);
    return;
  }

  for (const mission of listMissions(event.siteId)) {
    if (!isActive(mission)) continue;
    softReplan(event.siteId, mission.id, `Domain event ${event.type}`);
  }
}
