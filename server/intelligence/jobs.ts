import type { SyncProgress } from './types.js';

export type IntelligenceJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface IntelligenceJob {
  id: string;
  siteId: string;
  status: IntelligenceJobStatus;
  stage: string;
  detail?: string;
  done?: number;
  total?: number;
  createdAt: string;
  completedAt?: string;
  result?: {
    articleCount: number;
    articleTotalFromWp?: number;
    clusterCount: number;
    opportunityCount: number;
    woocommerceAvailable?: boolean;
  };
  error?: string;
}

const jobs = new Map<string, IntelligenceJob>();

export function createIntelligenceJob(siteId: string): IntelligenceJob {
  const job: IntelligenceJob = {
    id: `intel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    siteId,
    status: 'RUNNING',
    stage: 'connecting',
    createdAt: new Date().toISOString()
  };
  jobs.set(job.id, job);
  return job;
}

export function updateIntelligenceJob(id: string, patch: Partial<IntelligenceJob>): IntelligenceJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, patch);
  jobs.set(id, job);
  return job;
}

export function getIntelligenceJob(id: string): IntelligenceJob | undefined {
  return jobs.get(id);
}

export function applySyncProgress(jobId: string, progress: SyncProgress) {
  updateIntelligenceJob(jobId, {
    stage: progress.stage,
    detail: progress.detail,
    done: progress.done,
    total: progress.total
  });
}
