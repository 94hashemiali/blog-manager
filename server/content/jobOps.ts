import type { ContentProductionJob, JobOperationalStatus } from './types.js';
import { listJobs, saveJob } from './store.js';

const STALE_RUNNING_MS = 30 * 60 * 1000;

export function markJobRunning(job: ContentProductionJob): ContentProductionJob {
  if (job.cancelRequestedAt) {
    return saveJob({
      ...job,
      status: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return saveJob({
    ...job,
    status: 'RUNNING',
    startedAt: job.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function markJobFailed(job: ContentProductionJob, reason: string, retryable: boolean): ContentProductionJob {
  const retryCount = (job.retryCount || 0) + (retryable ? 1 : 0);
  const exhausted = retryable && retryCount > (job.maxRetries ?? 2);
  return saveJob({
    ...job,
    status: exhausted || !retryable ? 'FAILED' : 'PAUSED',
    retryCount,
    lastError: reason,
    failures: [
      { stage: job.stage, reason, retryable, at: new Date().toISOString() },
      ...job.failures
    ].slice(0, 20),
    updatedAt: new Date().toISOString()
  });
}

export function markJobCompleted(job: ContentProductionJob): ContentProductionJob {
  return saveJob({
    ...job,
    status: 'COMPLETED',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function requestCancelJob(job: ContentProductionJob): ContentProductionJob {
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return job;
  const now = new Date().toISOString();
  // Idle jobs cancel immediately; running jobs stop before the next stage.
  const immediate = job.status === 'QUEUED' || job.status === 'PAUSED' || job.status === 'FAILED';
  return saveJob({
    ...job,
    cancelRequestedAt: now,
    cancelledAt: immediate ? now : job.cancelledAt,
    status: immediate ? 'CANCELLED' : job.status,
    updatedAt: now
  });
}

export function assertJobNotCancelled(job: ContentProductionJob): void {
  if (job.cancelRequestedAt || job.status === 'CANCELLED') {
    throw new Error('این کار لغو شده است.');
  }
}

/** After server restart, RUNNING jobs older than threshold become INTERRUPTED. */
export function recoverStaleRunningJobs(siteId: string): ContentProductionJob[] {
  const now = Date.now();
  const recovered: ContentProductionJob[] = [];
  for (const job of listJobs(siteId)) {
    if (job.status !== 'RUNNING') continue;
    const anchor = new Date(job.updatedAt || job.startedAt || job.createdAt).getTime();
    if (!Number.isFinite(anchor) || now - anchor < STALE_RUNNING_MS) continue;
    recovered.push(
      saveJob({
        ...job,
        status: 'INTERRUPTED' as JobOperationalStatus,
        lastError: 'Server restart interrupted a running job',
        updatedAt: new Date().toISOString()
      })
    );
  }
  return recovered;
}

export function resumeInterruptedJob(job: ContentProductionJob): ContentProductionJob {
  if (job.status !== 'INTERRUPTED' && job.status !== 'RECOVERY_REQUIRED' && job.status !== 'PAUSED') {
    throw new Error('فقط کارهای متوقف‌شده قابل ازسرگیری هستند.');
  }
  return saveJob({
    ...job,
    status: 'QUEUED',
    lastError: undefined,
    cancelRequestedAt: undefined,
    cancelledAt: undefined,
    updatedAt: new Date().toISOString()
  });
}

/** After a successful mid-pipeline stage, park job as QUEUED (ready for next stage). */
export function markJobStageIdle(job: ContentProductionJob): ContentProductionJob {
  if (job.cancelRequestedAt) {
    return saveJob({
      ...job,
      status: 'CANCELLED',
      cancelledAt: job.cancelledAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  return saveJob({
    ...job,
    status: job.stage === 'published' ? 'COMPLETED' : 'QUEUED',
    completedAt: job.stage === 'published' ? new Date().toISOString() : job.completedAt,
    updatedAt: new Date().toISOString()
  });
}
