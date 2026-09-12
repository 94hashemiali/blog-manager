import { enqueueJob } from '../jobs/enqueue.js';
import { retryOpsJob } from '../jobs/runner.js';
import { createUpdateProductionJob } from '../content/pipeline.js';
import { getContentIndex } from '../intelligence/store.js';
import { loadPerformanceStore } from '../performance/store.js';
import { buildDeterministicUpdatePlan } from '../performance/updatePlan.js';
import { getResearchSession } from '../research/store.js';
import {
  getRecommendation,
  updateRecommendationStatus
} from './recommendations.js';
import type { OperationRecommendation } from './types.js';

export function executeRecommendation(
  siteId: string,
  recommendationId: string
): {
  recommendation: OperationRecommendation;
  opsJobId?: string;
  productionJobId?: string;
  message: string;
} {
  const rec = getRecommendation(siteId, recommendationId);
  if (!rec || rec.siteId !== siteId) throw new Error('Recommendation not found');
  if (rec.status === 'DISMISSED' || rec.status === 'COMPLETED') {
    throw new Error('Recommendation is not actionable');
  }
  if (rec.status === 'IN_PROGRESS') {
    return {
      recommendation: rec,
      opsJobId: rec.linkedJobId,
      productionJobId: rec.linkedProductionJobId,
      message: 'Already in progress'
    };
  }

  if (rec.type === 'RETRY_OPERATION') {
    const jobId = String(rec.metadata?.jobId || rec.entityId || '');
    if (!jobId) throw new Error('Missing job id for retry');
    const job = retryOpsJob(jobId, siteId);
    if (!job) throw new Error('Ops job not found');
    const updated =
      updateRecommendationStatus(siteId, rec.id, 'IN_PROGRESS', { linkedJobId: job.id }) || rec;
    return { recommendation: updated, opsJobId: job.id, message: 'Retry queued' };
  }

  if (rec.type === 'SYNC_CONTENT') {
    const opsType =
      rec.metadata?.opsJobType === 'PERFORMANCE_SYNC' ? 'PERFORMANCE_SYNC' : 'INTELLIGENCE_SYNC';
    const { job } = enqueueJob({
      siteId,
      type: opsType,
      priority: 'LOW',
      payload: opsType === 'INTELLIGENCE_SYNC' ? { mode: 'incremental' } : {},
      triggerReason: rec.title,
      triggerEventId: rec.triggerEventId,
      idempotencyKey: `rec-sync-${opsType}-${siteId}-${rec.id}`
    });
    const updated =
      updateRecommendationStatus(siteId, rec.id, 'IN_PROGRESS', { linkedJobId: job.id }) || rec;
    return {
      recommendation: updated,
      opsJobId: job.id,
      message: opsType === 'PERFORMANCE_SYNC' ? 'Performance sync queued' : 'Intelligence sync queued'
    };
  }

  if (rec.type === 'RESEARCH_REFRESH' || rec.type === 'RESEARCH_ARTICLE') {
    const session = rec.entityId ? getResearchSession(siteId, rec.entityId) : undefined;
    const topic = String(rec.metadata?.topic || session?.topic || '').trim();
    if (!topic) throw new Error('Research topic missing');
    const { job } = enqueueJob({
      siteId,
      type: 'RESEARCH',
      payload: {
        topic,
        forceRefresh: true,
        researchSessionId: session?.id
      },
      entityKey: `research:${topic}`,
      triggerReason: rec.title,
      triggerEventId: rec.triggerEventId,
      idempotencyKey: `rec-research-${siteId}-${session?.id || topic}`
    });
    const updated =
      updateRecommendationStatus(siteId, rec.id, 'IN_PROGRESS', { linkedJobId: job.id }) || rec;
    return { recommendation: updated, opsJobId: job.id, message: 'Research job queued' };
  }

  if (rec.type === 'UPDATE_ARTICLE' || rec.type === 'FIX_SEO' || rec.type === 'REVIEW_SOURCE') {
    const articleId = rec.articleId ?? rec.metadata?.articleId;
    // REVIEW_SOURCE may link via impact → production jobs; require explicit article for UPDATE.
    if (articleId == null && rec.type !== 'REVIEW_SOURCE') {
      throw new Error('articleId required for update');
    }

    if (rec.type === 'REVIEW_SOURCE' && articleId == null) {
      const updated = updateRecommendationStatus(siteId, rec.id, 'ACKNOWLEDGED') || rec;
      return {
        recommendation: updated,
        message: 'Open impact details — choose an affected article to update'
      };
    }

    const index = getContentIndex(siteId);
    const article = index.articles.find((row) => String(row.id) === String(articleId));
    if (!article) throw new Error('Article not found in content index');

    const perf = loadPerformanceStore(siteId);
    const record = perf.records.find((row) => String(row.articleId) === String(articleId));
    const plan = record
      ? buildDeterministicUpdatePlan({
          siteId,
          article,
          baseline: record.baseline,
          decay: record.decay,
          freshnessIssues: record.freshnessIssues,
          linkingImpact: record.linkingImpact,
          opportunities: record.opportunities
        })
      : undefined;

    // Prefer existing linked production job over creating duplicates.
    let productionId = rec.linkedProductionJobId;
    if (!productionId) {
      const production = createUpdateProductionJob({
        siteId,
        articleId: article.id,
        updateReason: rec.explanation,
        updatePlan: plan,
        performanceSignals: [
          ...(Array.isArray(rec.metadata?.contributingSignals)
            ? (rec.metadata!.contributingSignals as string[])
            : []),
          rec.type,
          rec.dedupeKey
        ],
        mode: 'UPDATE'
      });
      productionId = production.id;
    }

    const { job: opsJob } = enqueueJob({
      siteId,
      type: 'CONTENT_UPDATE',
      productionJobId: productionId,
      payload: {
        productionJobId: productionId,
        runUntil: 'review',
        recommendationId: rec.id,
        triggerEventId: rec.triggerEventId,
        updateReason: rec.explanation
      },
      priority: 'HIGH',
      triggerReason: rec.title,
      triggerEventId: rec.triggerEventId,
      idempotencyKey: `rec-update-${siteId}-${article.id}-${rec.type}`
    });

    const updated =
      updateRecommendationStatus(siteId, rec.id, 'IN_PROGRESS', {
        linkedJobId: opsJob.id,
        linkedProductionJobId: productionId
      }) || rec;

    return {
      recommendation: updated,
      opsJobId: opsJob.id,
      productionJobId: productionId,
      message: 'Update production job created and queued'
    };
  }

  if (rec.type === 'CONFIGURE_PROVIDER') {
    const updated = updateRecommendationStatus(siteId, rec.id, 'ACKNOWLEDGED') || rec;
    return { recommendation: updated, message: 'Open provider settings' };
  }

  throw new Error(`Unsupported recommendation type: ${rec.type}`);
}
