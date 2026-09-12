import { Router } from 'express';
import { db } from '../db.js';
import { enqueueJob } from './enqueue.js';
import {
  getOpsJob,
  listOpsJobs
} from './store.js';
import {
  getRunnerStats,
  requestCancelOpsJob,
  requestPauseOpsJob,
  resumeOpsJob,
  retryOpsJob,
  wakeJobRunner
} from './runner.js';
import { listDomainEvents } from './events.js';
import { listSchedules, upsertSchedule } from './scheduler.js';
import {
  loadAutomation,
  listAutomationRecommendations,
  updateAutomationSettings,
  upsertAutomationRule
} from './automation.js';
import { listContentImpacts, recordSourceImpacts } from './impact.js';
import { buildHealthPayload } from '../providers/status.js';
import { countActiveJobs } from './queue.js';
import type { OpsJobType, JobPriority } from './types.js';
import { listRegisteredHandlers } from './registry.js';

export const jobsRouter = Router();
export const operationsRouter = Router();

function fail(res: any, status: number, code: string, message: string) {
  return res.status(status).json({
    success: false,
    error: { code, message, retryable: false },
    message
  });
}

function publicJob(job: ReturnType<typeof getOpsJob>) {
  if (!job) return null;
  return {
    id: job.id,
    siteId: job.siteId,
    type: job.type,
    status: job.status,
    priority: job.priority,
    progress: job.progress,
    currentStage: job.currentStage,
    stages: job.stages,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    lastError: job.lastError,
    productionJobId: job.productionJobId,
    triggerReason: job.triggerReason,
    triggerEventId: job.triggerEventId,
    timeline: job.timeline,
    result: job.result,
    payload: job.payload,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    nextRetryAt: job.nextRetryAt,
    cancelRequestedAt: job.cancelRequestedAt
  };
}

jobsRouter.get('/', (req, res) => {
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
  if (siteId && !db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const type = typeof req.query.type === 'string' ? (req.query.type as OpsJobType) : undefined;
  const status = typeof req.query.status === 'string' ? (req.query.status as any) : undefined;
  const jobs = listOpsJobs({ siteId, type, status }).map((job) => publicJob(job));
  res.json({ success: true, jobs, runner: getRunnerStats() });
});

jobsRouter.get('/:id', (req, res) => {
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
  const job = getOpsJob(req.params.id, siteId);
  if (!job) return fail(res, 404, 'job_not_found', 'کار یافت نشد.');
  res.json({ success: true, job: publicJob(job) });
});

jobsRouter.post('/', (req, res) => {
  const siteId = String(req.body?.siteId || '').trim();
  const type = String(req.body?.type || '').trim() as OpsJobType;
  if (!siteId || !db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  if (!listRegisteredHandlers().includes(type)) {
    return fail(res, 400, 'unsupported_job_type', `Unsupported or unregistered job type: ${type}`);
  }
  if (type === 'PUBLISH') {
    return fail(
      res,
      400,
      'publish_via_production_only',
      'PUBLISH must use /api/production/:siteId/jobs/:jobId/enqueue-publish'
    );
  }

  const { job, created } = enqueueJob({
    siteId,
    type,
    payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {},
    priority: req.body?.priority as JobPriority | undefined,
    idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
    productionJobId: req.body?.productionJobId ? String(req.body.productionJobId) : undefined,
    entityKey: req.body?.entityKey ? String(req.body.entityKey) : undefined,
    triggerReason: req.body?.triggerReason ? String(req.body.triggerReason) : 'api',
    maxRetries: Number.isFinite(Number(req.body?.maxRetries)) ? Number(req.body.maxRetries) : undefined,
    stages: Array.isArray(req.body?.stages) ? req.body.stages.map(String) : undefined
  });

  wakeJobRunner();
  res.status(created ? 201 : 200).json({
    success: true,
    created,
    jobId: job.id,
    status: job.status,
    job: publicJob(job)
  });
});

jobsRouter.post('/:id/cancel', (req, res) => {
  const siteId = String(req.body?.siteId || '').trim();
  if (!siteId) return fail(res, 400, 'site_required', 'siteId الزامی است.');
  const job = requestCancelOpsJob(req.params.id, siteId);
  if (!job) return fail(res, 404, 'job_not_found', 'کار یافت نشد.');
  res.json({ success: true, job: publicJob(job) });
});

jobsRouter.post('/:id/pause', (req, res) => {
  const siteId = String(req.body?.siteId || '').trim();
  if (!siteId) return fail(res, 400, 'site_required', 'siteId الزامی است.');
  const job = requestPauseOpsJob(req.params.id, siteId);
  if (!job) return fail(res, 404, 'job_not_found', 'کار یافت نشد.');
  res.json({ success: true, job: publicJob(job) });
});

jobsRouter.post('/:id/resume', (req, res) => {
  const siteId = String(req.body?.siteId || '').trim();
  if (!siteId) return fail(res, 400, 'site_required', 'siteId الزامی است.');
  try {
    const job = resumeOpsJob(req.params.id, siteId);
    if (!job) return fail(res, 404, 'job_not_found', 'کار یافت نشد.');
    res.json({ success: true, job: publicJob(job) });
  } catch (err: any) {
    return fail(res, 409, 'resume_blocked', err?.message || 'Resume blocked');
  }
});

jobsRouter.post('/:id/retry', (req, res) => {
  const siteId = String(req.body?.siteId || '').trim();
  if (!siteId) return fail(res, 400, 'site_required', 'siteId الزامی است.');
  try {
    const job = retryOpsJob(req.params.id, siteId);
    if (!job) return fail(res, 404, 'job_not_found', 'کار یافت نشد.');
    res.json({ success: true, job: publicJob(job) });
  } catch (err: any) {
    return fail(res, 409, 'retry_blocked', err?.message || 'Retry blocked');
  }
});

operationsRouter.get('/overview', (req, res) => {
  const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : undefined;
  if (siteId && !db.getSiteById(siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');

  const counts = countActiveJobs(siteId);
  const jobs = listOpsJobs(siteId ? { siteId } : {});
  const recentJobs = jobs.slice(0, 20).map((job) => publicJob(job));
  const events = siteId ? listDomainEvents(siteId, 30) : [];
  const schedules = listSchedules(siteId).filter((s) => s.enabled);
  const health = buildHealthPayload(siteId);
  const recommendations = siteId ? listAutomationRecommendations(siteId) : [];
  const impacts = siteId ? listContentImpacts(siteId).filter((r) => r.status === 'OPEN') : [];

  res.json({
    success: true,
    overview: {
      activeJobs: counts.running,
      queuedJobs: counts.queued,
      failedJobs: counts.failed,
      recentJobs,
      recentEvents: events,
      scheduledTasks: schedules,
      providerProblems: Object.entries(health.providers)
        .filter(([, v]) => (v as any).status === 'not_configured' || (v as any).status === 'error')
        .map(([id, v]) => ({ id, ...(v as object) })),
      recommendations,
      openImpacts: impacts,
      runner: getRunnerStats(),
      assessedAt: new Date().toISOString()
    }
  });
});

operationsRouter.get('/automation/:siteId', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const store = loadAutomation(req.params.siteId);
  res.json({
    success: true,
    settings: store.settings,
    rules: store.rules,
    recommendations: store.recommendations,
    schedules: listSchedules(req.params.siteId),
    actionLog: store.actionLog?.slice(0, 20) || [],
    processedCount: store.processedKeys?.length || 0
  });
});

operationsRouter.put('/automation/:siteId', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const settings = updateAutomationSettings(req.params.siteId, {
    monitoringEnabled: Boolean(req.body?.monitoringEnabled),
    automaticContentGeneration: false,
    automaticPublishing: false,
    ...(req.body?.policy
      ? {
          policy: ['MONITOR_ONLY', 'RECOMMEND', 'AUTO_RESEARCH', 'AUTO_UPDATE_DRAFT', 'APPROVAL_REQUIRED'].includes(
            req.body.policy
          )
            ? req.body.policy
            : 'RECOMMEND'
        }
      : {}),
    ...(typeof req.body?.maxActionsPerHour === 'number'
      ? { maxActionsPerHour: Math.max(1, Math.min(100, req.body.maxActionsPerHour)) }
      : {})
  });

  const intervals = ['disabled', 'daily', 'weekly'] as const;
  for (const [type, key] of [
    ['PERFORMANCE_SYNC', 'performanceSync'],
    ['INTELLIGENCE_SYNC', 'contentIntelligence'],
    ['RESEARCH_REFRESH', 'researchRefresh']
  ] as const) {
    const value = String(req.body?.[key] || 'disabled');
    if (!intervals.includes(value as any)) continue;
    upsertSchedule({
      id: `${req.params.siteId}-${type}`,
      siteId: req.params.siteId,
      type,
      enabled: value !== 'disabled' && Boolean(req.body?.monitoringEnabled),
      interval: value === 'weekly' ? 'weekly' : 'daily'
    });
  }

  res.json({
    success: true,
    settings: settings.settings,
    schedules: listSchedules(req.params.siteId),
    note: 'Automatic publishing remains OFF.'
  });
});

operationsRouter.post('/automation/:siteId/rules', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const rule = upsertAutomationRule({
    siteId: req.params.siteId,
    enabled: req.body?.enabled !== false,
    trigger: req.body?.trigger,
    action: req.body?.action,
    label: String(req.body?.label || 'Automation rule'),
    conditions: req.body?.conditions
  });
  res.status(201).json({ success: true, rule });
});

operationsRouter.get('/impacts/:siteId', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'site_not_found', 'سایت یافت نشد.');
  const refreshed = recordSourceImpacts(req.params.siteId);
  res.json({
    success: true,
    impacts: listContentImpacts(req.params.siteId),
    newlyRecorded: refreshed.length
  });
});
