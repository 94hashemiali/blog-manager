import { bootstrapJobHandlers } from './bootstrap.js';
import { startJobRunner, stopJobRunner, wakeJobRunner } from './runner.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { autoRequeueSafeInterrupted, recoverStaleOpsJobs } from './recovery.js';

export { jobsRouter, operationsRouter } from './routes.js';
export { enqueueJob } from './enqueue.js';
export { getOpsJob, listOpsJobs, saveOpsJob } from './store.js';
export {
  requestCancelOpsJob,
  resumeOpsJob,
  retryOpsJob,
  executeJob,
  getRunnerStats
} from './runner.js';
export { emitDomainEvent, listDomainEvents } from './events.js';
export { listSchedules, upsertSchedule, runDueSchedules } from './scheduler.js';
export {
  loadAutomation,
  updateAutomationSettings,
  listAutomationRecommendations
} from './automation.js';
export { listContentImpacts, recordSourceImpacts } from './impact.js';
export type { OpsJob, OpsJobType, OpsJobStatus, DomainEvent, AutomationRule } from './types.js';

/**
 * VISUAL_GENERATION boundary:
 * Existing server/visual/jobs.ts is an in-memory async job with its own poll API.
 * It is NOT migrated into ops-jobs persistence in this phase to avoid breaking
 * VisualAssetStudio. New callers should prefer enqueueJob(VISUAL_GENERATION) only
 * after a dedicated handler is registered.
 */

export function startOpsRuntime(): void {
  bootstrapJobHandlers();
  recoverStaleOpsJobs();
  autoRequeueSafeInterrupted();
  startJobRunner();
  startScheduler();
  wakeJobRunner();
}

export function stopOpsRuntime(): void {
  stopJobRunner();
  stopScheduler();
}
