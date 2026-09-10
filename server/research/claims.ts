import crypto from 'crypto';
import { findSupportingEvidence, isHighRiskClaim } from '../content/evidence.js';
import { tokenize, tokenOverlapCount } from '../intelligence/text.js';
import type { EvidenceItem } from '../content/types.js';
import type { IndexedProduct } from '../intelligence/types.js';
import {
  authorityRank,
  type ClaimStatus,
  type ClaimType,
  type ExtractedEvidence,
  type ResearchClaim,
  type ResearchConflict,
  type ResearchSourceDocument
} from './types.js';

function claimId(siteId: string, text: string): string {
  return `cl-${crypto.createHash('sha1').update(`${siteId}::${text}`).digest('hex').slice(0, 12)}`;
}

function conflictId(siteId: string, a: string, b: string): string {
  return `cf-${crypto.createHash('sha1').update(`${siteId}::${a}::${b}`).digest('hex').slice(0, 12)}`;
}

export function classifyClaimType(text: string): ClaimType {
  if (/قیمت|تومان|ریال|دلار|\$/i.test(text)) return 'PRICE';
  if (/ایمنی|خطر|مرگ|خفگی|safety/i.test(text)) return 'SAFETY';
  if (/دما|درجه|°|کامفورت|لیمت/i.test(text)) return 'TECHNICAL';
  if (/وزن|kg|کیلو|گرم|ابعاد|ظرفیت/i.test(text)) return 'PRODUCT_SPEC';
  if (/۲۰\d{2}|19\d{2}|سال\s*۱۳/i.test(text)) return 'DATE';
  if (/مقایسه|در برابر|بهتر از/i.test(text)) return 'COMPARISON';
  if (/مطالعه|پژوهش|علمی/i.test(text)) return 'SCIENTIFIC';
  if (/به نظر|معمولاً|توصیه/i.test(text)) return 'OPINION';
  return 'GENERAL';
}

export function buildClaimsFromEvidence(params: {
  siteId: string;
  extracted: ExtractedEvidence[];
  packetEvidence: EvidenceItem[];
}): ResearchClaim[] {
  const claims: ResearchClaim[] = [];
  for (const item of params.extracted) {
    const type = classifyClaimType(item.claim);
    const status: ClaimStatus = item.verified
      ? 'SUPPORTED'
      : type === 'OPINION'
        ? 'OPINION'
        : 'NEEDS_VERIFICATION';
    claims.push({
      id: claimId(params.siteId, item.claim),
      siteId: params.siteId,
      text: item.claim,
      type,
      status,
      evidenceIds: [item.id],
      sourceIds: [item.sourceId],
      confidence: item.confidence,
      reason: item.verified
        ? `متکی بر منبع ${item.sourceType}`
        : 'مدرک استخراج‌شده هنوز در سطح تأیید کامل نیست.',
      highRisk: isHighRiskClaim(item.claim) || type === 'SAFETY' || type === 'PRODUCT_SPEC' || type === 'PRICE'
    });
  }

  // Important packet evidence that has no extracted twin still becomes a claim.
  for (const item of params.packetEvidence) {
    if (claims.some((claim) => claim.text === item.claim)) continue;
    const type = classifyClaimType(item.claim);
    claims.push({
      id: claimId(params.siteId, item.claim),
      siteId: params.siteId,
      text: item.claim,
      type,
      status: item.verified ? 'SUPPORTED' : item.sourceType === 'ai_inference' ? 'NEEDS_VERIFICATION' : 'UNSUPPORTED',
      evidenceIds: [item.id],
      sourceIds: [],
      confidence: item.confidence,
      reason: item.verified ? `منبع ${item.sourceType}` : 'بدون منبع تأییدشدهٔ خارجی',
      highRisk: isHighRiskClaim(item.claim)
    });
  }

  return claims;
}

/**
 * Detect numeric/spec disagreements between evidence snippets. Does not ask Gemini.
 */
export function detectConflicts(params: {
  siteId: string;
  extracted: ExtractedEvidence[];
  sources: ResearchSourceDocument[];
}): ResearchConflict[] {
  const conflicts: ResearchConflict[] = [];
  const numberRe = /([0-9۰-۹]+(?:[.,][0-9۰-۹]+)?)\s*(کیلوگرم|کیلو|گرم|kg|g|لیتر|نفر|درجه|°C|°)/gi;

  for (let i = 0; i < params.extracted.length; i += 1) {
    for (let j = i + 1; j < params.extracted.length; j += 1) {
      const a = params.extracted[i];
      const b = params.extracted[j];
      if (a.sourceId === b.sourceId) continue;
      const overlap = tokenOverlapCount(tokenize(a.claim), tokenize(b.claim));
      if (overlap < 2) continue;

      const numsA = [...a.claim.matchAll(numberRe)].map((m) => `${m[1]}${m[2]}`);
      const numsB = [...b.claim.matchAll(numberRe)].map((m) => `${m[1]}${m[2]}`);
      if (!numsA.length || !numsB.length) continue;
      if (numsA.some((n) => numsB.includes(n))) continue;

      const sourceA = params.sources.find((row) => row.id === a.sourceId);
      const sourceB = params.sources.find((row) => row.id === b.sourceId);
      const rankA = authorityRank(sourceA?.sourceType || 'UNKNOWN');
      const rankB = authorityRank(sourceB?.sourceType || 'UNKNOWN');

      let resolutionStatus: ResearchConflict['resolutionStatus'] = 'UNRESOLVED';
      if (Math.abs(rankA - rankB) >= 20) {
        resolutionStatus = 'RESOLVED_BY_AUTHORITY';
      }

      conflicts.push({
        id: conflictId(params.siteId, a.id, b.id),
        siteId: params.siteId,
        claim: a.claim.slice(0, 120),
        sourceAId: a.sourceId,
        sourceBId: b.sourceId,
        evidenceAId: a.id,
        evidenceBId: b.id,
        difference: `مقادیر متفاوت: ${numsA.join(', ')} در برابر ${numsB.join(', ')}`,
        severity: a.verified || b.verified ? 'high' : 'medium',
        resolutionStatus
      });
    }
  }
  return conflicts.slice(0, 20);
}

/**
 * Compare draft-like claim text against WooCommerce product attributes/price.
 */
export function validateProductClaims(params: {
  siteId: string;
  claims: string[];
  products: IndexedProduct[];
  evidence: EvidenceItem[];
}): ResearchClaim[] {
  const out: ResearchClaim[] = [];
  for (const text of params.claims) {
    const product = params.products.find((row) => tokenize(text).size > 0 && tokenOverlapCount(tokenize(text), tokenize(row.name)) >= 2);
    if (!product) continue;

    const weightInClaim = text.match(/([0-9۰-۹]+(?:[.,][0-9۰-۹]+)?)\s*(گرم|کیلوگرم|kg|g)(?=$|\s|[^\u0600-\u06FFa-zA-Z0-9])/i);
    const weightAttr = product.attributes.find((attr) => /وزن|weight/i.test(attr));
    if (weightInClaim && weightAttr) {
      const claimNum = weightInClaim[1]
        .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
        .replace(',', '.');
      const attrNumMatch = weightAttr.match(/([0-9۰-۹]+(?:[.,][0-9۰-۹]+)?)/);
      const attrNum = attrNumMatch?.[1];
      if (attrNum) {
        const normalizedAttr = attrNum
          .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
          .replace(',', '.');
        if (normalizedAttr !== claimNum) {
          out.push({
            id: claimId(params.siteId, text),
            siteId: params.siteId,
            text,
            type: 'PRODUCT_SPEC',
            status: 'CONTRADICTED',
            evidenceIds: [],
            sourceIds: [],
            confidence: 'high',
            reason: `کاتالوگ محصول «${product.name}» مقدار «${weightAttr}» دارد که با ادعای مقاله هم‌خوان نیست.`,
            highRisk: true
          });
          continue;
        }
      }
    }

    const support = findSupportingEvidence(text, params.evidence);
    out.push({
      id: claimId(params.siteId, text),
      siteId: params.siteId,
      text,
      type: classifyClaimType(text),
      status: support?.verified ? 'SUPPORTED' : 'NEEDS_VERIFICATION',
      evidenceIds: support ? [support.id] : [],
      sourceIds: [],
      confidence: support?.confidence || 'low',
      reason: support?.verified
        ? `با مدرک کاتالوگ/ایندکس هم‌خوان است (${product.name}).`
        : `محصول «${product.name}» ذکر شده اما مشخصه در دادهٔ فروشگاه تأیید نشد.`,
      highRisk: isHighRiskClaim(text)
    });
  }
  return out;
}
