import { getContentIndex } from '../intelligence/store.js';
import { getResearchSession } from '../research/store.js';
import { buildHealthPayload } from '../providers/status.js';
import { getOpsJob } from '../jobs/store.js';
import type { DecisionAction, DecisionBlocker, DecisionSignal, FeasibilityStatus } from './types.js';

export interface FeasibilityResult {
  feasible: boolean;
  status: FeasibilityStatus;
  blockers: DecisionBlocker[];
  /** If primary action blocked, prefer this prerequisite action. */
  redirectTo?: DecisionAction;
}

function result(
  status: FeasibilityStatus,
  blockers: DecisionBlocker[] = [],
  redirectTo?: DecisionAction
): FeasibilityResult {
  return {
    // REQUIRES_REVIEW is still an actionable navigation decision.
    feasible: status === 'AVAILABLE' || status === 'REQUIRES_REVIEW',
    status,
    blockers,
    redirectTo
  };
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

  if (action === 'DEFER' || action === 'REVIEW_CONTENT') {
    if (action === 'REVIEW_CONTENT') {
      return result('REQUIRES_REVIEW', [
        { code: 'REQUIRES_REVIEW', message: 'Human review required' }
      ]);
    }
    return result('INSUFFICIENT_DATA', [
      { code: 'DEFER', message: 'Insufficient evidence for a confident action' }
    ]);
  }

  if (action === 'CONFIGURE_PROVIDER') {
    return result('AVAILABLE');
  }

  if (action === 'RETRY_OPERATION') {
    const jobId = ctx.entityId;
    if (!jobId) {
      blockers.push({ code: 'MISSING_JOB', message: 'Job id required for retry' });
      return result('BLOCKED', blockers);
    }
    const job = getOpsJob(jobId, siteId);
    if (!job || job.siteId !== siteId) {
      blockers.push({ code: 'JOB_NOT_FOUND', message: 'Ops job not found for this site' });
      return result('BLOCKED', blockers);
    }
    return result('AVAILABLE');
  }

  if (action === 'SYNC_PERFORMANCE') {
    return result('AVAILABLE');
  }

  if (action === 'SYNC_CONTENT') {
    if (wordpress && (wordpress.status === 'not_configured' || wordpress.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: wordpress.detail || 'WordPress not configured',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return result('BLOCKED', blockers, 'CONFIGURE_PROVIDER');
    }
    return result('AVAILABLE');
  }

  if (action === 'REFRESH_RESEARCH' || action === 'RESEARCH') {
    if (gemini && (gemini.status === 'not_configured' || gemini.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: gemini.detail || 'Gemini not configured',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return result('BLOCKED', blockers, 'CONFIGURE_PROVIDER');
    }
    const session = ctx.entityId ? getResearchSession(siteId, ctx.entityId) : undefined;
    const topic = ctx.topic || session?.topic;
    if (!topic && !session) {
      blockers.push({ code: 'MISSING_TOPIC', message: 'Research topic or session required' });
      return result('INSUFFICIENT_DATA', blockers);
    }
    if (session && session.status !== 'STALE' && session.status !== 'INVALIDATED' && action === 'REFRESH_RESEARCH') {
      blockers.push({ code: 'RESEARCH_NOT_STALE', message: `Research is ${session.status}` });
      return result('BLOCKED', blockers);
    }
    return result('AVAILABLE');
  }

  if (action === 'REVIEW_SOURCE' || action === 'REVIEW_ARTICLE') {
    if (action === 'REVIEW_SOURCE' && !ctx.entityId && ctx.articleId == null) {
      blockers.push({ code: 'MISSING_IMPACT', message: 'Impact id or article required' });
      return result('INSUFFICIENT_DATA', blockers);
    }
    return result('REQUIRES_REVIEW', [
      { code: 'REQUIRES_REVIEW', message: 'Human review — no automatic draft' }
    ]);
  }

  if (action === 'UPDATE_ARTICLE' || action === 'FIX_SEO' || action === 'ADD_INTERNAL_LINKS') {
    if (ctx.articleId == null) {
      blockers.push({ code: 'MISSING_ARTICLE', message: 'articleId required' });
      return result('INSUFFICIENT_DATA', blockers);
    }
    const index = getContentIndex(siteId);
    const article = index.articles.find((a) => String(a.id) === String(ctx.articleId));
    if (!article) {
      blockers.push({
        code: 'ARTICLE_NOT_INDEXED',
        message: 'Article not in content index — sync content first',
        resolvesWith: 'SYNC_CONTENT'
      });
      return result('BLOCKED', blockers, 'SYNC_CONTENT');
    }
    if (gemini && (gemini.status === 'not_configured' || gemini.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: gemini.detail || 'Gemini required for draft generation',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return result('BLOCKED', blockers, 'CONFIGURE_PROVIDER');
    }

    const criticalConflict = (ctx.signals || []).find(
      (s) => s.type === 'RESEARCH_CONFLICT' && (s.severity === 'HIGH' || s.severity === 'CRITICAL')
    );
    if (criticalConflict && action === 'UPDATE_ARTICLE') {
      blockers.push({
        code: 'RESEARCH_CONFLICT',
        message: 'Update blocked because evidence conflict is unresolved',
        resolvesWith: 'REVIEW_SOURCE'
      });
      // REVIEW_SOURCE is ack/navigation only — never drafts from conflict path.
      return result('BLOCKED', blockers, 'REVIEW_SOURCE');
    }

    const sourceChanged = (ctx.signals || []).some((s) => s.type === 'SOURCE_CHANGED');
    const linkedStale = (ctx.signals || []).some((s) => s.type === 'STALE_RESEARCH');
    if ((sourceChanged || linkedStale) && action === 'UPDATE_ARTICLE') {
      blockers.push({
        code: 'RESEARCH_STALE',
        message: 'Research/sources need refresh before a safe update',
        resolvesWith: 'REFRESH_RESEARCH'
      });
      return result('BLOCKED', blockers, 'REFRESH_RESEARCH');
    }

    const canni = (ctx.signals || []).find((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH');
    if (canni && action === 'UPDATE_ARTICLE') {
      blockers.push({
        code: 'CANNIBALIZATION_RISK',
        message: 'Update may increase topic overlap — review first',
        resolvesWith: 'REVIEW_ARTICLE'
      });
      return result('REQUIRES_REVIEW', blockers, 'REVIEW_ARTICLE');
    }

    return result('AVAILABLE');
  }

  if (action === 'CREATE_ARTICLE') {
    if (gemini && (gemini.status === 'not_configured' || gemini.status === 'error')) {
      blockers.push({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: gemini.detail || 'Gemini not configured',
        resolvesWith: 'CONFIGURE_PROVIDER'
      });
      return result('BLOCKED', blockers, 'CONFIGURE_PROVIDER');
    }
    const canni = (ctx.signals || []).find((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH');
    if (canni) {
      blockers.push({
        code: 'CANNIBALIZATION_RISK',
        message: 'Severe cannibalization — review existing articles instead',
        resolvesWith: 'REVIEW_ARTICLE'
      });
      return result('REQUIRES_REVIEW', blockers, 'REVIEW_ARTICLE');
    }
    blockers.push({
      code: 'CREATE_VIA_STUDIO',
      message: 'Create article via Content Studio — Decision Engine recommends only'
    });
    return result('REQUIRES_REVIEW', blockers);
  }

  void webSearch;
  return result('AVAILABLE');
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
    case 'REVIEW_CONTENT':
      return 'REVIEW_ARTICLE';
    case 'CREATE_ARTICLE':
      return 'REVIEW_ARTICLE';
    case 'DEFER':
      return 'REVIEW_ARTICLE';
    default:
      return 'UPDATE_ARTICLE';
  }
}
