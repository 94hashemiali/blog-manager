import { collectAttention } from './attention.js';
import { buildContentHealthSummary } from './health.js';
import { listRecommendations, syncRecommendationsFromState } from './recommendations.js';
import { listOpsJobs } from '../jobs/store.js';
import { countActiveJobs } from '../jobs/queue.js';
import { listDomainEvents } from '../jobs/events.js';
import { listSchedules } from '../jobs/scheduler.js';
import { listContentImpacts } from '../jobs/impact.js';
import { buildHealthPayload } from '../providers/status.js';
import { loadPerformanceStore } from '../performance/store.js';
import { listResearchSessions } from '../research/store.js';
import { listJobs as listProductionJobs } from '../content/store.js';
import type { OperationsSnapshot } from './types.js';

function publicJob(job: ReturnType<typeof listOpsJobs>[number]) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    currentStage: job.currentStage,
    triggerReason: job.triggerReason,
    lastError: job.lastError,
    productionJobId: job.productionJobId,
    updatedAt: job.updatedAt,
    createdAt: job.createdAt
  };
}

/** Assemble operations snapshot from persisted stores. Optional materialize recommendations. */
export function buildOperationsSnapshot(
  siteId: string,
  opts: { materializeRecommendations?: boolean } = {}
): OperationsSnapshot {
  if (opts.materializeRecommendations !== false) {
    syncRecommendationsFromState(siteId);
  }

  const counts = countActiveJobs(siteId);
  const jobs = listOpsJobs({ siteId });
  const recoveryJobs = jobs.filter((j) => j.status === 'RECOVERY_REQUIRED').length;
  const content = buildContentHealthSummary(siteId);
  const perf = loadPerformanceStore(siteId);
  const sessions = listResearchSessions(siteId);
  const staleCount = sessions.filter((s) => s.status === 'STALE' || s.status === 'INVALIDATED').length;
  const conflictCount = sessions.filter((s) =>
    (s.conflicts || []).some((c) => c.resolutionStatus === 'UNRESOLVED')
  ).length;
  const providers = buildHealthPayload(siteId).providers as Record<
    string,
    { status: string; configured: boolean; detail: string }
  >;

  const perfStatus =
    perf.records.length === 0
      ? ('insufficient_data' as const)
      : content.status === 'critical'
        ? ('critical' as const)
        : content.status;

  const researchStatus =
    sessions.length === 0
      ? ('insufficient_data' as const)
      : conflictCount > 0
        ? ('needs_attention' as const)
        : staleCount > 0
          ? ('needs_attention' as const)
          : ('healthy' as const);

  const overall =
    content.status === 'critical' || recoveryJobs > 0
      ? ('critical' as const)
      : content.status === 'needs_attention' || counts.failed > 0 || researchStatus === 'needs_attention'
        ? ('needs_attention' as const)
        : content.status === 'insufficient_data' && perf.records.length === 0
          ? ('insufficient_data' as const)
          : ('healthy' as const);

  const attention = collectAttention(siteId).slice(0, 40);
  const reviewQueue = listProductionJobs(siteId)
    .filter((j) => j.stage === 'review' || j.stage === 'needs_revision' || j.stage === 'approved')
    .slice(0, 20)
    .map((j) => ({
      id: j.id,
      topic: j.topic,
      stage: j.stage,
      mode: j.mode,
      updatedAt: j.updatedAt
    }));

  return {
    siteId,
    generatedAt: new Date().toISOString(),
    health: {
      overall,
      content,
      performance: {
        status: perfStatus,
        reasons:
          perf.records.length === 0
            ? ['Performance store empty']
            : content.reasons.slice(0, 4),
        lastSyncedAt: perf.lastSyncedAt
      },
      research: {
        status: researchStatus,
        reasons: [
          sessions.length ? `${sessions.length} sessions` : 'No research sessions',
          staleCount ? `${staleCount} stale/invalidated` : 'No stale sessions',
          conflictCount ? `${conflictCount} with unresolved conflicts` : 'No unresolved conflicts'
        ],
        staleCount,
        conflictCount
      },
      providers
    },
    attention,
    activeJobs: counts.running,
    queuedJobs: counts.queued,
    failedJobs: counts.failed,
    recoveryJobs,
    recommendations: listRecommendations(siteId, ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS']).slice(0, 40),
    openImpacts: listContentImpacts(siteId)
      .filter((r) => r.status === 'OPEN')
      .map((r) => ({
        id: r.id,
        sourceUrl: r.sourceUrl,
        affectedProductionJobIds: r.affectedProductionJobIds,
        affectedSessionIds: r.affectedSessionIds,
        detectedAt: r.detectedAt,
        note: r.note
      })),
    schedules: listSchedules(siteId).map((s) => ({
      id: s.id,
      type: s.type,
      enabled: s.enabled,
      interval: s.interval,
      nextRunAt: s.nextRunAt
    })),
    recentEvents: listDomainEvents(siteId, 30).map((e) => ({
      eventId: e.eventId,
      type: e.type,
      timestamp: e.timestamp,
      entityId: e.entityId,
      jobId: e.jobId
    })),
    recentJobs: jobs.slice(0, 20).map(publicJob),
    reviewQueue
  };
}
