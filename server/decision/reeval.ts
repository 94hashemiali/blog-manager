import { listContentImpacts } from '../jobs/impact.js';
import { getOpsJob } from '../jobs/store.js';
import { loadPerformanceStore } from '../performance/store.js';
import { getResearchSession } from '../research/store.js';
import { buildHealthPayload } from '../providers/status.js';
import type { OperationRecommendation } from '../operations/types.js';

/** Lightweight stale check — no full Decision Engine re-run. */
export function isRecommendationStillNeeded(
  siteId: string,
  rec: OperationRecommendation
): { stillNeeded: boolean; reason: string } {
  if (rec.siteId !== siteId) {
    return { stillNeeded: false, reason: 'Site mismatch' };
  }

  switch (rec.type) {
    case 'RESEARCH_REFRESH':
    case 'RESEARCH_ARTICLE': {
      const session = rec.entityId ? getResearchSession(siteId, rec.entityId) : undefined;
      if (!session) return { stillNeeded: false, reason: 'Research session gone' };
      if (session.status !== 'STALE' && session.status !== 'INVALIDATED') {
        return { stillNeeded: false, reason: `Research is ${session.status}` };
      }
      return { stillNeeded: true, reason: `Research ${session.status}` };
    }
    case 'REVIEW_SOURCE': {
      const impact = listContentImpacts(siteId).find((i) => i.id === rec.entityId);
      if (!impact || impact.status !== 'OPEN') {
        return { stillNeeded: false, reason: 'Impact resolved or missing' };
      }
      return { stillNeeded: true, reason: 'Impact still OPEN' };
    }
    case 'UPDATE_ARTICLE':
    case 'FIX_SEO': {
      if (rec.articleId == null) return { stillNeeded: false, reason: 'No articleId' };
      const perf = loadPerformanceStore(siteId);
      const record = perf.records.find((r) => String(r.articleId) === String(rec.articleId));
      const opp = perf.opportunities.find(
        (o) => o.type === 'UPDATE_ARTICLE' && String(o.articleId) === String(rec.articleId)
      );
      if (rec.type === 'FIX_SEO') {
        const seoFails = (record?.health?.dimensions?.seo?.checks || []).filter(
          (c) => c.status === 'error' || c.status === 'warning'
        );
        if (!seoFails.length) return { stillNeeded: false, reason: 'SEO issues cleared' };
        return { stillNeeded: true, reason: 'SEO issues remain' };
      }
      const decaying =
        record?.decay.status === 'DECAYED' ||
        record?.decay.status === 'DECLINING' ||
        Boolean(opp);
      if (!decaying) return { stillNeeded: false, reason: 'Decay/opportunity cleared' };
      return { stillNeeded: true, reason: 'Update signals remain' };
    }
    case 'RETRY_OPERATION': {
      const jobId = String(rec.metadata?.jobId || rec.entityId || '');
      const job = jobId ? getOpsJob(jobId, siteId) : undefined;
      if (!job) return { stillNeeded: false, reason: 'Job gone' };
      if (!['FAILED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(job.status)) {
        return { stillNeeded: false, reason: `Job is ${job.status}` };
      }
      return { stillNeeded: true, reason: `Job ${job.status}` };
    }
    case 'CONFIGURE_PROVIDER': {
      const id = String(rec.entityId || '');
      const providers = buildHealthPayload(siteId).providers as Record<string, any>;
      const row = providers[id];
      if (!row) return { stillNeeded: false, reason: 'Provider unknown' };
      if (row.status === 'configured' || row.status === 'connected' || row.status === 'ok') {
        return { stillNeeded: false, reason: `Provider ${id} now ${row.status}` };
      }
      return { stillNeeded: true, reason: `Provider ${id} is ${row.status}` };
    }
    case 'SYNC_CONTENT': {
      if (rec.metadata?.opsJobType === 'PERFORMANCE_SYNC') {
        const perf = loadPerformanceStore(siteId);
        if (perf.records.length > 0) {
          return { stillNeeded: false, reason: 'Performance data present' };
        }
      }
      return { stillNeeded: true, reason: 'Sync still useful' };
    }
    case 'REVIEW_ARTICLE':
      return { stillNeeded: true, reason: 'Human review still open' };
    default:
      return { stillNeeded: true, reason: 'No expiry rule — keep open' };
  }
}
