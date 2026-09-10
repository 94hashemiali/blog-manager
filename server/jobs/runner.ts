import { getJobHandler } from './registry.js';
import { claimNextQueuedJob } from './queue.js';
import {
  appendTimeline,
  getOpsJob,
  listOpsJobs,
  saveOpsJob,
  updateProgress
} from './store.js';
import { emitDomainEvent } from './events.js';
import { toJobError } from './errors.js';
import { makeProgress, type OpsJob } from './types.js';
import { recoverStaleOpsJobs } from './recovery.js';

const TICK_MS = 750;
const MAX_CONCURRENCY = 1;

let timer: NodeJS.Timeout | null = null;
let activeCount = 0;
let started = false;
/** Jobs currently executing in this process — never mark INTERRUPTED. */
const heldJobIds = new Set<string>();

function backoffMs(retryCount: number): number {
  return Math.min(60_000, 1000 * Math.pow(2, Math.max(0, retryCount - 1)));
}

export function startJobRunner(): void {
  if (started) return;
  started = true;
  recoverStaleOpsJobs(Date.now(), heldJobIds);
  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  timer.unref?.();
  void tick();
}

export function stopJobRunner(): void {
  started = false;
  if (timer) clearInterval(timer);
  timer = null;
}

export function wakeJobRunner(): void {
  if (!started) return;
  void tick();
}

async function tick(): Promise<void> {
  if (activeCount >= MAX_CONCURRENCY) return;
  if (activeCount === 0) {
    recoverStaleOpsJobs(Date.now(), heldJobIds);
  }
  const claimed = claimNextQueuedJob();
  if (!claimed) return;
  activeCount += 1;
  heldJobIds.add(claimed.id);
  try {
    await executeJob(claimed.id, { alreadyClaimed: true });
  } finally {
    heldJobIds.delete(claimed.id);
    activeCount -= 1;
  }
}

export async function executeJob(
  jobId: string,
  opts: { alreadyClaimed?: boolean } = {}
): Promise<OpsJob | undefined> {
  let job = getOpsJob(jobId);
  if (!job) return undefined;
  if (job.cancelRequestedAt) {
    return finalizeCancelled(job);
  }

  const handler = getJobHandler(job.type);
  if (!handler) {
    return saveOpsJob({
      ...appendTimeline(job, { type: 'JOB_FAILED', message: `No handler for ${job.type}` }),
      status: 'FAILED',
      lastError: { code: 'no_handler', message: `No handler registered for ${job.type}`, retryable: false },
      completedAt: new Date().toISOString()
    });
  }

  if (!opts.alreadyClaimed) {
    heldJobIds.add(jobId);
    job = saveOpsJob({
      ...appendTimeline(job, { type: 'JOB_STARTED', message: 'Runner started job' }),
      status: 'RUNNING',
      startedAt: job.startedAt || new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      nextRetryAt: undefined,
      progress: makeProgress(0, job.stages.length || 1, 'Starting')
    });
  } else {
    job = saveOpsJob({
      ...job,
      progress: makeProgress(0, job.stages.length || 1, 'Starting'),
      lastHeartbeatAt: new Date().toISOString()
    });
  }
  emitDomainEvent({ type: 'JOB_STARTED', siteId: job.siteId, jobId: job.id });

  const refresh = () => {
    const latest = getOpsJob(jobId);
    if (!latest) throw new Error('Job disappeared');
    return latest;
  };

  try {
    const result = await handler({
      job,
      updateProgress: async (progress, stage) => {
        const latest = refresh();
        return updateProgress(latest, progress, stage);
      },
      heartbeat: async () => {
        const latest = refresh();
        return saveOpsJob({ ...latest, lastHeartbeatAt: new Date().toISOString() });
      },
      assertNotCancelled: () => {
        const latest = refresh();
        if (latest.cancelRequestedAt || latest.status === 'CANCELLED') {
          throw Object.assign(new Error('این کار لغو شده است.'), {
            code: 'cancelled',
            retryable: false
          });
        }
      },
      assertNotPaused: () => {
        const latest = refresh();
        if (latest.pauseRequestedAt) {
          throw Object.assign(new Error('pause_requested'), {
            code: 'pause_requested',
            retryable: false
          });
        }
      },
      emitStage: async (stage, message, done) => {
        let latest = refresh();
        latest = appendTimeline(latest, {
          type: done ? 'JOB_STAGE_COMPLETED' : 'JOB_STAGE_STARTED',
          message,
          stage
        });
        latest = saveOpsJob({ ...latest, currentStage: stage, lastHeartbeatAt: new Date().toISOString() });
        emitDomainEvent({
          type: done ? 'JOB_STAGE_COMPLETED' : 'JOB_STAGE_STARTED',
          siteId: latest.siteId,
          jobId: latest.id,
          metadata: { stage, message }
        });
      }
    });

    let latest = refresh();
    if (latest.cancelRequestedAt) return finalizeCancelled(latest);
    if (latest.pauseRequestedAt) {
      latest = saveOpsJob({
        ...appendTimeline(latest, { type: 'JOB_PAUSED', message: 'Paused at stage boundary' }),
        status: 'PAUSED',
        pauseRequestedAt: undefined
      });
      emitDomainEvent({ type: 'JOB_PAUSED', siteId: latest.siteId, jobId: latest.id });
      return latest;
    }

    latest = saveOpsJob({
      ...appendTimeline(latest, { type: 'JOB_COMPLETED', message: 'Job completed' }),
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      progress: makeProgress(latest.stages.length || 1, latest.stages.length || 1, 'Completed'),
      result: result || latest.result,
      lastError: undefined
    });
    emitDomainEvent({ type: 'JOB_COMPLETED', siteId: latest.siteId, jobId: latest.id });
    return latest;
  } catch (err: any) {
    let latest = refresh();
    if (err?.code === 'pause_requested' || err?.message === 'pause_requested') {
      latest = saveOpsJob({
        ...appendTimeline(latest, { type: 'JOB_PAUSED', message: 'Paused at stage boundary' }),
        status: 'PAUSED',
        pauseRequestedAt: undefined
      });
      emitDomainEvent({ type: 'JOB_PAUSED', siteId: latest.siteId, jobId: latest.id });
      return latest;
    }
    if (latest.cancelRequestedAt || err?.code === 'cancelled' || /لغو/.test(String(err?.message || ''))) {
      return finalizeCancelled(latest);
    }

    const jobError = toJobError(err);
    const retryCount = latest.retryCount + (jobError.retryable ? 1 : 0);
    // Never auto-retry PUBLISH — risk of double WordPress write.
    const canRetry =
      latest.type !== 'PUBLISH' && jobError.retryable && retryCount <= latest.maxRetries;

    if (canRetry) {
      const delay = backoffMs(retryCount);
      const nextRetryAt = new Date(Date.now() + delay).toISOString();
      latest = saveOpsJob({
        ...appendTimeline(latest, {
          type: 'JOB_RETRYING',
          message: `Retry ${retryCount}/${latest.maxRetries} in ${delay}ms: ${jobError.message}`
        }),
        status: 'PAUSED',
        retryCount,
        nextRetryAt,
        lastError: jobError
      });
      emitDomainEvent({
        type: 'JOB_RETRYING',
        siteId: latest.siteId,
        jobId: latest.id,
        metadata: { retryCount, nextRetryAt }
      });
      return latest;
    }

    const failStatus = latest.type === 'PUBLISH' && jobError.retryable ? 'RECOVERY_REQUIRED' : 'FAILED';
    latest = saveOpsJob({
      ...appendTimeline(latest, { type: 'JOB_FAILED', message: jobError.message }),
      status: failStatus,
      retryCount,
      completedAt: new Date().toISOString(),
      lastError: jobError,
      nextRetryAt: undefined
    });
    emitDomainEvent({
      type: 'JOB_FAILED',
      siteId: latest.siteId,
      jobId: latest.id,
      metadata: { code: jobError.code, status: failStatus }
    });
    return latest;
  } finally {
    if (!opts.alreadyClaimed) heldJobIds.delete(jobId);
  }
}

function finalizeCancelled(job: OpsJob): OpsJob {
  const next = saveOpsJob({
    ...appendTimeline(job, { type: 'JOB_CANCELLED', message: 'Job cancelled' }),
    status: 'CANCELLED',
    cancelledAt: job.cancelledAt || new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
  emitDomainEvent({ type: 'JOB_CANCELLED', siteId: next.siteId, jobId: next.id });
  return next;
}

export function requestCancelOpsJob(jobId: string, siteId?: string): OpsJob | undefined {
  const job = getOpsJob(jobId, siteId);
  if (!job) return undefined;
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED') return job;
  const now = new Date().toISOString();
  const immediate =
    job.status === 'QUEUED' || job.status === 'PAUSED' || job.status === 'FAILED' || job.status === 'INTERRUPTED';
  const next = saveOpsJob({
    ...appendTimeline(job, { type: 'JOB_CANCEL_REQUESTED', message: 'Cancel requested' }),
    cancelRequestedAt: now,
    cancelledAt: immediate ? now : job.cancelledAt,
    status: immediate ? 'CANCELLED' : job.status
  });
  emitDomainEvent({ type: 'JOB_CANCEL_REQUESTED', siteId: next.siteId, jobId: next.id });
  return next;
}

export function requestPauseOpsJob(jobId: string, siteId?: string): OpsJob | undefined {
  const job = getOpsJob(jobId, siteId);
  if (!job) return undefined;
  if (job.status !== 'RUNNING' && job.status !== 'QUEUED') return job;
  if (job.status === 'QUEUED') {
    return saveOpsJob({
      ...appendTimeline(job, { type: 'JOB_PAUSED', message: 'Paused before start' }),
      status: 'PAUSED'
    });
  }
  return saveOpsJob({
    ...job,
    pauseRequestedAt: new Date().toISOString()
  });
}

export function resumeOpsJob(jobId: string, siteId?: string): OpsJob | undefined {
  const job = getOpsJob(jobId, siteId);
  if (!job) return undefined;
  if (!['PAUSED', 'INTERRUPTED', 'FAILED', 'RECOVERY_REQUIRED'].includes(job.status)) {
    throw new Error('فقط کارهای متوقف‌شده قابل ازسرگیری هستند.');
  }
  if (job.type === 'PUBLISH' && job.status === 'RECOVERY_REQUIRED') {
    throw new Error('Publish recovery requires explicit human retry after verification.');
  }
  const next = saveOpsJob({
    ...appendTimeline(job, { type: 'JOB_RESUMED', message: 'Resumed to queue' }),
    status: 'QUEUED',
    cancelRequestedAt: undefined,
    cancelledAt: undefined,
    pauseRequestedAt: undefined,
    nextRetryAt: undefined,
    lastError: job.status === 'FAILED' ? job.lastError : undefined
  });
  emitDomainEvent({ type: 'JOB_RESUMED', siteId: next.siteId, jobId: next.id });
  wakeJobRunner();
  return next;
}

export function retryOpsJob(jobId: string, siteId?: string): OpsJob | undefined {
  const job = getOpsJob(jobId, siteId);
  if (!job) return undefined;
  if (!['FAILED', 'CANCELLED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(job.status)) {
    throw new Error('فقط کارهای ناموفق قابل تلاش مجدد هستند.');
  }
  const next = saveOpsJob({
    ...appendTimeline(job, { type: 'JOB_RETRYING', message: 'Manual retry requested' }),
    status: 'QUEUED',
    cancelRequestedAt: undefined,
    cancelledAt: undefined,
    pauseRequestedAt: undefined,
    nextRetryAt: undefined,
    completedAt: undefined
  });
  wakeJobRunner();
  return next;
}

export function getRunnerStats() {
  const jobs = listOpsJobs();
  return {
    started,
    activeCount,
    maxConcurrency: MAX_CONCURRENCY,
    held: heldJobIds.size,
    totals: {
      all: jobs.length,
      running: jobs.filter((j) => j.status === 'RUNNING').length,
      queued: jobs.filter((j) => j.status === 'QUEUED').length,
      failed: jobs.filter((j) => j.status === 'FAILED').length
    }
  };
}
