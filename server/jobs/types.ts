export const OPS_JOB_SCHEMA_VERSION = 1;

export type OpsJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'RECOVERY_REQUIRED';

export type OpsJobType =
  | 'CONTENT_PRODUCTION'
  | 'CONTENT_UPDATE'
  | 'RESEARCH'
  | 'PERFORMANCE_SYNC'
  | 'INTELLIGENCE_SYNC'
  | 'PUBLISH'
  | 'VISUAL_GENERATION';

export type JobPriority = 'HIGH' | 'NORMAL' | 'LOW';

export interface JobProgress {
  current: number;
  total: number;
  percentage: number;
  label: string;
}

export interface JobError {
  code: string;
  message: string;
  retryable: boolean;
  stage?: string;
  provider?: string;
}

export interface JobTimelineEntry {
  at: string;
  type: string;
  message: string;
  stage?: string;
}

export interface OpsJob {
  id: string;
  siteId: string;
  type: OpsJobType;
  status: OpsJobStatus;
  priority: JobPriority;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastHeartbeatAt?: string;
  nextRetryAt?: string;
  progress: JobProgress;
  currentStage?: string;
  stages: string[];
  retryCount: number;
  maxRetries: number;
  cancelRequestedAt?: string;
  cancelledAt?: string;
  pauseRequestedAt?: string;
  lastError?: JobError;
  /** Safe metadata only — never credentials. */
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  triggerReason?: string;
  triggerEventId?: string;
  timeline: JobTimelineEntry[];
  productionJobId?: string;
}

export interface OpsJobStore {
  schemaVersion: number;
  jobs: OpsJob[];
}

export type DomainEventType =
  | 'JOB_CREATED'
  | 'JOB_STARTED'
  | 'JOB_STAGE_STARTED'
  | 'JOB_STAGE_COMPLETED'
  | 'JOB_RETRYING'
  | 'JOB_FAILED'
  | 'JOB_CANCEL_REQUESTED'
  | 'JOB_CANCELLED'
  | 'JOB_COMPLETED'
  | 'JOB_PAUSED'
  | 'JOB_RESUMED'
  | 'JOB_INTERRUPTED'
  | 'ARTICLE_RESEARCHED'
  | 'ARTICLE_DRAFTED'
  | 'ARTICLE_APPROVED'
  | 'ARTICLE_PUBLISHED'
  | 'ARTICLE_UPDATED'
  | 'SOURCE_CHANGED'
  | 'PERFORMANCE_SYNCED'
  | 'CONTENT_INDEXED'
  | 'RESEARCH_BECAME_STALE'
  | 'CONTENT_IMPACT_RECORDED';

export interface DomainEvent {
  eventId: string;
  type: DomainEventType;
  siteId: string;
  entityId?: string;
  jobId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  siteId: string;
  enabled: boolean;
  trigger: DomainEventType;
  conditions?: Record<string, unknown>;
  action:
    | 'CREATE_UPDATE_JOB'
    | 'CREATE_RESEARCH_JOB'
    | 'CREATE_PERFORMANCE_SYNC'
    | 'CREATE_REVIEW_TASK'
    | 'RECORD_RECOMMENDATION';
  /** Never allow CREATE_PUBLISH_JOB in this phase. */
  label: string;
}

export interface OpsSchedule {
  id: string;
  siteId: string;
  type: 'PERFORMANCE_SYNC' | 'INTELLIGENCE_SYNC' | 'RESEARCH_REFRESH';
  enabled: boolean;
  interval: 'daily' | 'weekly';
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentImpactRecord {
  id: string;
  siteId: string;
  sourceUrl: string;
  affectedSessionIds: string[];
  affectedProductionJobIds: string[];
  affectedEntityIds: string[];
  detectedAt: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  note?: string;
}

export const PRIORITY_WEIGHT: Record<JobPriority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2
};

export const DEFAULT_STAGES: Record<OpsJobType, string[]> = {
  CONTENT_PRODUCTION: ['research', 'brief', 'draft', 'validation', 'fact_check', 'seo', 'review'],
  CONTENT_UPDATE: ['research', 'brief', 'draft', 'validation', 'fact_check', 'seo', 'review'],
  RESEARCH: ['plan', 'fetch_sources', 'extract', 'claims', 'quality'],
  PERFORMANCE_SYNC: ['load_index', 'compute_metrics', 'decay', 'opportunities'],
  INTELLIGENCE_SYNC: ['wordpress_fetch', 'normalize', 'fingerprint', 'clusters', 'gaps', 'opportunities'],
  PUBLISH: ['validate_gates', 'wordpress_write', 'verify', 'persist'],
  VISUAL_GENERATION: ['plan', 'generate', 'persist']
};

export function emptyProgress(label = 'Queued'): JobProgress {
  return { current: 0, total: 1, percentage: 0, label };
}

export function makeProgress(current: number, total: number, label: string): JobProgress {
  const safeTotal = Math.max(total, 1);
  const safeCurrent = Math.max(0, Math.min(current, safeTotal));
  return {
    current: safeCurrent,
    total: safeTotal,
    percentage: Math.round((safeCurrent / safeTotal) * 100),
    label
  };
}
