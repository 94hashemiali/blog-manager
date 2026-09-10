import { getJob, saveJob } from '../../content/store.js';
import { buildPublishingChecklist, runPublishOperation } from '../../content/publishing.js';
import { approveJob } from '../../content/pipeline.js';
import { OpsJobError } from '../errors.js';
import { makeProgress } from '../types.js';
import type { JobHandler } from '../registry.js';
import { emitDomainEvent } from '../events.js';
import type { PublishOperation } from '../../content/types.js';

/**
 * Publishing is always gated. Runner never bypasses checklist.
 * Auto-publish is forbidden in this phase — requires approved stage or explicit approve flag.
 */
export const publishHandler: JobHandler = async (ctx) => {
  const productionJobId = String(ctx.job.productionJobId || ctx.job.payload.productionJobId || '');
  if (!productionJobId) {
    throw new OpsJobError({ code: 'missing_production_job', message: 'productionJobId required', retryable: false });
  }

  let prod = getJob(ctx.job.siteId, productionJobId);
  if (!prod || prod.siteId !== ctx.job.siteId) {
    throw new OpsJobError({ code: 'production_job_not_found', message: 'Production job not found', retryable: false });
  }

  const operation = String(ctx.job.payload.operation || 'SAVE_LOCAL_DRAFT') as PublishOperation;
  const stages = ctx.job.stages;

  await ctx.updateProgress(makeProgress(0, stages.length, 'Validating publish gates'), 'validate_gates');
  await ctx.emitStage('validate_gates', 'Running publishing checklist', false);
  ctx.assertNotCancelled();

  // Require human approval boundary for live WordPress publish ops.
  const touchesWordpress = operation !== 'SAVE_LOCAL_DRAFT';
  if (touchesWordpress && prod.stage !== 'approved' && prod.stage !== 'published' && prod.stage !== 'publishing') {
    if (ctx.job.payload.explicitApproval === true && prod.draft) {
      try {
        prod = approveJob(prod, String(ctx.job.payload.approvalNote || 'Approved via publish job'));
      } catch (err: any) {
        throw new OpsJobError({
          code: 'approval_failed',
          message: err?.message || 'Approval failed',
          retryable: false,
          stage: 'validate_gates'
        });
      }
    } else {
      throw new OpsJobError({
        code: 'human_approval_required',
        message: 'WordPress publish requires an approved production job (HUMAN_APPROVAL_REQUIRED).',
        retryable: false,
        stage: 'validate_gates'
      });
    }
  }

  const checklist = buildPublishingChecklist({
    job: prod,
    categories: Array.isArray(ctx.job.payload.categories) ? ctx.job.payload.categories.map(String) : [],
    featuredImageUrl: ctx.job.payload.featuredImageUrl ? String(ctx.job.payload.featuredImageUrl) : undefined,
    featuredImageAlt: ctx.job.payload.featuredImageAlt ? String(ctx.job.payload.featuredImageAlt) : undefined
  });

  if (touchesWordpress && !checklist.canPublish) {
    throw new OpsJobError({
      code: 'publish_gate_blocked',
      message: checklist.blocking.map((item) => item.detail).join(' | ') || 'Publish blocked',
      retryable: false,
      stage: 'validate_gates'
    });
  }

  prod = saveJob({ ...prod, publishingChecklist: checklist });
  await ctx.emitStage('validate_gates', 'Gates passed', true);
  await ctx.updateProgress(makeProgress(1, stages.length, 'Writing to WordPress / local'), 'wordpress_write');
  await ctx.emitStage('wordpress_write', `Operation ${operation}`, false);
  await ctx.heartbeat();

  const { result, job: nextJob } = await runPublishOperation({
    job: prod,
    operation,
    categories: Array.isArray(ctx.job.payload.wordpressCategoryIds)
      ? ctx.job.payload.wordpressCategoryIds.map(Number).filter(Number.isFinite)
      : undefined,
    featuredMediaId: Number.isFinite(Number(ctx.job.payload.featuredMediaId))
      ? Number(ctx.job.payload.featuredMediaId)
      : undefined
  });

  if (result.status === 'failed') {
    saveJob(nextJob);
    throw new OpsJobError({
      code: 'publish_failed',
      message: result.error || 'Publish failed',
      retryable: /5\d\d|timeout|network/i.test(String(result.error || '')),
      stage: 'wordpress_write',
      provider: 'wordpress'
    });
  }

  const saved = saveJob(nextJob);
  await ctx.emitStage('wordpress_write', 'Write succeeded', true);
  await ctx.updateProgress(makeProgress(2, stages.length, 'Verifying response'), 'verify');
  await ctx.emitStage('verify', result.url || saved.publishedUrl || 'Local draft saved', true);
  await ctx.updateProgress(makeProgress(4, stages.length, 'Persisted remote identity'), 'persist');

  emitDomainEvent({
    type: operation.includes('UPDATE') ? 'ARTICLE_UPDATED' : 'ARTICLE_PUBLISHED',
    siteId: saved.siteId,
    entityId: saved.contentEntityId || saved.id,
    jobId: ctx.job.id,
    metadata: {
      operation,
      wordpressPostId: result.wordpressPostId || saved.wordpressPostId,
      url: result.url || saved.publishedUrl
    }
  });

  return {
    productionJobId: saved.id,
    operation,
    wordpressPostId: result.wordpressPostId || saved.wordpressPostId,
    wordpressUrl: result.url || saved.publishedUrl,
    stage: saved.stage
  };
};
