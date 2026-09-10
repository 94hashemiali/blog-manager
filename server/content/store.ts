import crypto from 'crypto';
import { db } from '../db.js';
import {
  PRODUCTION_SCHEMA_VERSION,
  type ContentProductionJob,
  type ProductionStore,
  type PublishingHistoryEntry,
  type SearchIntent
} from './types.js';

function emptyStore(siteId: string): ProductionStore {
  return {
    schemaVersion: PRODUCTION_SCHEMA_VERSION,
    siteId,
    jobs: [],
    publishingHistory: []
  };
}

/** Fills in fields added after a store was written, so old files stay readable. */
function migrateJob(raw: any, siteId: string): ContentProductionJob {
  return {
    ...raw,
    siteId,
    internalLinks: Array.isArray(raw.internalLinks) ? raw.internalLinks : [],
    visualAssetIds: Array.isArray(raw.visualAssetIds) ? raw.visualAssetIds : [],
    versions: Array.isArray(raw.versions) ? raw.versions : [],
    publishingHistory: Array.isArray(raw.publishingHistory) ? raw.publishingHistory : [],
    stageHistory: Array.isArray(raw.stageHistory) ? raw.stageHistory : [],
    failures: Array.isArray(raw.failures) ? raw.failures : [],
    stage: raw.stage || 'idea',
    mode: raw.mode === 'UPDATE' || raw.mode === 'MERGE' ? raw.mode : 'CREATE',
    searchIntent: (raw.searchIntent as SearchIntent) || 'informational'
  };
}

export function loadProductionStore(siteId: string): ProductionStore {
  const stored = db.getProductionStore(siteId);
  if (!stored || typeof stored !== 'object') return emptyStore(siteId);
  return {
    schemaVersion: stored.schemaVersion || PRODUCTION_SCHEMA_VERSION,
    siteId,
    // Site isolation is enforced on read as well as write: a file copied
    // between sites can never surface another site's jobs.
    jobs: (Array.isArray(stored.jobs) ? stored.jobs : [])
      .filter((job: any) => !job.siteId || job.siteId === siteId)
      .map((job: any) => migrateJob(job, siteId)),
    publishingHistory: (Array.isArray(stored.publishingHistory) ? stored.publishingHistory : []).filter(
      (entry: any) => !entry.siteId || entry.siteId === siteId
    )
  };
}

function persist(store: ProductionStore): void {
  db.saveProductionStore(store.siteId, {
    ...store,
    schemaVersion: PRODUCTION_SCHEMA_VERSION
  });
}

export function listJobs(siteId: string): ContentProductionJob[] {
  return loadProductionStore(siteId).jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getJob(siteId: string, jobId: string): ContentProductionJob | undefined {
  return loadProductionStore(siteId).jobs.find((job) => job.id === jobId);
}

export function newJobId(): string {
  return `prod-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

export function saveJob(job: ContentProductionJob): ContentProductionJob {
  const store = loadProductionStore(job.siteId);
  const next = { ...job, updatedAt: new Date().toISOString() };
  const index = store.jobs.findIndex((row) => row.id === job.id);
  if (index >= 0) store.jobs[index] = next;
  else store.jobs.unshift(next);
  persist(store);
  return next;
}

export function deleteJob(siteId: string, jobId: string): boolean {
  const store = loadProductionStore(siteId);
  const before = store.jobs.length;
  store.jobs = store.jobs.filter((job) => job.id !== jobId);
  if (store.jobs.length === before) return false;
  persist(store);
  return true;
}

export function appendPublishingHistory(entry: PublishingHistoryEntry): PublishingHistoryEntry {
  const store = loadProductionStore(entry.siteId);
  store.publishingHistory.unshift(entry);
  store.publishingHistory = store.publishingHistory.slice(0, 200);
  const job = store.jobs.find((row) => row.id === entry.articleId);
  if (job) {
    job.publishingHistory = [entry, ...(job.publishingHistory || [])].slice(0, 50);
    job.updatedAt = new Date().toISOString();
  }
  persist(store);
  return entry;
}

export function listPublishingHistory(siteId: string): PublishingHistoryEntry[] {
  return loadProductionStore(siteId).publishingHistory;
}
