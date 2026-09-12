import crypto from 'crypto';
import { db } from '../db.js';
import type {
  AttentionSeverity,
  OperationRecommendation,
  RecommendationStatus,
  RecommendationType
} from './types.js';
import { collectAttention } from './attention.js';
import { listContentImpacts } from '../jobs/impact.js';
import { loadPerformanceStore } from '../performance/store.js';
import { listResearchSessions } from '../research/store.js';

const RECOMMENDATION_SCHEMA = 1;

interface RecommendationStore {
  schemaVersion: number;
  siteId: string;
  recommendations: OperationRecommendation[];
}

function empty(siteId: string): RecommendationStore {
  return { schemaVersion: RECOMMENDATION_SCHEMA, siteId, recommendations: [] };
}

function load(siteId: string): RecommendationStore {
  const raw = db.getRecommendationStore(siteId);
  if (!raw || typeof raw !== 'object') return empty(siteId);
  return {
    schemaVersion: Number(raw.schemaVersion) || RECOMMENDATION_SCHEMA,
    siteId,
    recommendations: (Array.isArray(raw.recommendations) ? raw.recommendations : []).filter(
      (row: OperationRecommendation) => row.siteId === siteId
    )
  };
}

function save(store: RecommendationStore): RecommendationStore {
  const next = {
    ...store,
    schemaVersion: RECOMMENDATION_SCHEMA,
    recommendations: store.recommendations.slice(0, 200)
  };
  db.saveRecommendationStore(store.siteId, next);
  return next;
}

export function recommendationDedupeKey(params: {
  siteId: string;
  type: RecommendationType;
  entityId?: string;
  reasonCategory: string;
}): string {
  return [params.siteId, params.type, params.entityId || '-', params.reasonCategory].join('::');
}

export function listRecommendations(
  siteId: string,
  statuses?: RecommendationStatus[]
): OperationRecommendation[] {
  const rows = load(siteId).recommendations;
  if (!statuses?.length) return rows;
  const set = new Set(statuses);
  return rows.filter((row) => set.has(row.status));
}

export function getRecommendation(siteId: string, id: string): OperationRecommendation | undefined {
  return load(siteId).recommendations.find((row) => row.id === id && row.siteId === siteId);
}

export function upsertRecommendation(
  input: Omit<OperationRecommendation, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
    id?: string;
    status?: RecommendationStatus;
  }
): { recommendation: OperationRecommendation; created: boolean } {
  const store = load(input.siteId);
  const existing = store.recommendations.find(
    (row) =>
      row.dedupeKey === input.dedupeKey &&
      (row.status === 'OPEN' || row.status === 'ACKNOWLEDGED' || row.status === 'IN_PROGRESS')
  );
  if (existing) return { recommendation: existing, created: false };

  const now = new Date().toISOString();
  const recommendation: OperationRecommendation = {
    id: input.id || `rec-${crypto.randomBytes(4).toString('hex')}`,
    siteId: input.siteId,
    type: input.type,
    priority: input.priority,
    title: input.title,
    explanation: input.explanation,
    entityId: input.entityId,
    articleId: input.articleId,
    sourceUrl: input.sourceUrl,
    triggerEventId: input.triggerEventId,
    suggestedAction: input.suggestedAction,
    dedupeKey: input.dedupeKey,
    createdAt: now,
    updatedAt: now,
    status: input.status || 'OPEN',
    linkedJobId: input.linkedJobId,
    linkedProductionJobId: input.linkedProductionJobId,
    metadata: input.metadata
  };
  store.recommendations.unshift(recommendation);
  save(store);
  return { recommendation, created: true };
}

export function updateRecommendationStatus(
  siteId: string,
  id: string,
  status: RecommendationStatus,
  patch: Partial<Pick<OperationRecommendation, 'linkedJobId' | 'linkedProductionJobId' | 'metadata'>> = {}
): OperationRecommendation | undefined {
  const store = load(siteId);
  const idx = store.recommendations.findIndex((row) => row.id === id);
  if (idx < 0) return undefined;
  store.recommendations[idx] = {
    ...store.recommendations[idx],
    ...patch,
    status,
    updatedAt: new Date().toISOString()
  };
  save(store);
  return store.recommendations[idx];
}

/**
 * Materialize recommendations from current attention/impacts/performance/research.
 * Read-only domain → durable open recommendations (deduped).
 */
export function syncRecommendationsFromState(siteId: string): OperationRecommendation[] {
  const created: OperationRecommendation[] = [];

  for (const impact of listContentImpacts(siteId).filter((r) => r.status === 'OPEN')) {
    const { recommendation, created: wasCreated } = upsertRecommendation({
      siteId,
      type: 'REVIEW_SOURCE',
      priority: impact.affectedProductionJobIds.length ? 'HIGH' : 'MEDIUM',
      title: 'Review content after source change',
      explanation: impact.note || `Source ${impact.sourceUrl} changed; affected sessions need review.`,
      entityId: impact.id,
      sourceUrl: impact.sourceUrl,
      suggestedAction: 'UPDATE',
      dedupeKey: recommendationDedupeKey({
        siteId,
        type: 'REVIEW_SOURCE',
        entityId: impact.id,
        reasonCategory: 'SOURCE_CHANGED'
      }),
      metadata: {
        affectedProductionJobIds: impact.affectedProductionJobIds,
        affectedSessionIds: impact.affectedSessionIds
      }
    });
    if (wasCreated) created.push(recommendation);
  }

  const perf = loadPerformanceStore(siteId);
  for (const opp of perf.opportunities.filter((o) => o.type === 'UPDATE_ARTICLE')) {
    const { recommendation, created: wasCreated } = upsertRecommendation({
      siteId,
      type: 'UPDATE_ARTICLE',
      priority: (opp.severity === 'high' ? 'HIGH' : opp.severity === 'medium' ? 'MEDIUM' : 'LOW') as AttentionSeverity,
      title: `Update article: ${opp.articleTitle || opp.articleId}`,
      explanation: opp.reason,
      entityId: String(opp.articleId),
      articleId: opp.articleId,
      suggestedAction: 'UPDATE',
      dedupeKey: recommendationDedupeKey({
        siteId,
        type: 'UPDATE_ARTICLE',
        entityId: String(opp.articleId),
        reasonCategory: opp.type
      }),
      metadata: {
        opportunityId: opp.id,
        evidence: opp.evidence,
        contributingSignals: opp.contributingSignals
      }
    });
    if (wasCreated) created.push(recommendation);
  }

  for (const session of listResearchSessions(siteId).filter(
    (s) => s.status === 'STALE' || s.status === 'INVALIDATED'
  )) {
    const { recommendation, created: wasCreated } = upsertRecommendation({
      siteId,
      type: 'RESEARCH_REFRESH',
      priority: 'MEDIUM',
      title: `Refresh research: ${session.topic}`,
      explanation: `Research session is ${session.status}.`,
      entityId: session.id,
      suggestedAction: 'RESEARCH',
      dedupeKey: recommendationDedupeKey({
        siteId,
        type: 'RESEARCH_REFRESH',
        entityId: session.id,
        reasonCategory: session.status
      }),
      metadata: { topic: session.topic, status: session.status }
    });
    if (wasCreated) created.push(recommendation);
  }

  // Failed ops jobs → retry recommendations
  for (const att of collectAttention(siteId).filter((a) => a.type === 'JOB_FAILED' || a.type === 'JOB_RECOVERY_REQUIRED')) {
    const { recommendation, created: wasCreated } = upsertRecommendation({
      siteId,
      type: 'RETRY_OPERATION',
      priority: att.severity,
      title: att.title,
      explanation: att.description,
      entityId: att.jobId || att.entityId,
      suggestedAction: 'RETRY',
      dedupeKey: recommendationDedupeKey({
        siteId,
        type: 'RETRY_OPERATION',
        entityId: att.jobId || att.id,
        reasonCategory: att.type
      }),
      metadata: { jobId: att.jobId, attentionType: att.type }
    });
    if (wasCreated) created.push(recommendation);
  }

  return created;
}
