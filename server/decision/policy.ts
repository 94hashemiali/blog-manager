import type { AutomationPolicy, Decision, DecisionAction } from './types.js';
import { checkActionFeasibility } from './actions.js';
import { executeRecommendation } from '../operations/execute.js';
import {
  upsertRecommendation,
  recommendationDedupeKey
} from '../operations/recommendations.js';
import type { AttentionAction, RecommendationType } from '../operations/types.js';
import { mapActionToRecommendationType } from './actions.js';
import { updateDecisionStatus } from './store.js';

/**
 * Apply automation policy to a decision.
 * Decision Engine chooses WHAT; policy chooses WHETHER to auto-execute.
 * Never publishes.
 */
export function applyPolicyToDecision(
  siteId: string,
  decision: Decision,
  policy: AutomationPolicy
): {
  outcome: 'ignored' | 'recommended' | 'executed' | 'blocked';
  recommendationId?: string;
  jobId?: string;
  message: string;
} {
  if (policy === 'MONITOR_ONLY') {
    return { outcome: 'ignored', message: 'MONITOR_ONLY — signal recorded, no recommendation' };
  }

  const recType = mapActionToRecommendationType(decision.recommendedAction) as RecommendationType;
  const suggested = suggestedAttentionAction(decision.recommendedAction);

  const { recommendation, created } = upsertRecommendation({
    siteId,
    type: recType,
    priority: decision.priority,
    title: decision.title,
    explanation: [
      decision.explanation.whyThis,
      decision.explanation.whyNow,
      `score=${decision.score} confidence=${decision.confidence}`
    ].join(' '),
    entityId: decision.entityId,
    articleId: decision.articleId,
    suggestedAction: suggested,
    dedupeKey: recommendationDedupeKey({
      siteId,
      type: recType,
      entityId: decision.entityId || (decision.articleId != null ? String(decision.articleId) : undefined),
      reasonCategory: `DECISION_${decision.recommendedAction}`
    }),
    metadata: {
      decisionId: decision.id,
      decisionEngineVersion: decision.decisionEngineVersion,
      score: decision.score,
      scoreBreakdown: decision.scoreBreakdown,
      signals: decision.signals.map((s) => s.type),
      blockers: decision.blockers,
      expectedImpact: decision.expectedImpact,
      opsJobType:
        decision.recommendedAction === 'SYNC_PERFORMANCE' ? 'PERFORMANCE_SYNC' : undefined
    }
  });

  updateDecisionStatus(siteId, decision.id, 'SELECTED', { recommendationId: recommendation.id });

  const wantsAuto =
    (policy === 'AUTO_RESEARCH' &&
      (decision.recommendedAction === 'REFRESH_RESEARCH' || decision.recommendedAction === 'RESEARCH')) ||
    (policy === 'AUTO_UPDATE_DRAFT' &&
      (decision.recommendedAction === 'UPDATE_ARTICLE' ||
        decision.recommendedAction === 'FIX_SEO' ||
        decision.recommendedAction === 'REFRESH_RESEARCH' ||
        decision.recommendedAction === 'RESEARCH'));

  if (policy === 'APPROVAL_REQUIRED' || policy === 'RECOMMEND' || !wantsAuto) {
    return {
      outcome: 'recommended',
      recommendationId: recommendation.id,
      message: created ? 'Recommendation created' : 'Recommendation already open'
    };
  }

  const feasibility = checkActionFeasibility(siteId, decision.recommendedAction, {
    articleId: decision.articleId,
    entityId: decision.entityId,
    signals: decision.signals
  });
  if (!feasibility.feasible) {
    return {
      outcome: 'blocked',
      recommendationId: recommendation.id,
      message: feasibility.blockers.map((b) => b.message).join('; ') || 'Action not feasible'
    };
  }

  try {
    const result = executeRecommendation(siteId, recommendation.id);
    updateDecisionStatus(siteId, decision.id, 'EXECUTING', { recommendationId: recommendation.id });
    return {
      outcome: 'executed',
      recommendationId: recommendation.id,
      jobId: result.opsJobId,
      message: result.message
    };
  } catch (err: any) {
    return {
      outcome: 'blocked',
      recommendationId: recommendation.id,
      message: err?.message || 'Execute failed'
    };
  }
}

function suggestedAttentionAction(action: DecisionAction): AttentionAction {
  switch (action) {
    case 'REFRESH_RESEARCH':
    case 'RESEARCH':
      return 'RESEARCH';
    case 'UPDATE_ARTICLE':
    case 'FIX_SEO':
    case 'ADD_INTERNAL_LINKS':
      return 'UPDATE';
    case 'SYNC_CONTENT':
    case 'SYNC_PERFORMANCE':
      return 'SYNC';
    case 'CONFIGURE_PROVIDER':
      return 'CONFIGURE';
    case 'RETRY_OPERATION':
      return 'RETRY';
    default:
      return 'REVIEW';
  }
}

/** Materialize top decisions into recommendations (RECOMMEND policy). */
export function materializeRecommendationsFromDecisions(
  siteId: string,
  decisions: Decision[],
  limit = 10
): string[] {
  const ids: string[] = [];
  for (const d of decisions.slice(0, limit)) {
    const result = applyPolicyToDecision(siteId, d, 'RECOMMEND');
    if (result.recommendationId) ids.push(result.recommendationId);
  }
  return ids;
}
