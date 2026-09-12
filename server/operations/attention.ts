import { listOpsJobs } from '../jobs/store.js';
import { listContentImpacts } from '../jobs/impact.js';
import { listJobs as listProductionJobs } from '../content/store.js';
import { loadPerformanceStore } from '../performance/store.js';
import { listResearchSessions } from '../research/store.js';
import { buildHealthPayload } from '../providers/status.js';
import { listSchedules } from '../jobs/scheduler.js';
import type { AttentionAction, AttentionItem, AttentionSeverity } from './types.js';
import { assessClaimRisk, isAttentionWorthyClaimRisk } from './claimRisk.js';

const SEVERITY_SCORE: Record<AttentionSeverity, number> = {
  CRITICAL: 100,
  HIGH: 80,
  MEDIUM: 50,
  LOW: 25,
  INFO: 10
};

function item(params: Omit<AttentionItem, 'status' | 'priorityScore' | 'reasons'> & { reasons?: string[] }): AttentionItem {
  return {
    ...params,
    status: 'OPEN',
    reasons: params.reasons || [params.description],
    priorityScore: SEVERITY_SCORE[params.severity]
  };
}

/** Deterministic attention aggregation from persisted stores only. */
export function collectAttention(siteId: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const now = new Date().toISOString();

  const opsJobs = listOpsJobs({ siteId });
  for (const job of opsJobs) {
    if (job.status === 'RECOVERY_REQUIRED') {
      items.push(
        item({
          id: `att-recovery-${job.id}`,
          siteId,
          type: 'JOB_RECOVERY_REQUIRED',
          severity: 'CRITICAL',
          title: 'Job requires recovery',
          description: `${job.type} interrupted during a sensitive operation.`,
          jobId: job.id,
          entityId: job.productionJobId || job.id,
          createdAt: job.updatedAt || now,
          action: 'RETRY',
          reasons: [job.lastError?.message || 'RECOVERY_REQUIRED']
        })
      );
    } else if (job.status === 'FAILED' || job.status === 'INTERRUPTED') {
      items.push(
        item({
          id: `att-job-${job.id}`,
          siteId,
          type: 'JOB_FAILED',
          severity: 'HIGH',
          title: `${job.type} failed`,
          description: job.lastError?.message || `Job ${job.id} is ${job.status}`,
          jobId: job.id,
          entityId: job.productionJobId || job.id,
          createdAt: job.updatedAt || now,
          action: 'RETRY',
          reasons: [job.status, job.lastError?.code || 'failed'].filter(Boolean)
        })
      );
    }
  }

  const production = listProductionJobs(siteId);
  for (const job of production.filter((j) => j.stage === 'review' || j.stage === 'needs_revision')) {
    items.push(
      item({
        id: `att-review-${job.id}`,
        siteId,
        type: 'REVIEW_REQUIRED',
        severity: 'HIGH',
        title: 'Content needs review',
        description: `${job.topic} is in ${job.stage}`,
        entityId: job.contentEntityId || job.id,
        articleId: job.wordpressPostId || job.sourceArticleId,
        createdAt: job.updatedAt,
        action: 'REVIEW',
        reasons: [`stage=${job.stage}`]
      })
    );
  }

  for (const job of production) {
    const checklist = job.publishingChecklist;
    if (checklist && !checklist.canPublish && (job.stage === 'review' || job.stage === 'approved')) {
      items.push(
        item({
          id: `att-pubblock-${job.id}`,
          siteId,
          type: 'PUBLISHING_BLOCKER',
          severity: 'CRITICAL',
          title: 'Publishing blocked',
          description: checklist.blocking.map((b) => b.detail).join(' | ') || 'Checklist blockers present',
          entityId: job.id,
          createdAt: checklist.checkedAt || job.updatedAt,
          action: 'REVIEW',
          reasons: checklist.blocking.map((b) => b.id)
        })
      );
    }
    const riskyClaims = (job.research?.claims || []).filter((c) => {
      const assessed = assessClaimRisk({
        claim: c,
        sources: job.research?.sources as any,
        hasConflict: Boolean((job.research as any)?.conflicts?.length)
      });
      return isAttentionWorthyClaimRisk(assessed.level);
    });
    if (riskyClaims.length && (job.stage === 'published' || job.stage === 'review' || job.stage === 'approved')) {
      items.push(
        item({
          id: `att-claim-${job.id}`,
          siteId,
          type: 'HIGH_RISK_CLAIM',
          severity: 'HIGH',
          title: 'High-risk claim needs verification',
          description: `${riskyClaims.length} high-risk claim(s) lack solid support.`,
          entityId: job.id,
          articleId: job.wordpressPostId,
          createdAt: job.updatedAt,
          action: 'REVIEW',
          reasons: riskyClaims.slice(0, 3).map((c) => c.text || c.status)
        })
      );
    }
  }

  const sessions = listResearchSessions(siteId);
  for (const session of sessions.filter((s) => s.status === 'STALE' || s.status === 'INVALIDATED')) {
    items.push(
      item({
        id: `att-stale-${session.id}`,
        siteId,
        type: 'STALE_RESEARCH',
        severity: 'MEDIUM',
        title: 'Research is stale',
        description: `Session for “${session.topic}” is ${session.status}.`,
        entityId: session.id,
        createdAt: session.updatedAt,
        action: 'RESEARCH',
        reasons: [`status=${session.status}`]
      })
    );
  }
  for (const session of sessions.filter((s) => (s.conflicts || []).some((c) => c.resolutionStatus === 'UNRESOLVED'))) {
    const unresolved = (session.conflicts || []).filter((c) => c.resolutionStatus === 'UNRESOLVED');
    items.push(
      item({
        id: `att-conflict-${session.id}`,
        siteId,
        type: 'RESEARCH_CONFLICT',
        severity: unresolved.some((c) => c.severity === 'high') ? 'HIGH' : 'MEDIUM',
        title: 'Research has unresolved conflicts',
        description: `${unresolved.length} conflict(s) in “${session.topic}”.`,
        entityId: session.id,
        createdAt: session.updatedAt,
        action: 'REVIEW',
        reasons: unresolved.slice(0, 3).map((c) => c.difference || c.claim || c.id)
      })
    );
  }

  const impacts = listContentImpacts(siteId).filter((r) => r.status === 'OPEN');
  for (const impact of impacts) {
    items.push(
      item({
        id: `att-impact-${impact.id}`,
        siteId,
        type: 'SOURCE_CHANGED',
        severity: impact.affectedProductionJobIds.length > 0 ? 'HIGH' : 'MEDIUM',
        title: 'Source changed',
        description: `A source used by ${impact.affectedSessionIds.length} research session(s) changed.`,
        entityId: impact.id,
        sourceUrl: impact.sourceUrl,
        createdAt: impact.detectedAt,
        action: 'UPDATE',
        reasons: [
          impact.note || 'SOURCE_CHANGED',
          `${impact.affectedProductionJobIds.length} article job(s) may be affected`
        ]
      })
    );
  }

  const perf = loadPerformanceStore(siteId);
  for (const record of perf.records) {
    if (record.decay.status === 'DECAYED') {
      items.push(
        item({
          id: `att-decay-${record.articleId}`,
          siteId,
          type: 'CONTENT_DECAY',
          severity: 'HIGH',
          title: 'Content decay detected',
          description: record.baseline.title,
          articleId: record.articleId,
          entityId: String(record.articleId),
          createdAt: (record as any).assessedAt || perf.lastSyncedAt || now,
          action: 'UPDATE',
          reasons: record.decay.reasons.slice(0, 4)
        })
      );
    } else if (record.decay.status === 'DECLINING') {
      items.push(
        item({
          id: `att-decline-${record.articleId}`,
          siteId,
          type: 'CONTENT_DECLINING',
          severity: 'MEDIUM',
          title: 'Content declining',
          description: record.baseline.title,
          articleId: record.articleId,
          entityId: String(record.articleId),
          createdAt: (record as any).assessedAt || perf.lastSyncedAt || now,
          action: 'UPDATE',
          reasons: record.decay.reasons.slice(0, 3)
        })
      );
    }
    const seoFails = (record.health?.dimensions?.seo?.checks || []).filter(
      (c) => c.status === 'error' || c.status === 'warning'
    );
    if (seoFails.length) {
      items.push(
        item({
          id: `att-seo-${record.articleId}`,
          siteId,
          type: 'SEO_ISSUE',
          severity: 'MEDIUM',
          title: 'SEO issues',
          description: record.baseline.title,
          articleId: record.articleId,
          entityId: String(record.articleId),
          createdAt: (record as any).assessedAt || perf.lastSyncedAt || now,
          action: 'UPDATE',
          reasons: seoFails.slice(0, 3).map((c) => c.detail || c.label)
        })
      );
    }
  }

  const providers = buildHealthPayload(siteId).providers;
  for (const [id, row] of Object.entries(providers)) {
    const status = (row as any).status;
    if (status === 'error' || status === 'misconfigured') {
      items.push(
        item({
          id: `att-provider-${id}`,
          siteId,
          type: 'PROVIDER_ERROR',
          severity: id === 'gemini' || id === 'wordpress' ? 'CRITICAL' : 'HIGH',
          title: `Provider ${id} problem`,
          description: (row as any).detail || status,
          entityId: id,
          createdAt: now,
          action: 'CONFIGURE',
          reasons: [status]
        })
      );
    } else if (status === 'not_configured' && (id === 'gemini' || id === 'wordpress')) {
      items.push(
        item({
          id: `att-provider-missing-${id}`,
          siteId,
          type: 'PROVIDER_NOT_CONFIGURED',
          severity: id === 'gemini' ? 'HIGH' : 'MEDIUM',
          title: `${id} not configured`,
          description: (row as any).detail || 'Not configured',
          entityId: id,
          createdAt: now,
          action: 'CONFIGURE',
          reasons: ['not_configured']
        })
      );
    }
  }

  if (perf.records.length === 0) {
    items.push(
      item({
        id: `att-perf-sync-${siteId}`,
        siteId,
        type: 'PERF_NEEDS_SYNC',
        severity: 'LOW',
        title: 'Performance not synced',
        description: 'No performance records stored. Run PERFORMANCE_SYNC.',
        createdAt: now,
        action: 'SYNC',
        reasons: ['empty performance store']
      })
    );
  }

  const schedules = listSchedules(siteId).filter((s) => s.enabled);
  for (const schedule of schedules) {
    if (schedule.nextRunAt && new Date(schedule.nextRunAt).getTime() < Date.now() - 2 * 24 * 60 * 60 * 1000) {
      items.push(
        item({
          id: `att-sched-${schedule.id}`,
          siteId,
          type: 'SCHEDULE_OVERDUE',
          severity: 'LOW',
          title: 'Schedule overdue',
          description: `${schedule.type} nextRunAt is overdue.`,
          entityId: schedule.id,
          createdAt: schedule.updatedAt || now,
          action: 'SYNC',
          reasons: [`nextRunAt=${schedule.nextRunAt}`]
        })
      );
    }
  }

  return items.sort((a, b) => b.priorityScore - a.priorityScore || b.createdAt.localeCompare(a.createdAt));
}

export function mapActionLabel(action: AttentionAction): string {
  switch (action) {
    case 'RESEARCH':
      return 'Refresh research';
    case 'UPDATE':
      return 'Update content';
    case 'REVIEW':
      return 'Review';
    case 'SYNC':
      return 'Sync';
    case 'CONFIGURE':
      return 'Configure provider';
    case 'RETRY':
      return 'Retry job';
    default:
      return 'View';
  }
}
