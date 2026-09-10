import crypto from 'crypto';
import { addEvidence, mergeEvidence } from '../content/evidence.js';
import { generateResearchPacket, type GenerateResearchParams } from '../content/research.js';
import type { EvidenceItem, ResearchPacket, ResearchSource } from '../content/types.js';
import { buildClaimsFromEvidence, detectConflicts, validateProductClaims } from './claims.js';
import { extractEvidenceFromSource } from './extractor.js';
import { fetchResearchUrl } from './fetcher.js';
import { buildResearchPlan } from './planner.js';
import { defaultResearchProviders, getWebSearchProvider } from './providers.js';
import { assessResearchQuality } from './quality.js';
import { assessSourceQuality } from './sourceQuality.js';
import { getCachedSource, putCachedSource, saveResearchSession } from './store.js';
import { getContentIndex } from '../intelligence/store.js';
import {
  toEvidenceSourceType,
  type ExtractedEvidence,
  type ResearchSession,
  type ResearchSourceDocument
} from './types.js';

function sessionId(siteId: string, topic: string): string {
  return `rs-${crypto.createHash('sha1').update(`${siteId}::${topic}::${Date.now()}`).digest('hex').slice(0, 12)}`;
}

function extractedToPacketEvidence(items: ExtractedEvidence[]): EvidenceItem[] {
  return items.map((item) =>
    addEvidence({
      siteId: item.siteId,
      claim: item.claim,
      source: item.sourceId,
      sourceType: toEvidenceSourceType(item.sourceType),
      confidence: item.confidence,
      evidenceText: item.evidenceText,
      sourceId: item.sourceId,
      location: item.location,
      notes: `sourceType=${item.sourceType}`
    })
  );
}

function sourcesToPacketSources(sources: ResearchSourceDocument[]): ResearchSource[] {
  return sources
    .filter((row) => row.status === 'ok' || row.status === 'cached')
    .map((row) => {
      const quality = assessSourceQuality(row);
      return {
        id: row.id,
        label: row.title || row.domain,
        url: row.url,
        sourceType: toEvidenceSourceType(row.sourceType),
        reliability: quality.quality === 'high' ? 'high' : quality.quality === 'medium' ? 'medium' : 'low',
        retrievedAt: row.fetchedAt,
        notes: `freshness=${row.freshness}; hash=${row.contentHash}; quality=${quality.quality}; ${quality.reasons.join(',')}`
      };
    });
}

export async function fetchAndCacheSource(params: {
  siteId: string;
  url: string;
  freshnessRequirement?: 'high' | 'medium' | 'low';
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ source: ResearchSourceDocument; evidence: ExtractedEvidence[]; fromCache: boolean }> {
  if (!params.forceRefresh) {
    const cached = getCachedSource(params.siteId, params.url);
    if (cached) {
      return { source: cached, evidence: extractEvidenceFromSource(cached), fromCache: true };
    }
  }
  const source = await fetchResearchUrl({
    siteId: params.siteId,
    url: params.url,
    freshnessRequirement: params.freshnessRequirement,
    fetchImpl: params.fetchImpl
  });
  if (source.status === 'ok') putCachedSource(params.siteId, source);
  return { source, evidence: extractEvidenceFromSource(source), fromCache: false };
}

/**
 * Full grounded research: plan → local WP/catalog evidence → optional manual URLs
 * → claims/conflicts/quality. Web search stays NOT_CONFIGURED unless a provider exists.
 */
export async function runGroundedResearch(params: GenerateResearchParams & {
  manualUrls?: string[];
  forceRefreshUrls?: boolean;
  enrichPlanWithAi?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ packet: ResearchPacket; session: ResearchSession }> {
  const web = getWebSearchProvider();
  const providers = defaultResearchProviders();
  // Explicitly attempt search so callers see empty + not_configured rather than a silent skip.
  await web.search(params.topic);

  const plan = await buildResearchPlan({
    siteId: params.siteId,
    topic: params.topic,
    primaryKeyword: params.primaryKeyword,
    searchIntent: params.searchIntent,
    enrichWithAi: params.enrichPlanWithAi
  });

  const packetBase = await generateResearchPacket({
    siteId: params.siteId,
    topic: params.topic,
    primaryKeyword: params.primaryKeyword,
    secondaryKeywords: params.secondaryKeywords,
    searchIntent: plan.searchIntent,
    targetAudience: params.targetAudience,
    userProvidedFacts: params.userProvidedFacts
  });

  const sources: ResearchSourceDocument[] = [];
  const extracted: ExtractedEvidence[] = [];
  for (const url of params.manualUrls || []) {
    const result = await fetchAndCacheSource({
      siteId: params.siteId,
      url,
      freshnessRequirement: plan.freshnessRequirement,
      forceRefresh: params.forceRefreshUrls,
      fetchImpl: params.fetchImpl
    });
    sources.push(result.source);
    extracted.push(...result.evidence);
  }

  const index = getContentIndex(params.siteId);
  let packetEvidence = mergeEvidence(packetBase.evidence, extractedToPacketEvidence(extracted));

  const claims = buildClaimsFromEvidence({
    siteId: params.siteId,
    extracted,
    packetEvidence
  });
  const productClaims = validateProductClaims({
    siteId: params.siteId,
    claims: packetBase.importantClaims,
    products: index.products,
    evidence: packetEvidence
  });
  for (const claim of productClaims) {
    if (!claims.some((row) => row.id === claim.id)) claims.push(claim);
  }

  const conflicts = detectConflicts({ siteId: params.siteId, extracted, sources });
  const verifiedEvidenceCount = packetEvidence.filter((item) => item.verified).length;
  const qualityGate = assessResearchQuality({
    plan,
    sources,
    claims,
    conflicts,
    verifiedEvidenceCount
  });

  const unknownFacts = [
    ...packetBase.unknownFacts,
    ...(web.configured ? [] : ['WEB RESEARCH PROVIDER NOT CONFIGURED']),
    ...conflicts
      .filter((row) => row.resolutionStatus === 'UNRESOLVED')
      .map((row) => `تعارض حل‌نشده: ${row.difference}`)
  ];

  const packet: ResearchPacket = {
    ...packetBase,
    sources: [...packetBase.sources, ...sourcesToPacketSources(sources)],
    evidence: packetEvidence,
    unknownFacts: [...new Set(unknownFacts)],
    researchConfidence:
      qualityGate.status === 'BLOCKED' ? 'low' : qualityGate.status === 'WARNING' ? 'medium' : packetBase.researchConfidence,
    plan,
    claims,
    conflicts,
    qualityGate,
    webProviderStatus: web.configured ? 'configured' : 'not_configured',
    researchSessionId: undefined
  };

  const now = new Date().toISOString();
  const session: ResearchSession = {
    id: sessionId(params.siteId, params.topic),
    siteId: params.siteId,
    topic: params.topic,
    status: qualityGate.status === 'BLOCKED' ? 'INVALIDATED' : 'READY',
    plan,
    sources,
    extractedEvidence: extracted,
    claims,
    conflicts,
    unknownFacts: packet.unknownFacts,
    qualityGate,
    providers,
    researchConfidence: packet.researchConfidence,
    packetEvidence,
    createdAt: now,
    updatedAt: now
  };
  packet.researchSessionId = session.id;
  saveResearchSession(session);

  return { packet, session };
}

export async function addManualSourceToSession(params: {
  siteId: string;
  session: ResearchSession;
  url: string;
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ResearchSession> {
  const result = await fetchAndCacheSource({
    siteId: params.siteId,
    url: params.url,
    freshnessRequirement: params.session.plan.freshnessRequirement,
    forceRefresh: params.forceRefresh,
    fetchImpl: params.fetchImpl
  });

  const sources = [
    ...params.session.sources.filter((row) => row.url !== result.source.url),
    result.source
  ];
  const extracted = [
    ...params.session.extractedEvidence.filter((row) => row.sourceId !== result.source.id),
    ...result.evidence
  ];
  const packetEvidence = mergeEvidence(params.session.packetEvidence, extractedToPacketEvidence(result.evidence));
  const claims = buildClaimsFromEvidence({
    siteId: params.siteId,
    extracted,
    packetEvidence
  });
  const index = getContentIndex(params.siteId);
  const productClaims = validateProductClaims({
    siteId: params.siteId,
    claims: [
      ...params.session.claims.map((claim) => claim.text),
      ...packetEvidence.map((item) => item.claim)
    ],
    products: index.products,
    evidence: packetEvidence
  });
  for (const claim of productClaims) {
    const idx = claims.findIndex((row) => row.id === claim.id || row.text === claim.text);
    if (idx >= 0) claims[idx] = claim;
    else claims.push(claim);
  }
  const conflicts = detectConflicts({ siteId: params.siteId, extracted, sources });
  const qualityGate = assessResearchQuality({
    plan: params.session.plan,
    sources,
    claims,
    conflicts,
    verifiedEvidenceCount: packetEvidence.filter((item) => item.verified).length
  });

  const next: ResearchSession = {
    ...params.session,
    sources,
    extractedEvidence: extracted,
    claims,
    conflicts,
    packetEvidence,
    qualityGate,
    researchConfidence: qualityGate.status === 'BLOCKED' ? 'low' : params.session.researchConfidence,
    updatedAt: new Date().toISOString()
  };
  return saveResearchSession(next);
}
