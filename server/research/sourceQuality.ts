import type { ResearchSourceDocument, SourceQualityAssessment } from './types.js';
import { authorityRank } from './types.js';

/**
 * Deterministic source quality signals — not invented domain authority scores.
 */
export function assessSourceQuality(source: ResearchSourceDocument): SourceQualityAssessment {
  const reasons: string[] = [];
  let score = authorityRank(source.sourceType);

  if (source.url.startsWith('https://')) {
    score += 5;
    reasons.push('HTTPS');
  } else {
    score -= 10;
    reasons.push('not HTTPS');
  }

  if (source.status !== 'ok' && source.status !== 'cached') {
    return { quality: 'unknown', confidence: 'low', reasons: [`fetch status=${source.status}`] };
  }

  if (source.freshness === 'STALE') {
    score -= 15;
    reasons.push('stale freshness');
  } else if (source.freshness === 'CURRENT') {
    score += 5;
    reasons.push('current freshness');
  } else if (source.freshness === 'UNKNOWN') {
    reasons.push('freshness unknown');
  }

  if ((source.content || '').length > 400) {
    score += 5;
    reasons.push('substantial extracted text');
  } else {
    score -= 5;
    reasons.push('thin extracted text');
  }

  if (source.isDemo) {
    return {
      quality: 'low',
      confidence: 'low',
      reasons: [...reasons, 'DEMO_DATA']
    };
  }

  reasons.push(`sourceType=${source.sourceType}`);

  if (score >= 85) return { quality: 'high', confidence: 'high', reasons };
  if (score >= 55) return { quality: 'medium', confidence: 'medium', reasons };
  if (score >= 25) return { quality: 'low', confidence: 'low', reasons };
  return { quality: 'unknown', confidence: 'low', reasons };
}

export function classifyClaimSupportStrength(params: {
  supportingSourceCount: number;
  bestQuality: SourceQualityAssessment['quality'];
  conflicted: boolean;
}): import('./types.js').ClaimSupportStrength {
  if (params.conflicted) return 'CONFLICTED';
  if (params.supportingSourceCount <= 0) return 'NONE';
  if (params.supportingSourceCount >= 2 && (params.bestQuality === 'high' || params.bestQuality === 'medium')) {
    return 'STRONG';
  }
  if (params.supportingSourceCount === 1 && params.bestQuality === 'high') return 'MODERATE';
  if (params.supportingSourceCount >= 1) return 'WEAK';
  return 'NONE';
}
