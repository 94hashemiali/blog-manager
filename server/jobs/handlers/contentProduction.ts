import { getJob, saveJob } from '../../content/store.js';
import {
  moveToReview,
  runBriefStage,
  runDraftStage,
  runFactCheckStage,
  runResearchStage,
  runSeoStage
} from '../../content/pipeline.js';
import { validateArticleDraft } from '../../content/validation.js';
import { OpsJobError } from '../errors.js';
import { makeProgress } from '../types.js';
import type { JobHandler } from '../registry.js';
import { emitDomainEvent } from '../events.js';

const STAGE_LABELS: Record<string, string> = {
  research: 'Researching sources and claims',
  brief: 'Generating content brief',
  draft: 'Generating article draft',
  validation: 'Validating draft structure',
  fact_check: 'Fact-checking claims',
  seo: 'Running SEO preflight',
  review: 'Moving to review'
};

export const contentProductionHandler: JobHandler = async (ctx) => {
  const productionJobId = String(ctx.job.productionJobId || ctx.job.payload.productionJobId || '');
  if (!productionJobId) {
    throw new OpsJobError({ code: 'missing_production_job', message: 'productionJobId required', retryable: false });
  }

  let prod = getJob(ctx.job.siteId, productionJobId);
  if (!prod || prod.siteId !== ctx.job.siteId) {
    throw new OpsJobError({ code: 'production_job_not_found', message: 'Production job not found', retryable: false });
  }

  const runUntil = String(ctx.job.payload.runUntil || 'review');
  const forceRefreshUrls = Boolean(ctx.job.payload.forceRefreshUrls);
  const urls = Array.isArray(ctx.job.payload.urls) ? ctx.job.payload.urls.map(String) : undefined;
  const stages = ctx.job.stages.length ? ctx.job.stages : ['research', 'brief', 'draft', 'validation', 'fact_check', 'seo', 'review'];

  const shouldRun = (name: string) => {
    if (runUntil === 'research') return name === 'research';
    if (runUntil === 'brief') return ['research', 'brief'].includes(name);
    if (runUntil === 'draft') return ['research', 'brief', 'draft', 'validation'].includes(name);
    return true;
  };

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    if (!shouldRun(stage)) break;
    ctx.assertNotCancelled();
    ctx.assertNotPaused();

    await ctx.updateProgress(makeProgress(i, stages.length, STAGE_LABELS[stage] || stage), stage);
    await ctx.emitStage(stage, STAGE_LABELS[stage] || stage, false);
    await ctx.heartbeat();

    prod = getJob(ctx.job.siteId, productionJobId)!;

    if (stage === 'research') {
      if (!prod.research) {
        prod = await runResearchStage(prod, { urls, forceRefreshUrls });
        emitDomainEvent({
          type: 'ARTICLE_RESEARCHED',
          siteId: prod.siteId,
          entityId: prod.contentEntityId || prod.id,
          jobId: ctx.job.id
        });
      }
    } else if (stage === 'brief') {
      if (!prod.brief) prod = await runBriefStage(prod);
    } else if (stage === 'draft') {
      if (!prod.draft) {
        prod = await runDraftStage(prod);
        emitDomainEvent({
          type: 'ARTICLE_DRAFTED',
          siteId: prod.siteId,
          entityId: prod.contentEntityId || prod.id,
          jobId: ctx.job.id
        });
      }
    } else if (stage === 'validation') {
      if (prod.draft && prod.brief && !prod.validation) {
        const validation = validateArticleDraft({
          draft: prod.draft,
          brief: prod.brief,
          research: prod.research,
          decision: prod.decision
        });
        prod = saveJob({ ...prod, validation });
      }
    } else if (stage === 'fact_check') {
      if (!prod.factCheck) prod = await runFactCheckStage(prod);
    } else if (stage === 'seo') {
      if (!prod.seoPreflight) prod = runSeoStage(prod);
    } else if (stage === 'review') {
      if (prod.stage !== 'review' && prod.stage !== 'approved' && prod.stage !== 'published') {
        prod = moveToReview(prod);
      }
    }

    await ctx.emitStage(stage, `${STAGE_LABELS[stage] || stage} completed`, true);
    await ctx.updateProgress(makeProgress(i + 1, stages.length, STAGE_LABELS[stage] || stage), stage);
  }

  prod = getJob(ctx.job.siteId, productionJobId)!;
  return {
    productionJobId: prod.id,
    stage: prod.stage,
    status: prod.status,
    researchSessionId: prod.research?.researchSessionId,
    hasDraft: Boolean(prod.draft),
    validationScore: prod.validation?.score
  };
};
