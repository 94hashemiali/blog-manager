import { syncSiteIntelligence } from '../../intelligence/sync.js';
import { updateIntelligenceJob } from '../../intelligence/jobs.js';
import { makeProgress } from '../types.js';
import type { JobHandler } from '../registry.js';
import { emitDomainEvent } from '../events.js';

export const intelligenceSyncHandler: JobHandler = async (ctx) => {
  const mode = ctx.job.payload.mode === 'incremental' ? 'incremental' : 'full';
  const legacyJobId = ctx.job.payload.legacyJobId ? String(ctx.job.payload.legacyJobId) : undefined;
  const stages = ctx.job.stages;

  await ctx.updateProgress(makeProgress(0, stages.length, 'Connecting to WordPress'), 'wordpress_fetch');
  await ctx.emitStage('wordpress_fetch', `WordPress ${mode} sync`, false);
  ctx.assertNotCancelled();

  try {
    const index = await syncSiteIntelligence({
      siteId: ctx.job.siteId,
      mode,
      onProgress: (progress) => {
        const map: Record<string, number> = {
          connecting: 0,
          fetching_posts: 1,
          fetching_products: 1,
          normalizing: 2,
          fingerprinting: 2,
          clustering: 3,
          gaps: 4,
          opportunities: 5,
          updating_intelligence: 5
        };
        const idx = map[progress.stage] ?? 1;
        void ctx.updateProgress(
          makeProgress(idx, stages.length, progress.detail || progress.stage),
          progress.stage
        );
        if (legacyJobId) {
          updateIntelligenceJob(legacyJobId, {
            status: 'RUNNING',
            stage: progress.stage,
            done: progress.done,
            total: progress.total,
            detail: progress.detail
          });
        }
      }
    });

    await ctx.updateProgress(makeProgress(stages.length, stages.length, 'Index updated'), 'opportunities');
    await ctx.emitStage('opportunities', `${index.articles.length} articles indexed`, true);

    if (legacyJobId) {
      updateIntelligenceJob(legacyJobId, {
        status: 'COMPLETED',
        stage: 'updating_intelligence',
        result: {
          articleCount: index.articles.length,
          articleTotalFromWp: index.articleTotalFromWp,
          clusterCount: index.clusters.length,
          opportunityCount: index.opportunities.length,
          woocommerceAvailable: index.woocommerceAvailable
        },
        completedAt: new Date().toISOString(),
        done: index.articles.length,
        total: index.articleTotalFromWp || index.articles.length
      });
    }

    emitDomainEvent({
      type: 'CONTENT_INDEXED',
      siteId: ctx.job.siteId,
      jobId: ctx.job.id,
      metadata: {
        articleCount: index.articles.length,
        opportunityCount: index.opportunities.length,
        mode
      }
    });

    return {
      articleCount: index.articles.length,
      articleTotalFromWp: index.articleTotalFromWp,
      clusterCount: index.clusters.length,
      opportunityCount: index.opportunities.length,
      woocommerceAvailable: index.woocommerceAvailable,
      legacyJobId
    };
  } catch (err: any) {
    if (legacyJobId) {
      updateIntelligenceJob(legacyJobId, {
        status: 'FAILED',
        error: err?.message || 'intelligence sync failed',
        completedAt: new Date().toISOString()
      });
    }
    throw err;
  }
};
