import type { ResearchClaim, ResearchSourceDocument } from '../research/types.js';

export type ClaimRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Deterministic claim risk — no LLM judgment.
 * Factors: claim type, evidence support, source quality, conflict, freshness.
 */
export function assessClaimRisk(params: {
  claim: ResearchClaim;
  sources?: ResearchSourceDocument[];
  hasConflict?: boolean;
}): { level: ClaimRiskLevel; reasons: string[] } {
  const { claim, sources = [], hasConflict = false } = params;
  const reasons: string[] = [];
  let score = 0;

  if (claim.type === 'SAFETY') {
    score += 40;
    reasons.push('safety claim');
  } else if (claim.type === 'PRODUCT_SPEC' || claim.type === 'PRICE') {
    score += 25;
    reasons.push(`type=${claim.type}`);
  } else if (claim.highRisk) {
    score += 30;
    reasons.push('marked highRisk');
  }

  if (claim.status === 'CONTRADICTED') {
    score += 40;
    reasons.push('contradicted');
  } else if (claim.status === 'UNSUPPORTED') {
    score += 35;
    reasons.push('unsupported');
  } else if (claim.status === 'NEEDS_VERIFICATION') {
    score += 20;
    reasons.push('needs verification');
  } else if (claim.status === 'SUPPORTED') {
    score -= 15;
    reasons.push('supported');
  }

  if (hasConflict) {
    score += 20;
    reasons.push('conflict present');
  }

  const linked = sources.filter(
    (s) =>
      (claim.sourceIds || []).includes(s.id) ||
      (claim.evidenceIds || []).some((eid) => s.id === eid || s.url === eid)
  );
  const staleLinked = linked.filter((s) => s.freshness === 'STALE');
  if (staleLinked.length) {
    score += 15;
    reasons.push(`${staleLinked.length} stale source(s)`);
  }
  if ((claim.evidenceIds || []).length === 0 && claim.status !== 'SUPPORTED') {
    score += 15;
    reasons.push('no evidence ids');
  }

  const level: ClaimRiskLevel =
    score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';

  return { level, reasons };
}

export function isAttentionWorthyClaimRisk(level: ClaimRiskLevel): boolean {
  return level === 'HIGH' || level === 'CRITICAL';
}
