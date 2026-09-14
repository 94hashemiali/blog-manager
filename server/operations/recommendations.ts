import crypto from 'crypto';
import { db } from '../db.js';
import type {
  AttentionSeverity,
  AttentionAction,
  OperationRecommendation,
  RecommendationStatus,
  RecommendationType
} from './types.js';
import { runDecisionEngine } from '../decision/engine.js';
import { isRecommendationStillNeeded } from '../decision/reeval.js';
import { mapActionToRecommendationType } from '../decision/actions.js';
import { updateDecisionStatus } from '../decision/store.js';
import type { Decision } from '../decision/types.js';

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
  patch: Partial<
    Pick<OperationRecommendation, 'linkedJobId' | 'linkedProductionJobId' | 'metadata'>
  > = {}
): OperationRecommendation | undefined {
  const store = load(siteId);
  const idx = store.recommendations.findIndex((row) => row.id === id);
  if (idx < 0) return undefined;
  store.recommendations[idx] = {
    ...store.recommendations[idx],
    ...patch,
    metadata: patch.metadata
      ? { ...(store.recommendations[idx].metadata || {}), ...patch.metadata }
      : store.recommendations[idx].metadata,
    status,
    updatedAt: new Date().toISOString()
  };
  save(store);
  return store.recommendations[idx];
}

function suggestedAction(decision: Decision): AttentionAction {
  switch (decision.recommendedAction) {
    case 'REFRESH_RESEARCH':
    case 'RESEARCH':
      return 'RESEARCH';
    case 'UPDATE_ARTICLE':
    case 'FIX_SEO':
    case 'ADD_INTERNAL_LINKS':
      return 'UPDATE';
    case 'SYNC_CONTENT':
    case 'SYNC_PERFORMANCE':
      return 'SYNC';
    case 'CONFIGURE_PROVIDER':
      return 'CONFIGURE';
    case 'RETRY_OPERATION':
      return 'RETRY';
    default:
      return 'REVIEW';
  }
}

function materializeFromDecisions(siteId: string, decisions: Decision[]): string[] {
  const ids: string[] = [];
  for (const decision of decisions) {
    const recType = mapActionToRecommendationType(decision.recommendedAction) as RecommendationType;
    const { recommendation } = upsertRecommendation({
      siteId,
      type: recType,
      priority: decision.priority,
      title: decision.title,
      explanation: [
        decision.explanation.whyThis,
        decision.explanation.whyNow,
        `score=${decision.score} confidence=${decision.confidence}`
      ].join(' '),
      entityId: decision.entityId,
      articleId: decision.articleId,
      suggestedAction: suggestedAction(decision),
      dedupeKey: recommendationDedupeKey({
        siteId,
        type: recType,
        entityId:
          decision.entityId ||
          (decision.articleId != null ? String(decision.articleId) : undefined),
        reasonCategory: `DECISION_${decision.recommendedAction}`
      }),
      metadata: {
        decisionId: decision.id,
        decisionVersion: decision.decisionEngineVersion,
        decisionEngineVersion: decision.decisionEngineVersion,
        score: decision.score,
        confidence: decision.confidence,
        effort: decision.effort,
        scoreBreakdown: decision.scoreBreakdown,
        signals: decision.signals.map((s) => s.type),
        evidence: decision.reasons,
        blockers: decision.blockers,
        expectedImpact: decision.expectedImpact,
        selectedAction: decision.recommendedAction,
        feasibilityStatus: decision.feasibilityStatus,
        lastEvaluatedAt: decision.updatedAt,
        evaluationVersion: decision.decisionEngineVersion,
        opsJobType:
          decision.recommendedAction === 'SYNC_PERFORMANCE' ? 'PERFORMANCE_SYNC' : undefined
      }
    });
    if (decision.feasibilityStatus === 'BLOCKED') {
      updateRecommendationStatus(siteId, recommendation.id, 'BLOCKED', {
        metadata: { blockers: decision.blockers }
      });
    }
    updateDecisionStatus(siteId, decision.id, 'SELECTED', { recommendationId: recommendation.id });
    ids.push(recommendation.id);
  }
  return ids;
}

/**
 * Materialize recommendations via Decision Engine + expire stale ones.
 * Single durable recommendation store — Decision is analysis layer.
 */
export function syncRecommendationsFromState(siteId: string): OperationRecommendation[] {
  const engine = runDecisionEngine(siteId, { persist: true, topN: 8 });
  const ids = materializeFromDecisions(siteId, engine.topActions);

  for (const rec of listRecommendations(siteId, ['OPEN', 'ACKNOWLEDGED'])) {
    if (rec.metadata?.automationRateLimited) continue;
    const evalResult = isRecommendationStillNeeded(siteId, rec);
    if (!evalResult.stillNeeded) {
      updateRecommendationStatus(siteId, rec.id, 'EXPIRED', {
        metadata: {
          expiredReason: evalResult.reason,
          expiredAt: new Date().toISOString()
        }
      });
    }
  }

  return ids
    .map((id) => getRecommendation(siteId, id))
    .filter((r): r is OperationRecommendation => Boolean(r));
}

export type { AttentionSeverity };
