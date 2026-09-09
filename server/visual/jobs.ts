import type { GenerationStage, PipelineResult } from './types.js';

export interface VisualJob {
  id: string;
  siteId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  stage: GenerationStage;
  stageHistory: GenerationStage[];
  detail?: string;
  createdAt: string;
  completedAt?: string;
  result?: PipelineResult;
  error?: string;
}

const jobs = new Map<string, VisualJob>();

export function createVisualJob(siteId: string): VisualJob {
  const job: VisualJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    siteId,
    status: 'RUNNING',
    stage: 'understanding_article',
    stageHistory: [],
    createdAt: new Date().toISOString()
  };
  jobs.set(job.id, job);
  return job;
}

export function updateVisualJob(
  id: string,
  patch: Partial<Pick<VisualJob, 'stage' | 'detail' | 'status' | 'result' | 'error' | 'completedAt'>>
): VisualJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  if (patch.stage && job.stage !== patch.stage) {
    job.stageHistory.push(patch.stage);
  }
  Object.assign(job, patch);
  jobs.set(id, job);
  return job;
}

export function getVisualJob(id: string): VisualJob | undefined {
  return jobs.get(id);
}

export const GENERATION_STAGES: { id: GenerationStage; label: string }[] = [
  { id: 'understanding_article', label: 'درک مقاله' },
  { id: 'planning_visual_concept', label: 'طراحی کانسپت بصری' },
  { id: 'planning_composition', label: 'برنامه‌ریزی ترکیب‌بندی' },
  { id: 'generating_image', label: 'تولید تصویر' },
  { id: 'evaluating_image', label: 'ارزیابی کیفیت' },
  { id: 'checking_originality', label: 'بررسی اصالت' },
  { id: 'finalizing', label: 'نهایی‌سازی' }
];
