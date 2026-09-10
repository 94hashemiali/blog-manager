import { listOpsJobs, saveOpsJob, appendTimeline } from './store.js';
import { emitDomainEvent } from './events.js';
import type { OpsJob } from './types.js';

const STALE_HEARTBEAT_MS = 2 * 60 * 1000;

/**
 * On startup (and periodically): RUNNING jobs without a recent heartbeat become INTERRUPTED.
 * Publish jobs become RECOVERY_REQUIRED — never auto-retry destructive ops.
 */
export function recoverStaleOpsJobs(now = Date.now(), skipIds?: Set<string>): OpsJob[] {
  const recovered: OpsJob[] = [];
  for (const job of listOpsJobs({ status: 'RUNNING' })) {
    if (skipIds?.has(job.id)) continue;
    const anchor = new Date(job.lastHeartbeatAt || job.updatedAt || job.startedAt || job.createdAt).getTime();
    if (Number.isFinite(anchor) && now - anchor < STALE_HEARTBEAT_MS) continue;

    const recoveryStatus = job.type === 'PUBLISH' ? 'RECOVERY_REQUIRED' : 'INTERRUPTED';
    let next = appendTimeline(job, {
      type: 'JOB_INTERRUPTED',
      message: 'Stale RUNNING job recovered after missing heartbeat / restart'
    });
    next = saveOpsJob({
      ...next,
      status: recoveryStatus,
      lastError: {
        code: 'interrupted',
        message: 'Job interrupted — server restart or stale heartbeat',
        retryable: job.type !== 'PUBLISH'
      }
    });
    emitDomainEvent({
      type: 'JOB_INTERRUPTED',
      siteId: next.siteId,
      jobId: next.id,
      metadata: { recoveryStatus }
    });
    recovered.push(next);
  }
  return recovered;
}

/** Safe auto-requeue for non-publish INTERRUPTED jobs. */
export function autoRequeueSafeInterrupted(): OpsJob[] {
  const moved: OpsJob[] = [];
  for (const job of listOpsJobs({ status: 'INTERRUPTED' })) {
    if (job.type === 'PUBLISH') continue;
    if (job.lastError && job.lastError.retryable === false) continue;
    let next = appendTimeline(job, { type: 'JOB_RESUMED', message: 'Auto-requeued after interrupt' });
    next = saveOpsJob({
      ...next,
      status: 'QUEUED',
      lastError: undefined,
      nextRetryAt: undefined
    });
    moved.push(next);
  }
  return moved;
}
