import type { EvidenceSource, ScoreBreakdown, ConfidenceLevel } from './types.js';
import type { CannibalizationResult } from './duplication.js';

export function scoreOpportunity(params: {
  businessValue: number;
  businessSource: EvidenceSource;
  trafficBand: 'High' | 'Medium' | 'Low';
  conversionPotential: number;
  conversionSource: EvidenceSource;
  gapStrength: number;
  productRelevance: number;
  productSource: EvidenceSource;
  clusterAuthority: number;
  linkingValue: number;
  seasonalityBoost: number;
  cannibalization: CannibalizationResult;
}): ScoreBreakdown {
  const trafficValue = params.trafficBand === 'High' ? 9 : params.trafficBand === 'Medium' ? 6 : 3;
  const canniPenalty =
    params.cannibalization.cannibalizationRisk === 'severe'
      ? 18
      : params.cannibalization.cannibalizationRisk === 'moderate'
        ? 10
        : params.cannibalization.cannibalizationRisk === 'low'
          ? 4
          : 0;

  const factors: ScoreBreakdown['factors'] = [
    factor('business', 'ارزش تجاری', params.businessValue, 1.5, params.businessSource, params.businessSource === 'observed' ? 'high' : 'medium', 'Product/cluster commercial relevance'),
    factor('traffic', 'پتانسیل ترافیک', trafficValue, 1.0, 'estimated', 'low', 'No keyword-volume provider; AI/heuristic band only'),
    factor('conversion', 'پتانسیل تبدیل', params.conversionPotential, 1.2, params.conversionSource, 'medium', 'Intent + product coverage'),
    factor('gap', 'شکاف محتوا', params.gapStrength, 1.5, 'calculated', 'high', 'Missing cluster coverage / intents'),
    factor('authority', 'ارزش اعتبار خوشه', params.clusterAuthority, 1.0, 'calculated', 'high', 'Cluster health and sibling count'),
    factor('linking', 'ارزش لینک داخلی', params.linkingValue, 0.8, 'calculated', 'high', 'Number of related articles that could link here'),
    factor('product', 'ارتباط محصول', params.productRelevance, 1.2, params.productSource, params.productSource === 'observed' ? 'high' : 'medium', 'Catalog or mentioned products'),
    factor('season', 'فصلی بودن', params.seasonalityBoost, 0.4, 'inferred', 'low', 'Calendar heuristic, not search-volume seasonality'),
    factor('cannibalization', 'جریمه هم‌نوع‌خواری', -canniPenalty, 1, 'calculated', 'high', params.cannibalization.decisionReason)
  ];

  const score = Math.max(
    5,
    Math.min(
      99,
      Math.round(factors.reduce((s, f) => s + f.contribution, 0))
    )
  );

  return {
    score,
    factors,
    reason: `Priority ${score} from observed/calculated site evidence; traffic is estimated, never a Google volume.`
  };
}

function factor(
  id: string,
  label: string,
  value: number,
  weight: number,
  sourceType: EvidenceSource,
  confidence: ConfidenceLevel,
  evidence: string
): ScoreBreakdown['factors'][number] {
  return {
    id,
    label,
    value,
    weight,
    contribution: value * weight,
    sourceType,
    confidence,
    evidence
  };
}

export function seasonalityBoost(title: string, now = new Date()): number {
  const month = now.getMonth();
  const winter = /زمستان|برف|چهار فصل|کیسه خواب|پر/.test(title);
  const summer = /تابستان|کوهپیمایی|آب|هیدرات/.test(title);
  if (winter && (month >= 9 || month <= 1)) return 6;
  if (summer && month >= 3 && month <= 7) return 6;
  return 2;
}
