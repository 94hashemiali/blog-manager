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
import { isRecommendationStillNeeded } from '../decision/reeval.js';
import { checkActionFeasibility } from '../decision/actions.js';
import type { DecisionAction } from '../decision/types.js';

function recTypeToAction(type: string, metadata?: Record<string, unknown>): DecisionAction {
  switch (type) {
    case 'RESEARCH_REFRESH':
    case 'RESEARCH_ARTICLE':
      return 'REFRESH_RESEARCH';
    case 'FIX_SEO':
      return 'FIX_SEO';
    case 'REVIEW_SOURCE':
      return 'REVIEW_SOURCE';
    case 'SYNC_CONTENT':
      return metadata?.opsJobType === 'PERFORMANCE_SYNC' ? 'SYNC_PERFORMANCE' : 'SYNC_CONTENT';
    case 'CONFIGURE_PROVIDER':
      return 'CONFIGURE_PROVIDER';
    case 'RETRY_OPERATION':
      return 'RETRY_OPERATION';
    default:
      return 'UPDATE_ARTICLE';
  }
}

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
  if (
    rec.status === 'DISMISSED' ||
    rec.status === 'COMPLETED' ||
    rec.status === 'EXPIRED' ||
    rec.status === 'BLOCKED'
  ) {
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

  // Re-evaluate before execution — never blindly run a stale recommendation.
  const still = isRecommendationStillNeeded(siteId, rec);
  if (!still.stillNeeded) {
    const updated =
      updateRecommendationStatus(siteId, rec.id, 'EXPIRED', {
        metadata: { expiredReason: still.reason, expiredAt: new Date().toISOString() }
      }) || rec;
    return {
      recommendation: updated,
      message: `No longer necessary: ${still.reason}`
    };
  }

  const syncAction = recTypeToAction(rec.type, rec.metadata);
  const signalTypes = Array.isArray(rec.metadata?.signals) ? (rec.metadata!.signals as string[]) : [];
  const signalBlockers = Array.isArray(rec.metadata?.blockers)
    ? (rec.metadata!.blockers as Array<{ code?: string }>)
    : [];
  // Rebuild minimal signals for feasibility guards (conflict / cannibalization / stale).
  const signalsFromMeta = signalTypes.map((type) => ({
    type: type as any,
    siteId,
    articleId: rec.articleId,
    entityId: rec.entityId,
    severity: signalBlockers.some((b) => b.code === type) ? ('HIGH' as const) : ('MEDIUM' as const),
    strength: 0.7,
    evidence: [],
    detectedAt: rec.updatedAt,
    source: 'recommendation.metadata'
  }));
  const feasibility = checkActionFeasibility(siteId, syncAction, {
    articleId: rec.articleId,
    entityId: rec.entityId,
    topic: String(rec.metadata?.topic || ''),
    signals: signalsFromMeta
  });
  if (
    !feasibility.feasible &&
    syncAction !== 'REVIEW_SOURCE' &&
    syncAction !== 'CONFIGURE_PROVIDER' &&
    syncAction !== 'REVIEW_ARTICLE'
  ) {
    if (feasibility.redirectTo) {
      throw new Error(
        `Blocked: ${feasibility.blockers.map((b) => b.message).join('; ')}. Try ${feasibility.redirectTo} first.`
      );
    }
    throw new Error(feasibility.blockers.map((b) => b.message).join('; ') || 'Action not feasible');
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
        researchSessionId: session?.id,
        recommendationId: rec.id,
        decisionId: rec.metadata?.decisionId
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

  if (rec.type === 'REVIEW_SOURCE' || rec.type === 'REVIEW_ARTICLE' || rec.type === 'CONFIGURE_PROVIDER') {
    const updated = updateRecommendationStatus(siteId, rec.id, 'ACKNOWLEDGED') || rec;
    if (rec.type === 'CONFIGURE_PROVIDER') {
      return { recommendation: updated, message: 'Open provider settings to configure' };
    }
    if (rec.type === 'REVIEW_SOURCE') {
      return {
        recommendation: updated,
        message: 'Review source/evidence conflict — no draft created until conflict is resolved'
      };
    }
    return { recommendation: updated, message: 'Marked for human review — no draft created' };
  }

  if (rec.type === 'UPDATE_ARTICLE' || rec.type === 'FIX_SEO') {
    const articleId = rec.articleId ?? rec.metadata?.articleId;
    if (articleId == null) {
      throw new Error('articleId required for update');
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
          ...(Array.isArray(rec.metadata?.signals) ? (rec.metadata!.signals as string[]) : []),
          rec.type,
          rec.dedupeKey,
          String(rec.metadata?.decisionId || '')
        ].filter(Boolean),
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
        decisionId: rec.metadata?.decisionId,
        triggerEventId: rec.triggerEventId,
        updateReason: rec.explanation,
        focus: rec.type === 'FIX_SEO' ? 'SEO' : 'UPDATE'
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

  throw new Error(`Unsupported recommendation type: ${rec.type}`);
}
