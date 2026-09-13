import type {
  DecisionConfidence,
  DecisionRisk,
  DecisionScoreBreakdown,
  DecisionSignal,
  QualitativeImpact,
  SignalSeverity
} from './types.js';

/**
 * Decision score formula (v1):
 *
 *   final = (impact × confidence × urgency × riskAdjustment) / max(effort, 0.15)
 *
 * All components are 0–1 floats derived only from stored signals.
 * No Gemini. No invented ROI.
 *
 * - impact: max severity/strength of improvement-oriented signals
 * - confidence: agreement across independent signal sources
 * - urgency: CRITICAL/HIGH severity + freshness/decay pressure
 * - riskAdjustment: <1 when cannibalization / high-risk claims / blockers present
 * - effort: higher for UPDATE/CREATE; lower for SYNC/RETRY/CONFIGURE
 */
export function scoreDecision(params: {
  signals: DecisionSignal[];
  effortHint?: number;
  risk?: DecisionRisk;
}): DecisionScoreBreakdown {
  const { signals } = params;
  const impact = clamp(maxStrength(signals, ['CONTENT_DECAY', 'CONTENT_DECLINE', 'SOURCE_CHANGED', 'PERFORMANCE_OPPORTUNITY', 'SEO_ISSUE', 'STALE_RESEARCH', 'FAILED_OPERATION', 'PUBLISHING_BLOCKER', 'CONTENT_GAP']) || 0.35);
  const confidence = clamp(confidenceFromSignals(signals));
  const urgency = clamp(urgencyFromSignals(signals));
  const riskAdjustment = clamp(riskAdjustmentFrom(params.risk || riskFromSignals(signals), signals));
  const effort = clamp(params.effortHint ?? 0.45);
  const final = clamp((impact * confidence * urgency * riskAdjustment) / Math.max(effort, 0.15));

  return {
    impact: round2(impact),
    confidence: round2(confidence),
    urgency: round2(urgency),
    riskAdjustment: round2(riskAdjustment),
    effort: round2(effort),
    final: round2(final)
  };
}

export function qualitativeImpact(signals: DecisionSignal[]): QualitativeImpact {
  if (signals.some((s) => s.severity === 'CRITICAL' || (s.type === 'CONTENT_DECAY' && s.strength >= 0.8))) {
    return 'HIGH';
  }
  if (signals.some((s) => s.severity === 'HIGH' || s.type === 'SOURCE_CHANGED' || s.type === 'CONTENT_DECLINE')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function confidenceLabel(signals: DecisionSignal[]): DecisionConfidence {
  const sources = new Set(signals.map((s) => s.source.split('.')[0]));
  const strong = signals.filter((s) => s.strength >= 0.7).length;
  if (sources.size >= 2 && strong >= 2) return 'HIGH';
  if (sources.size >= 2 || strong >= 1) return 'MEDIUM';
  return 'LOW';
}

export function riskFromSignals(signals: DecisionSignal[]): DecisionRisk {
  if (signals.some((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH')) return 'HIGH';
  if (signals.some((s) => s.type === 'HIGH_RISK_CLAIM' || s.type === 'PUBLISHING_BLOCKER')) return 'HIGH';
  if (signals.some((s) => s.type === 'CANNIBALIZATION_RISK' || s.type === 'RESEARCH_CONFLICT')) return 'MEDIUM';
  return 'LOW';
}

export function priorityFromScore(score: number, signals: DecisionSignal[]): SignalSeverity {
  if (signals.some((s) => s.severity === 'CRITICAL')) return 'CRITICAL';
  if (score >= 0.75 || signals.some((s) => s.severity === 'HIGH' && s.strength >= 0.8)) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  if (score >= 0.25) return 'LOW';
  return 'INFO';
}

function maxStrength(signals: DecisionSignal[], types: string[]): number {
  let max = 0;
  for (const s of signals) {
    if (types.includes(s.type)) max = Math.max(max, s.strength);
  }
  return max;
}

function confidenceFromSignals(signals: DecisionSignal[]): number {
  if (!signals.length) return 0.2;
  const sources = new Set(signals.map((s) => s.source.split('.')[0]));
  const avg = signals.reduce((a, s) => a + s.strength, 0) / signals.length;
  return Math.min(1, avg * 0.7 + sources.size * 0.15);
}

function urgencyFromSignals(signals: DecisionSignal[]): number {
  let u = 0.3;
  for (const s of signals) {
    if (s.severity === 'CRITICAL') u = Math.max(u, 1);
    else if (s.severity === 'HIGH') u = Math.max(u, 0.85);
    else if (s.severity === 'MEDIUM') u = Math.max(u, 0.55);
    if (s.type === 'CONTENT_DECAY' || s.type === 'FAILED_OPERATION' || s.type === 'PUBLISHING_BLOCKER') {
      u = Math.max(u, 0.9);
    }
  }
  return u;
}

function riskAdjustmentFrom(risk: DecisionRisk, signals: DecisionSignal[]): number {
  let adj = risk === 'HIGH' ? 0.55 : risk === 'MEDIUM' ? 0.75 : 1;
  if (signals.some((s) => s.type === 'CANNIBALIZATION_RISK' && s.severity === 'HIGH')) {
    adj = Math.min(adj, 0.45);
  }
  return adj;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Effort hints by action (0–1, higher = more work). */
export const ACTION_EFFORT: Record<string, number> = {
  CONFIGURE_PROVIDER: 0.25,
  RETRY_OPERATION: 0.2,
  SYNC_PERFORMANCE: 0.3,
  SYNC_CONTENT: 0.35,
  REFRESH_RESEARCH: 0.4,
  RESEARCH: 0.45,
  REVIEW_SOURCE: 0.35,
  REVIEW_ARTICLE: 0.4,
  FIX_SEO: 0.5,
  ADD_INTERNAL_LINKS: 0.45,
  UPDATE_ARTICLE: 0.65,
  CREATE_ARTICLE: 0.85
};
