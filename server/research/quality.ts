import type { ResearchClaim, ResearchConflict, ResearchPlan, ResearchQualityGate, ResearchSourceDocument } from './types.js';

/**
 * Deterministic research quality gate before drafting.
 * Does not block every unknown general fact — only critical gaps / conflicts.
 */
export function assessResearchQuality(params: {
  plan: ResearchPlan;
  sources: ResearchSourceDocument[];
  claims: ResearchClaim[];
  conflicts: ResearchConflict[];
  verifiedEvidenceCount: number;
}): ResearchQualityGate {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  const usableSources = params.sources.filter((row) => row.status === 'ok' || row.status === 'cached');
  const unresolvedHigh = params.conflicts.filter(
    (row) => row.resolutionStatus === 'UNRESOLVED' && row.severity === 'high'
  );
  const highRiskUnsupported = params.claims.filter(
    (claim) => claim.highRisk && (claim.status === 'UNSUPPORTED' || claim.status === 'NEEDS_VERIFICATION')
  );
  const contradicted = params.claims.filter((claim) => claim.status === 'CONTRADICTED');

  if (params.verifiedEvidenceCount === 0 && params.plan.requiredFacts.length > 0) {
    blocking.push('هیچ مدرک تأییدشده‌ای برای موضوع تحقیق‌محور موجود نیست.');
  }
  if (unresolvedHigh.length > 0) {
    blocking.push(`${unresolvedHigh.length} تعارض حل‌نشدهٔ پرریسک بین منابع وجود دارد.`);
  }
  if (contradicted.length > 0) {
    blocking.push(`${contradicted.length} ادعای محصول با دادهٔ کاتالوگ در تضاد است.`);
  }
  if (
    params.plan.highRiskTopics.includes('safety') &&
    highRiskUnsupported.some((claim) => claim.type === 'SAFETY')
  ) {
    blocking.push('ادعای ایمنی بدون مدرک کافی وجود دارد.');
  }

  if (usableSources.length === 0) {
    warnings.push('هیچ منبع URL خارجی موفقی دریافت نشده است (جستجوی وب پیکربندی نشده).');
  }
  if (highRiskUnsupported.length > 0 && blocking.length === 0) {
    warnings.push(`${highRiskUnsupported.length} ادعای پرریسک هنوز نیاز به تأیید دارد.`);
  }
  if (params.sources.some((row) => row.freshness === 'STALE' && params.plan.freshnessRequirement === 'high')) {
    warnings.push('حداقل یک منبع برای موضوع با نیاز تازگی بالا، کهنه به‌نظر می‌رسد.');
  }
  if (params.verifiedEvidenceCount < 3) {
    warnings.push('پوشش مدارک تأییدشده کم است.');
  }

  let status: ResearchQualityGate['status'] = 'PASS';
  if (blocking.length) status = 'BLOCKED';
  else if (warnings.length) status = 'WARNING';

  if (status === 'PASS') reasons.push('مدارک کافی برای ادامهٔ بریف/نگارش وجود دارد.');
  if (status === 'WARNING') reasons.push(...warnings);
  if (status === 'BLOCKED') reasons.push(...blocking);

  return {
    status,
    reasons,
    blocking,
    warnings,
    assessedAt: new Date().toISOString()
  };
}
