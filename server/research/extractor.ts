import crypto from 'crypto';
import type { ExtractedEvidence, ResearchSourceDocument } from './types.js';

function evidenceId(siteId: string, sourceId: string, claim: string): string {
  return `xev-${crypto.createHash('sha1').update(`${siteId}::${sourceId}::${claim}`).digest('hex').slice(0, 12)}`;
}

/**
 * Deterministic extraction of evidence candidates from cleaned source text.
 * No Gemini — only sentence/number heuristics so fixtures stay stable.
 */
export function extractEvidenceFromSource(
  source: ResearchSourceDocument,
  options: { maxItems?: number } = {}
): ExtractedEvidence[] {
  if (source.status !== 'ok' && source.status !== 'cached') return [];
  const text = source.content || '';
  if (text.trim().length < 40) return [];

  const sentences = text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((row) => row.trim())
    .filter((row) => row.length >= 40 && row.length <= 400);

  const digit = /[0-9۰-۹]/;
  const useful = sentences.filter(
    (sentence) =>
      digit.test(sentence) ||
      /وزن|دما|استاندارد|کیلو|گرم|لیتر|نفر|ضدآب|ایزو|ISO|EN\s*\d+/i.test(sentence)
  );

  const picked = (useful.length ? useful : sentences).slice(0, options.maxItems ?? 8);
  return picked.map((sentence, index) => ({
    id: evidenceId(source.siteId, source.id, sentence),
    siteId: source.siteId,
    sourceId: source.id,
    claim: sentence,
    evidenceText: sentence,
    location: `paragraph≈${index + 1}`,
    confidence: source.sourceType === 'UNKNOWN' || source.sourceType === 'COMMUNITY' ? 'low' : 'medium',
    sourceType: source.sourceType,
    verified: ['PRODUCT_MANUFACTURER', 'GOVERNMENT', 'ACADEMIC', 'OFFICIAL_SOURCE', 'PRODUCT_CATALOG', 'WORDPRESS'].includes(
      source.sourceType
    )
  }));
}
