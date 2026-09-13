import { getContentIndex } from '../intelligence/store.js';
import { getResearchSession } from '../research/store.js';
import { buildHealthPayload } from '../providers/status.js';
import { getOpsJob } from '../jobs/store.js';
import type { DecisionAction, DecisionBlocker, DecisionSignal } from './types.js';

export interface FeasibilityResult {
  feasible: boolean;
  blockers: DecisionBlocker[];
  /** If primary action blocked, prefer this prerequisite action. */
  redirectTo?: DecisionAction;
}

/**
 * Check whether an action can actually execute with current persisted state.
 */
export function checkActionFeasibility(
  siteId: string,
  action: DecisionAction,
  ctx: {
    articleId?: string | number;
    entityId?: string;
    signals?: DecisionSignal[];
    topic?: string;
  } = {}
): FeasibilityResult {
  const blockers: DecisionBlocker[] = [];
  const providers = buildHealthPayload(siteId).providers as Record<string, any>;

  const gemini = providers.gemini;
  const wordpress = providers.wordpress;
  const webSearch = providers.web_search;

  if (action === 'CONFIGURE_PROVIDER') {
    return { feasible: true, blockers: [] };
  }

  if (action === 'RETRY_OPERATION') {
    const jobId = ctx.entityId;
    if (!jobId) {
      blockers.push({ code: 'MISSING_JOB', message: 'Job id required for retry' });
      return { feasible: false, blockers };
    }
    const job = getOpsJob(jobId, siteId);
    if (!job || job.siteId !== siteId) {
      blockers.push({ code: 'JOB_NOT_FOUND', message: 'Ops job not found for this site' });
      return { feasible: false, blockers };
    }
    return { feasible: true, blockers: [] };
  }

  if (action === 'SYNC_PERFORMANCE') {
    // Sync can run with empty providers (uses WP index / estimates) — only block if no site.
    return { feasible: true, blockers: [] };
  }

  if (action === 'SYNC_CONTENT') {
    if (wordpress && (wordpress.status === 'not_configured' || wordpress.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: wordpress.detail || 'WordPress not configured',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return { feasible: false, blockers, redirectTo: 'CONFIGURE_PROVIDER' };
    }
    return { feasible: true, blockers: [] };
  }

  if (action === 'REFRESH_RESEARCH' || action === 'RESEARCH') {
    if (gemini && (gemini.status === 'not_configured' || gemini.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: gemini.detail || 'Gemini not configured',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return { feasible: false, blockers, redirectTo: 'CONFIGURE_PROVIDER' };
    }
    const session = ctx.entityId ? getResearchSession(siteId, ctx.entityId) : undefined;
    const topic = ctx.topic || session?.topic;
    if (!topic && !session) {
      blockers.push({ code: 'MISSING_TOPIC', message: 'Research topic or session required' });
      return { feasible: false, blockers };
    }
    // If session no longer stale — caller should expire, not create job.
    if (session && session.status !== 'STALE' && session.status !== 'INVALIDATED' && action === 'REFRESH_RESEARCH') {
      blockers.push({ code: 'RESEARCH_NOT_STALE', message: `Research is ${session.status}` });
      return { feasible: false, blockers };
    }
    return { feasible: true, blockers: [] };
  }

  if (action === 'REVIEW_SOURCE') {
    if (!ctx.entityId) {
      blockers.push({ code: 'MISSING_IMPACT', message: 'Impact id required' });
      return { feasible: false, blockers };
    }
    return { feasible: true, blockers: [] };
  }

  if (
    action === 'UPDATE_ARTICLE' ||
    action === 'FIX_SEO' ||
    action === 'ADD_INTERNAL_LINKS' ||
    action === 'REVIEW_ARTICLE'
  ) {
    if (ctx.articleId == null) {
      blockers.push({ code: 'MISSING_ARTICLE', message: 'articleId required' });
      return { feasible: false, blockers };
    }
    const index = getContentIndex(siteId);
    const article = index.articles.find((a) => String(a.id) === String(ctx.articleId));
    if (!article) {
      blockers.push({
        code: 'ARTICLE_NOT_INDEXED',
        message: 'Article not in content index — sync content first',
        resolvesWith: 'SYNC_CONTENT'
      });
      return { feasible: false, blockers, redirectTo: 'SYNC_CONTENT' };
    }
    if (gemini && (gemini.status === 'not_configured' || gemini.status === 'error') && action !== 'REVIEW_ARTICLE') {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: gemini.detail || 'Gemini required for draft generation',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return { feasible: false, blockers, redirectTo: 'CONFIGURE_PROVIDER' };
    }

    // Soft prerequisite only when THIS decision context has source-change or linked stale research.
    const sourceChanged = (ctx.signals || []).some((s) => s.type === 'SOURCE_CHANGED');
    const linkedStale = (ctx.signals || []).some((s) => s.type === 'STALE_RESEARCH');
    if ((sourceChanged || linkedStale) && action === 'UPDATE_ARTICLE') {
      blockers.push({
        code: 'RESEARCH_STALE',
        message: 'Research/sources need refresh before a safe update',
        resolvesWith: 'REFRESH_RESEARCH'
      });
      return { feasible: false, blockers, redirectTo: 'REFRESH_RESEARCH' };
    }

    const canni = (ctx.signals || []).find((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH');
    if (canni && action === 'UPDATE_ARTICLE') {
      blockers.push({
        code: 'CANNIBALIZATION_RISK',
        message: 'Update may increase topic overlap — review first',
        resolvesWith: 'REVIEW_ARTICLE'
      });
      return { feasible: false, blockers, redirectTo: 'REVIEW_ARTICLE' };
    }

    return { feasible: true, blockers: [] };
  }

  if (action === 'CREATE_ARTICLE') {
    if (gemini && (gemini.status === 'not_configured' || gemini.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: gemini.detail || 'Gemini not configured',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return { feasible: false, blockers, redirectTo: 'CONFIGURE_PROVIDER' };
    }
    const canni = (ctx.signals || []).find((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH');
    if (canni) {
      blockers.push({
        code: 'CANNIBALIZATION_RISK',
        message: 'Severe cannibalization — review existing articles instead',
        resolvesWith: 'REVIEW_ARTICLE'
      });
      return { feasible: false, blockers, redirectTo: 'REVIEW_ARTICLE' };
    }
    // CREATE is recommend-only in this phase unless production create path is used via UI.
    blockers.push({
      code: 'CREATE_VIA_STUDIO',
      message: 'Create article via Content Studio — Decision Engine recommends only'
    });
    return { feasible: false, blockers };
  }

  // Unused web search note for research quality — not a hard block.
  void webSearch;
  return { feasible: true, blockers: [] };
}

export function mapActionToRecommendationType(action: DecisionAction): string {
  switch (action) {
    case 'UPDATE_ARTICLE':
    case 'FIX_SEO':
    case 'ADD_INTERNAL_LINKS':
      return action === 'FIX_SEO' ? 'FIX_SEO' : 'UPDATE_ARTICLE';
    case 'REFRESH_RESEARCH':
    case 'RESEARCH':
      return 'RESEARCH_REFRESH';
    case 'REVIEW_SOURCE':
      return 'REVIEW_SOURCE';
    case 'SYNC_CONTENT':
    case 'SYNC_PERFORMANCE':
      return 'SYNC_CONTENT';
    case 'RETRY_OPERATION':
      return 'RETRY_OPERATION';
    case 'CONFIGURE_PROVIDER':
      return 'CONFIGURE_PROVIDER';
    case 'REVIEW_ARTICLE':
      return 'REVIEW_ARTICLE';
    case 'CREATE_ARTICLE':
      return 'REVIEW_ARTICLE'; // recommend-only — Content Studio creates
    default:
      return 'UPDATE_ARTICLE';
  }
}
