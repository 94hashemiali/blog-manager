import type {
  Decision,
  DecisionAction,
  DecisionAlternative,
  DecisionExplanation,
  DecisionSignal,
  FeasibilityStatus
} from './types.js';

export function buildExplanation(params: {
  action: DecisionAction;
  signals: DecisionSignal[];
  blockers: Array<{ code: string; message: string }>;
  redirected?: boolean;
  alternatives?: DecisionAlternative[];
  feasibilityStatus?: FeasibilityStatus;
}): DecisionExplanation {
  const { action, signals, blockers, redirected, alternatives = [], feasibilityStatus } = params;
  const top = signals.slice(0, 3).map((s) => `${s.type} (${s.severity})`).join(', ') || 'stored operational signals';

  return {
    whyThis: `Selected ${action} because signals indicate: ${top}.`,
    whyNow: whyNow(signals),
    whatHappensIfExecuted: whatHappens(action),
    whatWillNotHappen:
      'Will NOT publish to WordPress automatically. Will NOT invent Search Console metrics. Human approval remains the publish boundary.',
    expectedBenefit: expectedBenefit(action, signals, redirected),
    alternatives: alternatives.slice(0, 3),
    whyRejectedHigherRisk: whyRejected(action, signals, blockers, feasibilityStatus)
  };
}

function whyNow(signals: DecisionSignal[]): string {
  const conflict = signals.find((s) => s.type === 'RESEARCH_CONFLICT' && s.severity === 'HIGH');
  if (conflict) return `Unresolved research conflict blocks unsafe updates: ${conflict.evidence[0] || conflict.entityId}.`;
  const decay = signals.find((s) => s.type === 'CONTENT_DECAY' || s.type === 'CONTENT_DECLINE');
  if (decay) return `Article shows ${decay.type}: ${decay.evidence[0] || 'decline signals present'}.`;
  const src = signals.find((s) => s.type === 'SOURCE_CHANGED');
  if (src) return `Source change detected: ${src.evidence[0] || src.entityId}.`;
  const stale = signals.find((s) => s.type === 'STALE_RESEARCH');
  if (stale) return `Research session is stale/invalidated.`;
  const fail = signals.find((s) => s.type === 'FAILED_OPERATION');
  if (fail) return `Operation failed and needs attention.`;
  const seo = signals.find((s) => s.type === 'SEO_ISSUE');
  if (seo) return `SEO checks reported issues.`;
  return 'Current persisted signals elevate this action above lower-priority work.';
}

function whatHappens(action: DecisionAction): string {
  switch (action) {
    case 'UPDATE_ARTICLE':
    case 'FIX_SEO':
    case 'ADD_INTERNAL_LINKS':
      return 'Creates a CONTENT_UPDATE production job that stops at human review.';
    case 'REFRESH_RESEARCH':
    case 'RESEARCH':
      return 'Queues a RESEARCH job for the topic/session. Does not rewrite articles.';
    case 'SYNC_PERFORMANCE':
      return 'Queues PERFORMANCE_SYNC to recompute stored metrics from available providers.';
    case 'SYNC_CONTENT':
      return 'Queues INTELLIGENCE_SYNC to refresh the content index.';
    case 'RETRY_OPERATION':
      return 'Retries the failed ops job if safe.';
    case 'CONFIGURE_PROVIDER':
      return 'Opens provider settings — no job created.';
    case 'REVIEW_SOURCE':
      return 'Opens impact/research context for human review.';
    case 'REVIEW_ARTICLE':
    case 'REVIEW_CONTENT':
      return 'Flags article for human review without auto-draft.';
    case 'CREATE_ARTICLE':
      return 'Recommends creating via Content Studio (no auto-create).';
    case 'DEFER':
      return 'No executable action — wait for more evidence or clear blockers.';
    default:
      return 'Creates the corresponding canonical job or navigation action.';
  }
}

function expectedBenefit(
  action: DecisionAction,
  signals: DecisionSignal[],
  redirected?: boolean
): string {
  if (action === 'DEFER') return 'Avoids acting on insufficient or conflicting evidence.';
  if (redirected) {
    return 'Clears a prerequisite so a higher-value follow-up action becomes feasible.';
  }
  if (action === 'UPDATE_ARTICLE' || action === 'FIX_SEO') {
    return 'Improve freshness and address detected decay/SEO signals. No fabricated traffic ROI.';
  }
  if (action === 'REFRESH_RESEARCH') {
    return 'Restore evidence validity before content changes.';
  }
  if (action === 'RETRY_OPERATION') {
    return 'Recover a failed operation so downstream work can continue.';
  }
  if (signals.some((s) => s.type === 'SOURCE_CHANGED')) {
    return 'Align content with changed source evidence.';
  }
  return 'Reduce operational risk from currently detected signals.';
}

function whyRejected(
  action: DecisionAction,
  signals: DecisionSignal[],
  blockers: Array<{ code: string; message: string }>,
  status?: FeasibilityStatus
): string | undefined {
  if (blockers.some((b) => b.code === 'RESEARCH_CONFLICT' || b.code === 'CANNIBALIZATION_RISK')) {
    return `Higher-risk UPDATE rejected: ${blockers.map((b) => b.message).join('; ')}`;
  }
  if (status === 'INSUFFICIENT_DATA') {
    return 'Deferred because evidence is insufficient for a confident action.';
  }
  if (action === 'DEFER') {
    return 'No safe executable action given current signals.';
  }
  if (signals.some((s) => s.type === 'RESEARCH_CONFLICT' && s.severity === 'HIGH') && action !== 'UPDATE_ARTICLE') {
    return 'Update blocked because evidence conflict is unresolved.';
  }
  return undefined;
}

export function summarizeDecision(d: Decision): string {
  return `${d.recommendedAction} score=${d.score} confidence=${d.confidence} feasibility=${d.feasibilityStatus} blockers=${d.blockers.length}`;
}
