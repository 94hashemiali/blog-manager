import type { ResearchSession, ResearchSessionStatus } from '../research/types.js';

export type ResearchFreshnessClass = 'FRESH' | 'AGING' | 'STALE' | 'INVALIDATED';

/** Configurable TTL (ms) by research kind / default. */
export const RESEARCH_TTL_MS: Record<string, number> = {
  default: 7 * 24 * 60 * 60 * 1000,
  safety: 3 * 24 * 60 * 60 * 1000,
  product: 5 * 24 * 60 * 60 * 1000
};

const AGING_RATIO = 0.6;

function ttlForSession(session: ResearchSession): number {
  const planTopics = session.plan?.highRiskTopics || [];
  if (planTopics.includes('safety')) return RESEARCH_TTL_MS.safety;
  if (planTopics.some((t) => t.includes('product') || t.includes('price') || t.includes('weight'))) {
    return RESEARCH_TTL_MS.product;
  }
  return RESEARCH_TTL_MS.default;
}

/**
 * Deterministic freshness class from session status + age vs TTL.
 * INVALIDATED / STALE statuses win over age rules.
 */
export function classifyResearchFreshness(
  session: ResearchSession,
  nowMs = Date.now()
): { class: ResearchFreshnessClass; ageMs: number; ttlMs: number; reasons: string[] } {
  const reasons: string[] = [];
  const updated = Date.parse(session.updatedAt || session.createdAt || '');
  const ageMs = Number.isFinite(updated) ? Math.max(0, nowMs - updated) : 0;
  const ttlMs = ttlForSession(session);

  if (session.status === 'INVALIDATED') {
    reasons.push('status=INVALIDATED');
    return { class: 'INVALIDATED', ageMs, ttlMs, reasons };
  }
  if (session.status === 'STALE') {
    reasons.push('status=STALE');
    return { class: 'STALE', ageMs, ttlMs, reasons };
  }

  if (ageMs >= ttlMs) {
    reasons.push(`age ${Math.round(ageMs / 86400000)}d >= TTL ${Math.round(ttlMs / 86400000)}d`);
    return { class: 'STALE', ageMs, ttlMs, reasons };
  }
  if (ageMs >= ttlMs * AGING_RATIO) {
    reasons.push(`age approaching TTL (${Math.round((ageMs / ttlMs) * 100)}%)`);
    return { class: 'AGING', ageMs, ttlMs, reasons };
  }

  reasons.push(`within TTL (${session.status as ResearchSessionStatus})`);
  return { class: 'FRESH', ageMs, ttlMs, reasons };
}

/** Mark READY sessions past TTL as STALE candidates (does not mutate store). */
export function sessionsNeedingRefresh(sessions: ResearchSession[]): ResearchSession[] {
  return sessions.filter((s) => {
    const { class: cls } = classifyResearchFreshness(s);
    return cls === 'STALE' || cls === 'INVALIDATED';
  });
}
