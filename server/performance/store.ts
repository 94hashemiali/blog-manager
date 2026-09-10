import { db } from '../db.js';
import {
  PERFORMANCE_SCHEMA_VERSION,
  type PerformanceStore,
  type ProviderStatus
} from './types.js';
import { defaultProviderStatuses } from './providers.js';

function emptyStore(siteId: string): PerformanceStore {
  return {
    schemaVersion: PERFORMANCE_SCHEMA_VERSION,
    siteId,
    providers: defaultProviderStatuses(),
    records: [],
    snapshots: [],
    opportunities: []
  };
}

export function loadPerformanceStore(siteId: string): PerformanceStore {
  const stored = db.getPerformanceStore(siteId);
  if (!stored || typeof stored !== 'object') return emptyStore(siteId);
  return {
    schemaVersion: stored.schemaVersion || PERFORMANCE_SCHEMA_VERSION,
    siteId,
    providers: Array.isArray(stored.providers) ? stored.providers : defaultProviderStatuses(),
    records: (Array.isArray(stored.records) ? stored.records : []).filter(
      (row: any) => !row.siteId || row.siteId === siteId
    ),
    snapshots: (Array.isArray(stored.snapshots) ? stored.snapshots : []).filter(
      (row: any) => !row.siteId || row.siteId === siteId
    ),
    opportunities: (Array.isArray(stored.opportunities) ? stored.opportunities : []).filter(
      (row: any) => !row.siteId || row.siteId === siteId
    ),
    lastSyncedAt: stored.lastSyncedAt,
    lastSyncSource: stored.lastSyncSource,
    syncError: stored.syncError
  };
}

export function savePerformanceStore(store: PerformanceStore): PerformanceStore {
  const next = { ...store, schemaVersion: PERFORMANCE_SCHEMA_VERSION };
  db.savePerformanceStore(store.siteId, next);
  return next;
}

export function updateProviderStatus(
  siteId: string,
  provider: ProviderStatus['provider'],
  patch: Partial<ProviderStatus>
): ProviderStatus[] {
  const store = loadPerformanceStore(siteId);
  const providers = store.providers.map((row) =>
    row.provider === provider ? { ...row, ...patch, provider } : row
  );
  if (!providers.some((row) => row.provider === provider)) {
    providers.push({
      provider,
      status: 'not_connected',
      label: provider,
      detail: '',
      configured: false,
      ...patch
    });
  }
  savePerformanceStore({ ...store, providers });
  return providers;
}
