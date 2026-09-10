import crypto from 'crypto';
import type { ConfidenceLevel } from '../intelligence/types.js';
import { tokenize, tokenOverlapCount } from '../intelligence/text.js';
import type {
  EvidenceCoverage,
  EvidenceItem,
  EvidenceSourceType,
  EvidenceStatus
} from './types.js';

/** Source types the application can actually trace back to real data. */
const TRUSTED_SOURCES: EvidenceSourceType[] = [
  'wordpress',
  'product_catalog',
  'user_input',
  'official_source',
  'external_source'
];

export function isTrustedSource(sourceType: EvidenceSourceType): boolean {
  return TRUSTED_SOURCES.includes(sourceType);
}

export function evidenceId(siteId: string, claim: string): string {
  return `ev-${crypto.createHash('sha1').update(`${siteId}::${claim}`).digest('hex').slice(0, 12)}`;
}

/**
 * Builds an evidence item. AI inference can never be marked verified, so the
 * status is derived from the source type rather than taken from the caller.
 */
export function addEvidence(params: {
  siteId: string;
  claim: string;
  source: string;
  sourceType: EvidenceSourceType;
  confidence?: ConfidenceLevel;
  notes?: string;
}): EvidenceItem {
  const trusted = isTrustedSource(params.sourceType);
  const status: EvidenceStatus = trusted
    ? 'VERIFIED'
    : params.sourceType === 'ai_inference'
      ? 'NEEDS_VERIFICATION'
      : 'UNKNOWN';
  const confidence: ConfidenceLevel = trusted ? params.confidence || 'high' : 'low';

  return {
    id: evidenceId(params.siteId, params.claim),
    siteId: params.siteId,
    claim: params.claim.trim(),
    source: params.source,
    sourceType: params.sourceType,
    confidence,
    verified: trusted,
    status,
    notes: params.notes
  };
}

export function mergeEvidence(existing: EvidenceItem[], incoming: EvidenceItem[]): EvidenceItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const current = byId.get(item.id);
    // A verified item is never downgraded by a later inference about the same claim.
    if (!current || (!current.verified && item.verified)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

export function groupEvidenceByClaim(items: EvidenceItem[]): Map<string, EvidenceItem[]> {
  const grouped = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const key = item.claim.trim().toLowerCase();
    const bucket = grouped.get(key);
    if (bucket) bucket.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

/**
 * Finds the evidence item that best supports a claim. Matching is lexical
 * (shared significant tokens), never AI-assisted, so it is deterministic.
 */
export function findSupportingEvidence(claim: string, items: EvidenceItem[]): EvidenceItem | undefined {
  const claimTokens = tokenize(claim);
  if (claimTokens.size === 0) return undefined;
  let best: { item: EvidenceItem; overlap: number } | undefined;
  for (const item of items) {
    const overlap = tokenOverlapCount(claimTokens, tokenize(item.claim));
    const required = Math.min(3, Math.max(2, Math.ceil(claimTokens.size * 0.4)));
    if (overlap < required) continue;
    if (!best || overlap > best.overlap || (overlap === best.overlap && item.verified && !best.item.verified)) {
      best = { item, overlap };
    }
  }
  return best?.item;
}

export function detectUnsupportedClaims(claims: string[], items: EvidenceItem[]): string[] {
  return claims.filter((claim) => {
    const hit = findSupportingEvidence(claim, items);
    return !hit || !hit.verified;
  });
}

/** Claims that would be dangerous to publish unverified: numbers, prices, specs. */
const DIGIT = '[0-9۰-۹]';
const HIGH_RISK_PATTERNS = [
  new RegExp(`${DIGIT}+\\s*(کیلو|گرم|kg|g\\b|لیتر|liter|litre)`, 'i'),
  new RegExp(`${DIGIT}+\\s*(تومان|ریال|دلار|usd|\\$)`, 'i'),
  new RegExp(`${DIGIT}+\\s*(درجه|°|celsius)`, 'i'),
  new RegExp(`${DIGIT}+\\s*(درصد|٪|%)`),
  new RegExp(`${DIGIT}{4}\\s*(میلادی|ad)?`),
  /استاندارد\s*[a-z]{2,}/i,
  /\b(iso|en|astm|ce)\s*\d+/i
];

export function isHighRiskClaim(claim: string): boolean {
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(claim));
}

export function calculateEvidenceCoverage(claims: string[], items: EvidenceItem[]): EvidenceCoverage {
  const unique = [...new Set(claims.map((claim) => claim.trim()).filter(Boolean))];
  let supported = 0;
  let needsVerification = 0;
  const unsupported: string[] = [];

  for (const claim of unique) {
    const hit = findSupportingEvidence(claim, items);
    if (hit?.verified) supported++;
    else if (hit) needsVerification++;
    else unsupported.push(claim);
  }

  const coverageRatio = unique.length === 0 ? 1 : supported / unique.length;
  const highRiskClaims = unique.filter(
    (claim) => isHighRiskClaim(claim) && !findSupportingEvidence(claim, items)?.verified
  );

  const confidence: ConfidenceLevel =
    coverageRatio >= 0.7 && highRiskClaims.length === 0
      ? 'high'
      : coverageRatio >= 0.4
        ? 'medium'
        : 'low';

  return {
    totalClaims: unique.length,
    supportedClaims: supported,
    unsupportedClaims: unsupported.length,
    needsVerification,
    coverageRatio: Math.round(coverageRatio * 100) / 100,
    highRiskClaims,
    confidence
  };
}
