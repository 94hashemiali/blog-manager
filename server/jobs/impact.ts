import crypto from 'crypto';
import { db } from '../db.js';
import { listResearchSessions } from '../research/store.js';
import { listJobs } from '../content/store.js';
import type { ContentImpactRecord } from './types.js';
import { emitDomainEvent } from './events.js';

interface ImpactStore {
  schemaVersion: number;
  records: ContentImpactRecord[];
}

function load(siteId: string): ImpactStore {
  const raw = db.getImpactStore(siteId);
  return {
    schemaVersion: 1,
    records: Array.isArray(raw?.records) ? raw.records.filter((r: any) => r.siteId === siteId) : []
  };
}

function save(siteId: string, store: ImpactStore): void {
  db.saveImpactStore(siteId, { schemaVersion: 1, records: store.records.slice(0, 100) });
}

export function listContentImpacts(siteId: string): ContentImpactRecord[] {
  return load(siteId).records;
}

/** Rebuild OPEN impact rows from STALE research sessions. Idempotent-ish. */
export function recordSourceImpacts(siteId: string): ContentImpactRecord[] {
  const sessions = listResearchSessions(siteId).filter((s) => s.status === 'STALE' || s.status === 'INVALIDATED');
  if (!sessions.length) return [];

  const store = load(siteId);
  const created: ContentImpactRecord[] = [];
  const productionJobs = listJobs(siteId);

  for (const session of sessions) {
    const already = store.records.find(
      (row) =>
        row.status === 'OPEN' &&
        row.affectedSessionIds.includes(session.id) &&
        Date.now() - new Date(row.detectedAt).getTime() < 24 * 60 * 60 * 1000
    );
    if (already) continue;

    const changedSources = session.sources.filter((s) => s.status === 'ok' || s.status === 'cached');
    const sourceUrl = changedSources[0]?.url || `session:${session.id}`;
    const linkedJobs = productionJobs.filter(
      (job) => job.research?.researchSessionId === session.id || job.topic === session.topic
    );

    const record: ContentImpactRecord = {
      id: `impact-${crypto.randomBytes(4).toString('hex')}`,
      siteId,
      sourceUrl,
      affectedSessionIds: [session.id],
      affectedProductionJobIds: linkedJobs.map((j) => j.id),
      affectedEntityIds: linkedJobs
        .map((j) => j.contentEntityId)
        .filter((id): id is string => Boolean(id)),
      detectedAt: new Date().toISOString(),
      status: 'OPEN',
      note: 'Research session is STALE/INVALIDATED — articles may need refresh (no auto rewrite).'
    };
    store.records.unshift(record);
    created.push(record);
    emitDomainEvent({
      type: 'CONTENT_IMPACT_RECORDED',
      siteId,
      entityId: session.id,
      metadata: {
        sourceUrl,
        productionJobIds: record.affectedProductionJobIds,
        entityIds: record.affectedEntityIds
      }
    });
    emitDomainEvent({
      type: 'RESEARCH_BECAME_STALE',
      siteId,
      entityId: session.id,
      metadata: { sourceUrl }
    });
  }

  if (created.length) save(siteId, store);
  return created;
}
