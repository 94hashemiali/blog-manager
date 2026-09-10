import crypto from 'crypto';
import { generateJsonContent } from '../aiClient.js';
import { GeminiCallError } from '../geminiClient.js';
import { jaccard, normalizeTitle, tokenize } from '../intelligence/text.js';
import {
  calculateEvidenceCoverage,
  findSupportingEvidence,
  isHighRiskClaim
} from './evidence.js';
import { asObject, objectArray, oneOf } from './schema.js';
import type {
  ArticleDraft,
  ClaimVerdict,
  EvidenceItem,
  EvidenceSourceType,
  FactCheckClaim,
  FactCheckReport,
  ResearchPacket
} from './types.js';

const VERDICTS: ClaimVerdict[] = [
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'UNSUPPORTED',
  'CONTRADICTED',
  'NEEDS_VERIFICATION',
  'OPINION'
];

const OPINION_MARKERS = /به نظر|معمولاً|بهتر است|توصیه می‌کنیم|ترجیح|احتمالاً|می‌تواند/;

/**
 * Pulls candidate factual sentences out of the draft. Sentences with numbers,
 * units or standards are always included because those are the ones that hurt
 * if they are wrong.
 */
export function extractClaims(draft: ArticleDraft): string[] {
  const declared = draft.claims.map((claim) => claim.claim);
  const sentences = draft.content
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/[.!?؟\n]+/)
    .map((sentence) => sentence.replace(/[#*>_|-]/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30);

  const factual = sentences.filter((sentence) => isHighRiskClaim(sentence) && !OPINION_MARKERS.test(sentence));

  const seen = new Set<string>();
  const claims: string[] = [];
  for (const claim of [...declared, ...factual]) {
    const key = normalizeTitle(claim);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    claims.push(claim.trim());
  }
  return claims.slice(0, 40);
}

/**
 * Deterministic verdict from the evidence store alone. This is the baseline
 * that the AI pass can only refine, never overrule into SUPPORTED.
 */
export function classifyClaimLocally(claim: string, evidence: EvidenceItem[]): FactCheckClaim {
  const match = findSupportingEvidence(claim, evidence);
  if (match?.verified) {
    const overlap = jaccard(tokenize(claim), tokenize(match.claim));
    return {
      claim,
      verdict: overlap >= 60 ? 'SUPPORTED' : 'PARTIALLY_SUPPORTED',
      sourceType: match.sourceType,
      matchedEvidenceId: match.id,
      reason:
        overlap >= 60
          ? `با منبع تأییدشده «${match.source}» هم‌خوان است.`
          : `تنها بخشی از این ادعا در منبع «${match.source}» تأیید شده است.`,
      requiresAction: overlap < 60
    };
  }

  if (OPINION_MARKERS.test(claim)) {
    return {
      claim,
      verdict: 'OPINION',
      sourceType: 'ai_inference',
      reason: 'جمله توصیه یا نظر است، نه ادعای واقعی.',
      requiresAction: false
    };
  }

  if (isHighRiskClaim(claim)) {
    return {
      claim,
      verdict: 'NEEDS_VERIFICATION',
      sourceType: match?.sourceType || 'unknown',
      matchedEvidenceId: match?.id,
      reason: 'عدد، قیمت، دما یا استانداردی ذکر شده که منبع تأییدشده ندارد.',
      requiresAction: true
    };
  }

  return {
    claim,
    verdict: 'UNSUPPORTED',
    sourceType: match?.sourceType || 'unknown',
    matchedEvidenceId: match?.id,
    reason: 'هیچ منبعی در بستهٔ تحقیق این ادعا را پشتیبانی نمی‌کند.',
    requiresAction: true
  };
}

function summarize(claims: FactCheckClaim[]): Record<ClaimVerdict, number> {
  const summary = {
    SUPPORTED: 0,
    PARTIALLY_SUPPORTED: 0,
    UNSUPPORTED: 0,
    CONTRADICTED: 0,
    NEEDS_VERIFICATION: 0,
    OPINION: 0
  } as Record<ClaimVerdict, number>;
  for (const claim of claims) summary[claim.verdict]++;
  return summary;
}

/**
 * Fact-checks a draft. The local pass always runs; Gemini is then asked only
 * to spot contradictions against the research packet. If Gemini is
 * unavailable the report is returned as `degraded` rather than as a pass.
 */
export async function factCheckDraft(params: {
  draft: ArticleDraft;
  research: ResearchPacket;
  useAi?: boolean;
}): Promise<FactCheckReport> {
  const claims = extractClaims(params.draft);
  const evidence = params.research.evidence;
  let checked = claims.map((claim) => classifyClaimLocally(claim, evidence));

  // Research-session product contradictions win over a local SUPPORTED guess.
  for (let i = 0; i < checked.length; i += 1) {
    const researchClaim = (params.research.claims || []).find(
      (row) => row.status === 'CONTRADICTED' && row.text === checked[i].claim
    );
    if (researchClaim) {
      checked[i] = {
        ...checked[i],
        verdict: 'CONTRADICTED',
        reason: researchClaim.reason,
        requiresAction: true
      };
      continue;
    }
    // Soft match against contradicted research claims by shared tokens is avoided;
    // only exact text from validateProductClaims is trusted here.
  }

  let modelUsed: string | undefined;
  let degraded = false;
  let degradedReason: string | undefined;

  if (params.useAi !== false && claims.length > 0) {
    try {
      const result = await generateJsonContent({
        stage: 'fact_check',
        systemInstruction:
          'You compare article claims against a fixed list of verified facts. You may only downgrade confidence or flag contradictions. You never mark a claim as supported unless it appears in the verified list. Return JSON only.',
        prompt: `VERIFIED FACTS:
${evidence
  .filter((item) => item.verified)
  .map((item) => `- ${item.claim} (source: ${item.source})`)
  .join('\n') || '- (none)'}

FACTS KNOWN TO BE UNVERIFIABLE:
${params.research.unknownFacts.map((fact) => `- ${fact}`).join('\n') || '- (none)'}

CLAIMS FROM THE ARTICLE:
${checked.map((claim, idx) => `${idx + 1}. ${claim.claim}`).join('\n')}

For each claim return a verdict. Use CONTRADICTED only when the claim conflicts
with a verified fact. Use OPINION for recommendations. Never invent a source.

Return JSON only:
{"claims": [{"index": 1, "verdict": "SUPPORTED|PARTIALLY_SUPPORTED|UNSUPPORTED|CONTRADICTED|NEEDS_VERIFICATION|OPINION", "reason": ""}]}`
      });

      const data = asObject(result.data, 'fact_check');
      const rows = objectArray(data.claims, 'claims', { max: 60 });
      modelUsed = result.modelUsed;

      for (const row of rows) {
        const index = Number(row.index) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= checked.length) continue;
        const local = checked[index];
        const aiVerdict = oneOf(row.verdict, VERDICTS, local.verdict);
        const reason = String(row.reason || '').trim();

        // The model may flag a contradiction or downgrade, but a claim can only
        // become SUPPORTED through verified local evidence.
        if (aiVerdict === 'CONTRADICTED') {
          checked[index] = {
            ...local,
            verdict: 'CONTRADICTED',
            reason: reason || 'با یکی از فکت‌های تأییدشده در تناقض است.',
            requiresAction: true
          };
        } else if (
          local.verdict === 'SUPPORTED' &&
          (aiVerdict === 'PARTIALLY_SUPPORTED' || aiVerdict === 'NEEDS_VERIFICATION' || aiVerdict === 'UNSUPPORTED')
        ) {
          checked[index] = { ...local, verdict: aiVerdict, reason: reason || local.reason, requiresAction: true };
        } else if (local.verdict === 'UNSUPPORTED' && aiVerdict === 'OPINION') {
          checked[index] = { ...local, verdict: 'OPINION', reason: reason || local.reason, requiresAction: false };
        }
      }
    } catch (err) {
      degraded = true;
      degradedReason =
        err instanceof GeminiCallError
          ? `بررسی تناقض با هوش مصنوعی انجام نشد: ${err.message}`
          : 'بررسی تناقض با هوش مصنوعی انجام نشد.';
      // The local verdicts stand; nothing is upgraded because the AI pass failed.
      checked = checked.map((claim) => ({ ...claim }));
    }
  }

  const coverage = calculateEvidenceCoverage(claims, evidence);
  const summary = summarize(checked);
  const blocking = checked
    .filter((claim) => claim.verdict === 'CONTRADICTED')
    .map((claim) => claim.claim);

  const riskLevel: FactCheckReport['riskLevel'] =
    summary.CONTRADICTED > 0 || coverage.highRiskClaims.length > 2
      ? 'high'
      : summary.UNSUPPORTED + summary.NEEDS_VERIFICATION > Math.max(2, Math.ceil(claims.length * 0.4))
        ? 'moderate'
        : 'low';

  return {
    id: `fc-${crypto.createHash('sha1').update(`${params.draft.id}:${params.draft.contentHash}`).digest('hex').slice(0, 10)}`,
    siteId: params.draft.siteId,
    draftVersion: params.draft.version,
    checkedAt: new Date().toISOString(),
    claims: checked,
    summary,
    evidenceCoverage: coverage,
    riskLevel,
    blocking,
    modelUsed,
    degraded: degraded || undefined,
    degradedReason
  };
}

export function claimSourceLabel(sourceType: EvidenceSourceType): string {
  switch (sourceType) {
    case 'wordpress':
      return 'محتوای وردپرس این سایت';
    case 'product_catalog':
      return 'کاتالوگ محصولات';
    case 'user_input':
      return 'اطلاعات کاربر';
    case 'official_source':
      return 'منبع رسمی';
    case 'external_source':
      return 'منبع بیرونی';
    case 'ai_inference':
      return 'استنباط مدل زبانی';
    default:
      return 'نامشخص';
  }
}
