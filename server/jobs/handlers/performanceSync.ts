import { syncPerformanceForSite } from '../../performance/sync.js';
import { makeProgress } from '../types.js';
import type { JobHandler } from '../registry.js';
import { emitDomainEvent } from '../events.js';

export const performanceSyncHandler: JobHandler = async (ctx) => {
  const stages = ctx.job.stages;
  await ctx.updateProgress(makeProgress(0, stages.length, 'Loading content index'), 'load_index');
  await ctx.emitStage('load_index', 'Loading indexed articles', false);
  ctx.assertNotCancelled();

  await ctx.updateProgress(makeProgress(1, stages.length, 'Computing metrics'), 'compute_metrics');
  await ctx.heartbeat();

  const result = syncPerformanceForSite(ctx.job.siteId);

  await ctx.updateProgress(makeProgress(2, stages.length, 'Decay analysis'), 'decay');
  await ctx.emitStage('decay', 'Decay classified', true);
  await ctx.updateProgress(makeProgress(3, stages.length, 'Opportunities'), 'opportunities');
  await ctx.emitStage('opportunities', `${result.overview.counts.total} articles analyzed`, true);
  await ctx.updateProgress(makeProgress(4, stages.length, 'Completed'), 'opportunities');

  const opportunityCount = result.records.flatMap((r) => r.opportunities).length;

  emitDomainEvent({
    type: 'PERFORMANCE_SYNCED',
    siteId: ctx.job.siteId,
    jobId: ctx.job.id,
    metadata: {
      articleCount: result.records.length,
      opportunityCount
    }
  });

  return {
    articleCount: result.records.length,
    lastSyncedAt: result.overview.lastSyncedAt || new Date().toISOString(),
    providers: result.providerStatuses,
    needsAttention: result.overview.counts,
    opportunityCount
  };
};
