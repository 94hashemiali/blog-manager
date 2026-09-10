import { runGroundedResearch } from '../../research/packet.js';
import { OpsJobError } from '../errors.js';
import { makeProgress } from '../types.js';
import type { JobHandler } from '../registry.js';
import { emitDomainEvent } from '../events.js';
import { recordSourceImpacts } from '../impact.js';

export const researchHandler: JobHandler = async (ctx) => {
  const topic = String(ctx.job.payload.topic || '').trim();
  if (!topic) {
    throw new OpsJobError({ code: 'missing_topic', message: 'topic required', retryable: false });
  }

  const stages = ctx.job.stages;
  await ctx.updateProgress(makeProgress(0, stages.length, 'Planning research'), 'plan');
  await ctx.emitStage('plan', 'Building research plan', false);
  ctx.assertNotCancelled();

  await ctx.updateProgress(makeProgress(1, stages.length, 'Fetching sources'), 'fetch_sources');
  await ctx.emitStage('fetch_sources', 'Fetching / caching sources', false);

  const { packet, session } = await runGroundedResearch({
    siteId: ctx.job.siteId,
    topic,
    primaryKeyword: ctx.job.payload.primaryKeyword ? String(ctx.job.payload.primaryKeyword) : undefined,
    searchIntent: ctx.job.payload.searchIntent as any,
    targetAudience: ctx.job.payload.targetAudience ? String(ctx.job.payload.targetAudience) : undefined,
    userProvidedFacts: Array.isArray(ctx.job.payload.userProvidedFacts)
      ? ctx.job.payload.userProvidedFacts.map(String)
      : [],
    manualUrls: Array.isArray(ctx.job.payload.urls) ? ctx.job.payload.urls.map(String) : [],
    forceRefreshUrls: Boolean(ctx.job.payload.forceRefresh),
    enrichPlanWithAi: ctx.job.payload.enrichWithAi !== false
  });

  await ctx.heartbeat();
  await ctx.updateProgress(makeProgress(3, stages.length, 'Claims and quality'), 'claims');
  await ctx.emitStage('claims', 'Claims extracted', true);
  await ctx.updateProgress(makeProgress(5, stages.length, 'Quality gate'), 'quality');
  await ctx.emitStage('quality', `Quality ${session.qualityGate.status}`, true);

  emitDomainEvent({
    type: 'ARTICLE_RESEARCHED',
    siteId: ctx.job.siteId,
    entityId: session.id,
    jobId: ctx.job.id,
    metadata: {
      quality: session.qualityGate.status,
      sourceCount: session.sources.length,
      claimCount: session.claims.length
    }
  });

  // Surface source-change impacts if any were marked STALE during fetch.
  recordSourceImpacts(ctx.job.siteId);

  return {
    researchSessionId: session.id,
    packetId: packet.id,
    quality: session.qualityGate.status,
    sourceCount: session.sources.length,
    claimCount: session.claims.length,
    evidenceCount: session.extractedEvidence.length,
    webProviderStatus: packet.webProviderStatus,
    researchConfidence: session.researchConfidence
  };
};
