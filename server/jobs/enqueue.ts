import {
  DEFAULT_STAGES,
  emptyProgress,
  type JobPriority,
  type OpsJob,
  type OpsJobType
} from './types.js';
import {
  appendTimeline,
  defaultPriority,
  findActiveByIdempotency,
  findActiveDuplicate,
  findCompletedIdempotent,
  newOpsJobId,
  saveOpsJob
} from './store.js';
import { sanitizeJobPayload } from './errors.js';
import { emitDomainEvent } from './events.js';
import { wakeJobRunner } from './runner.js';

export interface EnqueueJobParams {
  siteId: string;
  type: OpsJobType;
  payload?: Record<string, unknown>;
  priority?: JobPriority;
  idempotencyKey?: string;
  productionJobId?: string;
  entityKey?: string;
  triggerReason?: string;
  triggerEventId?: string;
  maxRetries?: number;
  stages?: string[];
}

export function enqueueJob(params: EnqueueJobParams): { job: OpsJob; created: boolean } {
  if (params.idempotencyKey) {
    const existing = findActiveByIdempotency(params.siteId, params.idempotencyKey);
    if (existing) return { job: existing, created: false };
    const completed = findCompletedIdempotent(params.siteId, params.idempotencyKey, params.type);
    if (completed) return { job: completed, created: false };
  }

  const duplicate = findActiveDuplicate({
    siteId: params.siteId,
    type: params.type,
    productionJobId: params.productionJobId,
    entityKey: params.entityKey
  });
  if (duplicate) return { job: duplicate, created: false };

  const now = new Date().toISOString();
  const stages = params.stages || DEFAULT_STAGES[params.type] || [];
  let job: OpsJob = {
    id: newOpsJobId(),
    siteId: params.siteId,
    type: params.type,
    status: 'QUEUED',
    priority: params.priority || defaultPriority(params.type),
    createdAt: now,
    updatedAt: now,
    progress: emptyProgress('Queued'),
    stages,
    retryCount: 0,
    maxRetries: params.maxRetries ?? 2,
    payload: sanitizeJobPayload({
      ...(params.payload || {}),
      ...(params.entityKey ? { entityKey: params.entityKey } : {})
    }),
    idempotencyKey: params.idempotencyKey,
    triggerReason: params.triggerReason,
    triggerEventId: params.triggerEventId,
    timeline: [],
    productionJobId: params.productionJobId
  };

  job = appendTimeline(job, { type: 'JOB_CREATED', message: `${params.type} queued` });
  job = saveOpsJob(job);
  emitDomainEvent({
    type: 'JOB_CREATED',
    siteId: job.siteId,
    jobId: job.id,
    entityId: params.productionJobId,
    metadata: { type: job.type, triggerReason: job.triggerReason }
  });
  wakeJobRunner();
  return { job, created: true };
}
