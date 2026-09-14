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
  prerequisites?: string[];
}): DecisionExplanation {
  const {
    action,
    signals,
    blockers,
    redirected,
    alternatives = [],
    feasibilityStatus,
    prerequisites = []
  } = params;
  const top =
    signals.slice(0, 3).map((s) => `${s.type} (${s.severity})`).join(', ') ||
    'stored operational signals';
  const reasons = buildReasons(action, signals, redirected);
  const evidence = signals.flatMap((s) => s.evidence).slice(0, 8);
  const summary = buildSummary(action, signals, redirected);
  const whyThis = `Selected ${action} because signals indicate: ${top}.`;
  const whyNowText = whyNow(signals);

  return {
    summary,
    reasons,
    evidence,
    blockers: blockers.map((b) => b.message),
    prerequisites,
    alternatives: alternatives.slice(0, 3),
    whyThis,
    whyNow: whyNowText,
    whatHappensIfExecuted: whatHappens(action),
    whatWillNotHappen:
      'Will NOT publish to WordPress automatically. Will NOT invent Search Console metrics. Human approval remains the publish boundary.',
    expectedBenefit: expectedBenefit(action, signals, redirected),
    whyRejectedHigherRisk: whyRejected(action, signals, blockers, feasibilityStatus)
  };
}

/** Spec API: structured explanation from a Decision. */
export function explainDecision(decision: Decision): {
  summary: string;
  reasons: string[];
  evidence: string[];
  blockers: string[];
  prerequisites: string[];
  alternatives: DecisionAlternative[];
  score: number;
  confidence: string;
  feasibility: FeasibilityStatus;
} {
  const explanation =
    decision.explanation?.summary
      ? decision.explanation
      : buildExplanation({
          action: decision.recommendedAction,
          signals: decision.signals,
          blockers: decision.blockers,
          feasibilityStatus: decision.feasibilityStatus,
          alternatives: decision.explanation?.alternatives || []
        });

  return {
    summary: explanation.summary,
    reasons: explanation.reasons.length ? explanation.reasons : decision.reasons,
    evidence: explanation.evidence.length
      ? explanation.evidence
      : decision.signals.flatMap((s) => s.evidence).slice(0, 8),
    blockers: explanation.blockers.length
      ? explanation.blockers
      : decision.blockers.map((b) => b.message),
    prerequisites: explanation.prerequisites,
    alternatives: explanation.alternatives,
    score: decision.score,
    confidence: decision.confidence,
    feasibility: decision.feasibilityStatus
  };
}

function buildSummary(
  action: DecisionAction,
  signals: DecisionSignal[],
  redirected?: boolean
): string {
  if (action === 'UPDATE_ARTICLE') {
    return redirected
      ? 'Prerequisite cleared path points to updating an existing article.'
      : 'Update the existing article instead of creating a new article.';
  }
  if (action === 'CREATE_ARTICLE') {
    return 'Create a new article — no existing coverage is a better fit.';
  }
  if (action === 'DEFER') {
    return 'Defer action — evidence is insufficient for a reliable decision.';
  }
  if (action === 'REFRESH_RESEARCH') {
    return 'Refresh research before changing content.';
  }
  if (action === 'REVIEW_SOURCE') {
    return 'Review source/evidence conflict before any content update.';
  }
  if (action === 'CONFIGURE_PROVIDER') {
    return 'Configure a required provider before automated work can proceed.';
  }
  if (action === 'RETRY_OPERATION') {
    return 'Retry a failed or recovery-required operation.';
  }
  void signals;
  return `Recommended action: ${action}.`;
}

function buildReasons(
  action: DecisionAction,
  signals: DecisionSignal[],
  redirected?: boolean
): string[] {
  const reasons: string[] = [];
  if (action === 'UPDATE_ARTICLE') {
    reasons.push('Existing article already covers the topic');
    if (signals.some((s) => s.type === 'CONTENT_DECAY' || s.type === 'STALE_CONTENT')) {
      reasons.push('Content is stale or decaying');
    }
    if (signals.some((s) => s.type === 'PERFORMANCE_OPPORTUNITY' || s.type === 'CONTENT_GAP')) {
      reasons.push('Update opportunity exists');
    }
    if (!signals.some((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH')) {
      reasons.push('No critical cannibalization conflict');
    }
  } else if (action === 'CREATE_ARTICLE') {
    reasons.push('Content gap with no suitable existing article');
    if (!signals.some((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH')) {
      reasons.push('Cannibalization risk is not severe');
    }
  } else if (action === 'DEFER') {
    reasons.push('Insufficient evidence for a confident action');
  } else {
    for (const s of signals.slice(0, 4)) {
      reasons.push(`${s.type}: ${s.evidence[0] || s.severity}`);
    }
  }
  if (redirected) reasons.push('Primary action redirected to a safer prerequisite');
  return reasons.slice(0, 6);
}

function whyNow(signals: DecisionSignal[]): string {
  const conflict = signals.find((s) => s.type === 'RESEARCH_CONFLICT' && s.severity === 'HIGH');
  if (conflict) {
    return `Unresolved research conflict blocks unsafe updates: ${conflict.evidence[0] || conflict.entityId}.`;
  }
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
  const gap = signals.find((s) => s.type === 'CONTENT_GAP');
  if (gap) return `Content gap: ${gap.evidence[0] || gap.entityId}.`;
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
  if (
    signals.some((s) => s.type === 'RESEARCH_CONFLICT' && s.severity === 'HIGH') &&
    action !== 'UPDATE_ARTICLE'
  ) {
    return 'Update blocked because evidence conflict is unresolved.';
  }
  return undefined;
}

export function summarizeDecision(d: Decision): string {
  return `${d.recommendedAction} score=${d.score} confidence=${d.confidence} feasibility=${d.feasibilityStatus} blockers=${d.blockers.length}`;
}
