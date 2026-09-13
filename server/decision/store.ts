import crypto from 'crypto';
import { db as _db } from '../db.js';
import {
  DECISION_ENGINE_VERSION,
  type Decision,
  type DecisionEngineResult,
  type DecisionStatus
} from './types.js';

interface DecisionStore {
  schemaVersion: number;
  siteId: string;
  decisionEngineVersion: number;
  decisions: Decision[];
  lastRunAt?: string;
}

function empty(siteId: string): DecisionStore {
  return {
    schemaVersion: 1,
    siteId,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    decisions: []
  };
}

export function loadDecisionStore(siteId: string): DecisionStore {
  const raw = _db.getDecisionStore(siteId);
  if (!raw || typeof raw !== 'object') return empty(siteId);
  return {
    schemaVersion: Number(raw.schemaVersion) || 1,
    siteId,
    decisionEngineVersion: Number(raw.decisionEngineVersion) || DECISION_ENGINE_VERSION,
    decisions: (Array.isArray(raw.decisions) ? raw.decisions : []).filter(
      (d: Decision) => d.siteId === siteId
    ),
    lastRunAt: raw.lastRunAt
  };
}

export function saveDecisionStore(siteId: string, store: DecisionStore): DecisionStore {
  const next = {
    ...store,
    siteId,
    schemaVersion: 1,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    decisions: store.decisions.slice(0, 100)
  };
  _db.saveDecisionStore(siteId, next);
  return next;
}

export function persistEngineResult(result: DecisionEngineResult): DecisionStore {
  const store = loadDecisionStore(result.siteId);
  const openIds = new Set(
    result.decisions.filter((d) => d.status === 'OPEN' || d.status === 'SELECTED').map((d) => d.id)
  );

  // Expire prior OPEN/SELECTED decisions replaced by this run (key not present).
  const kept = store.decisions.map((d) => {
    if ((d.status === 'OPEN' || d.status === 'SELECTED') && !openIds.has(d.id)) {
      const stillInResult = result.decisions.some((n) => decisionKey(n) === decisionKey(d));
      if (!stillInResult) {
        return { ...d, status: 'EXPIRED' as const, updatedAt: result.generatedAt };
      }
    }
    return d;
  });

  const byKey = new Map<string, Decision>();
  for (const d of kept) {
    byKey.set(decisionKey(d), d);
  }
  for (const d of result.decisions) {
    const key = decisionKey(d);
    const existing = byKey.get(key);
    if (
      existing &&
      (existing.status === 'EXECUTING' ||
        existing.status === 'COMPLETED' ||
        existing.status === 'REJECTED')
    ) {
      // Preserve in-flight / terminal status — do not clobber with fresh OPEN/SELECTED.
      byKey.set(key, {
        ...d,
        id: existing.id,
        status: existing.status,
        recommendationId: existing.recommendationId || d.recommendationId,
        createdAt: existing.createdAt,
        updatedAt: result.generatedAt
      });
    } else {
      byKey.set(key, existing?.recommendationId ? { ...d, recommendationId: existing.recommendationId } : d);
    }
  }

  const next: DecisionStore = {
    schemaVersion: 1,
    siteId: result.siteId,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    lastRunAt: result.generatedAt,
    decisions: Array.from(byKey.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
  };
  return saveDecisionStore(result.siteId, next);
}

export function decisionKey(d: Pick<Decision, 'siteId' | 'type' | 'entityId' | 'articleId'>): string {
  return [d.siteId, d.type, d.entityId || '-', d.articleId != null ? String(d.articleId) : '-'].join(
    '::'
  );
}

export function newDecisionId(): string {
  return `dec-${crypto.randomBytes(5).toString('hex')}`;
}

export function updateDecisionStatus(
  siteId: string,
  id: string,
  status: DecisionStatus,
  patch: Partial<Pick<Decision, 'recommendationId' | 'prerequisiteDecisionId'>> = {}
): Decision | undefined {
  const store = loadDecisionStore(siteId);
  const idx = store.decisions.findIndex((d) => d.id === id);
  if (idx < 0) return undefined;
  store.decisions[idx] = {
    ...store.decisions[idx],
    ...patch,
    status,
    updatedAt: new Date().toISOString()
  };
  saveDecisionStore(siteId, store);
  return store.decisions[idx];
}

export function getDecision(siteId: string, id: string): Decision | undefined {
  return loadDecisionStore(siteId).decisions.find((d) => d.id === id && d.siteId === siteId);
}

export function listDecisions(siteId: string, statuses?: DecisionStatus[]): Decision[] {
  const rows = loadDecisionStore(siteId).decisions;
  if (!statuses?.length) return rows;
  const set = new Set(statuses);
  return rows.filter((d) => set.has(d.status));
}
