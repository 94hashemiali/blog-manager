import crypto from 'crypto';
import { db } from '../db.js';
import {
  OPS_JOB_SCHEMA_VERSION,
  emptyProgress,
  type OpsJob,
  type OpsJobStatus,
  type OpsJobStore,
  type OpsJobType,
  type JobPriority,
  type JobProgress,
  type JobTimelineEntry,
  DEFAULT_STAGES
} from './types.js';
import { sanitizeJobPayload } from './errors.js';

function emptyStore(): OpsJobStore {
  return { schemaVersion: OPS_JOB_SCHEMA_VERSION, jobs: [] };
}

function migrateJob(raw: any): OpsJob {
  return {
    ...raw,
    status: raw.status || 'QUEUED',
    priority: raw.priority || 'NORMAL',
    progress: raw.progress || emptyProgress(),
    stages: Array.isArray(raw.stages) ? raw.stages : DEFAULT_STAGES[raw.type as OpsJobType] || [],
    retryCount: Number.isFinite(raw.retryCount) ? raw.retryCount : 0,
    maxRetries: Number.isFinite(raw.maxRetries) ? raw.maxRetries : 2,
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    payload: sanitizeJobPayload(raw.payload || {}),
    result: raw.result && typeof raw.result === 'object' ? sanitizeJobPayload(raw.result) : undefined
  };
}

function persist(store: OpsJobStore): void {
  // Cap history so JSON stays manageable.
  const jobs = store.jobs
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 500);
  db.saveOpsJobStore({ schemaVersion: OPS_JOB_SCHEMA_VERSION, jobs });
}

/** Persist without re-sorting/capping dance used by claim (caller already holds store). */
export function saveOpsJobStoreRaw(store: OpsJobStore): void {
  persist(store);
}

export function loadOpsJobStore(): OpsJobStore {
  const raw = db.getOpsJobStore();
  if (!raw || typeof raw !== 'object') return emptyStore();
  return {
    schemaVersion: Number(raw.schemaVersion) || OPS_JOB_SCHEMA_VERSION,
    jobs: (Array.isArray(raw.jobs) ? raw.jobs : []).map(migrateJob)
  };
}

export function listOpsJobs(filters: {
  siteId?: string;
  type?: OpsJobType;
  status?: OpsJobStatus | OpsJobStatus[];
} = {}): OpsJob[] {
  let jobs = loadOpsJobStore().jobs;
  if (filters.siteId) jobs = jobs.filter((job) => job.siteId === filters.siteId);
  if (filters.type) jobs = jobs.filter((job) => job.type === filters.type);
  if (filters.status) {
    const set = new Set(Array.isArray(filters.status) ? filters.status : [filters.status]);
    jobs = jobs.filter((job) => set.has(job.status));
  }
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getOpsJob(jobId: string, siteId?: string): OpsJob | undefined {
  const job = loadOpsJobStore().jobs.find((row) => row.id === jobId);
  if (!job) return undefined;
  if (siteId && job.siteId !== siteId) return undefined;
  return job;
}

export function saveOpsJob(job: OpsJob): OpsJob {
  const store = loadOpsJobStore();
  const next = {
    ...job,
    payload: sanitizeJobPayload(job.payload),
    result: job.result ? sanitizeJobPayload(job.result) : undefined,
    updatedAt: new Date().toISOString()
  };
  const index = store.jobs.findIndex((row) => row.id === job.id);
  if (index >= 0) store.jobs[index] = next;
  else store.jobs.unshift(next);
  persist(store);
  return next;
}

export function newOpsJobId(): string {
  return `ops-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

export function appendTimeline(job: OpsJob, entry: Omit<JobTimelineEntry, 'at'> & { at?: string }): OpsJob {
  const row: JobTimelineEntry = {
    at: entry.at || new Date().toISOString(),
    type: entry.type,
    message: entry.message,
    stage: entry.stage
  };
  return {
    ...job,
    timeline: [...job.timeline, row].slice(-80)
  };
}

export function updateProgress(job: OpsJob, progress: JobProgress, stage?: string): OpsJob {
  return saveOpsJob({
    ...job,
    progress,
    currentStage: stage || job.currentStage,
    lastHeartbeatAt: new Date().toISOString()
  });
}

export function findActiveByIdempotency(siteId: string, idempotencyKey: string): OpsJob | undefined {
  return listOpsJobs({ siteId }).find(
    (job) =>
      job.idempotencyKey === idempotencyKey &&
      (job.status === 'QUEUED' || job.status === 'RUNNING' || job.status === 'PAUSED')
  );
}

/** Completed publish with same key must not be re-enqueued (prevents double WP write). */
export function findCompletedIdempotent(
  siteId: string,
  idempotencyKey: string,
  type: OpsJobType
): OpsJob | undefined {
  if (type !== 'PUBLISH') return undefined;
  return listOpsJobs({ siteId, type: 'PUBLISH' }).find(
    (job) => job.idempotencyKey === idempotencyKey && job.status === 'COMPLETED'
  );
}

export function findActiveDuplicate(params: {
  siteId: string;
  type: OpsJobType;
  productionJobId?: string;
  entityKey?: string;
}): OpsJob | undefined {
  return listOpsJobs({ siteId: params.siteId, type: params.type }).find((job) => {
    if (!['QUEUED', 'RUNNING', 'PAUSED'].includes(job.status)) return false;
    if (params.productionJobId && job.productionJobId === params.productionJobId) return true;
    if (params.entityKey && job.payload?.entityKey === params.entityKey) return true;
    if (
      (params.type === 'PERFORMANCE_SYNC' || params.type === 'INTELLIGENCE_SYNC') &&
      !params.entityKey
    ) {
      return true;
    }
    return false;
  });
}

export function defaultPriority(type: OpsJobType): JobPriority {
  if (type === 'PUBLISH' || type === 'CONTENT_UPDATE') return 'HIGH';
  if (type === 'PERFORMANCE_SYNC' || type === 'INTELLIGENCE_SYNC') return 'LOW';
  return 'NORMAL';
}
