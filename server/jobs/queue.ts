import { PRIORITY_WEIGHT, type OpsJob } from './types.js';
import { listOpsJobs, loadOpsJobStore, saveOpsJobStoreRaw, appendTimeline } from './store.js';

function isRunnable(job: OpsJob, now: number): boolean {
  if (job.cancelRequestedAt) return false;
  if (job.status === 'QUEUED') {
    if (job.nextRetryAt) {
      const at = new Date(job.nextRetryAt).getTime();
      if (Number.isFinite(at) && at > now) return false;
    }
    return true;
  }
  // Scheduled retries — never auto-rerun PUBLISH
  if (job.status === 'PAUSED' && job.nextRetryAt && job.type !== 'PUBLISH') {
    const at = new Date(job.nextRetryAt).getTime();
    return Number.isFinite(at) && at <= now;
  }
  return false;
}

/** Pick next runnable job: priority then FIFO createdAt (read-only). */
export function pickNextQueuedJob(now = Date.now()): OpsJob | undefined {
  const candidates = listOpsJobs({
    status: ['QUEUED', 'PAUSED']
  }).filter((job) => isRunnable(job, now));

  candidates.sort((a, b) => {
    const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pw !== 0) return pw;
    return a.createdAt.localeCompare(b.createdAt);
  });

  return candidates[0];
}

/**
 * Atomically claim next job: QUEUED/PAUSED → RUNNING in one store write.
 * Prevents concurrent tick/wake double-execution.
 */
export function claimNextQueuedJob(now = Date.now()): OpsJob | undefined {
  const store = loadOpsJobStore();
  const candidates = store.jobs.filter((job) => isRunnable(job, now));
  candidates.sort((a, b) => {
    const pw = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (pw !== 0) return pw;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const next = candidates[0];
  if (!next) return undefined;

  const claimedAt = new Date().toISOString();
  let claimed = appendTimeline(next, { type: 'JOB_STARTED', message: 'Runner claimed job' });
  claimed = {
    ...claimed,
    status: 'RUNNING',
    startedAt: claimed.startedAt || claimedAt,
    lastHeartbeatAt: claimedAt,
    nextRetryAt: undefined,
    updatedAt: claimedAt
  };
  const idx = store.jobs.findIndex((row) => row.id === next.id);
  if (idx < 0) return undefined;
  if (store.jobs[idx].status !== next.status) return undefined;
  store.jobs[idx] = claimed;
  saveOpsJobStoreRaw(store);
  return claimed;
}

export function countActiveJobs(siteId?: string): { running: number; queued: number; failed: number } {
  const jobs = listOpsJobs(siteId ? { siteId } : {});
  return {
    running: jobs.filter((j) => j.status === 'RUNNING').length,
    queued: jobs.filter((j) => j.status === 'QUEUED' || (j.status === 'PAUSED' && j.nextRetryAt)).length,
    failed: jobs.filter((j) => j.status === 'FAILED' || j.status === 'INTERRUPTED').length
  };
}
