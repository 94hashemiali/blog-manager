/**
 * Capture honest site measurement snapshots for Mission baseline/outcome.
 * Never invent clicks/impressions/zeros for unavailable providers.
 */
import crypto from 'crypto';
import { DECISION_ENGINE_VERSION } from '../decision/types.js';
import { getContentIndex } from '../intelligence/store.js';
import { loadPerformanceStore } from '../performance/store.js';
import type { DataQuality, ProviderStatus } from '../performance/types.js';
import {
  getActivePlan,
  getMission,
  loadMissionStore,
  saveMissionStore,
  upsertMission
} from './store.js';
import type {
  MetricAvailability,
  MetricValue,
  MissionMeasurementSnapshot
} from './measurementTypes.js';
import { emitDomainEvent } from '../jobs/events.js';

function metric(
  state: MetricAvailability,
  value?: number,
  source?: string,
  detail?: string
): MetricValue {
  if (state !== 'AVAILABLE' && state !== 'DEMO_DATA') {
    return { state, source, detail };
  }
  return { state, value, source, detail };
}

function providerMetric(p?: ProviderStatus): MetricValue {
  if (!p) return metric('UNKNOWN', undefined, 'providers', 'Provider status missing');
  if (p.status === 'not_connected' || !p.configured) {
    return metric('UNAVAILABLE', undefined, p.provider, p.detail || 'Not configured');
  }
  if (p.status === 'error' || p.status === 'misconfigured') {
    return metric('UNAVAILABLE', undefined, p.provider, p.detail || p.status);
  }
  if (p.status === 'connected') {
    return metric('AVAILABLE', 1, p.provider, p.label);
  }
  return metric('UNKNOWN', undefined, p.provider, p.status);
}

function sumVerifiedSnapshots(
  snapshots: Array<{
    id?: string;
    siteId?: string;
    articleId?: string | number;
    date?: string;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    quality: DataQuality;
    source: string;
  }>,
  siteId: string,
  field: 'clicks' | 'impressions' | 'ctr' | 'position',
  gsc: ProviderStatus | undefined
): MetricValue {
  if (!gsc || gsc.status !== 'connected' || !gsc.configured) {
    return metric('UNAVAILABLE', undefined, 'search_console', 'Search Console not connected');
  }
  const scoped = snapshots.filter((s) => s.siteId === siteId && s[field] != null);
  if (!scoped.length) {
    return metric('UNAVAILABLE', undefined, 'search_console', 'No snapshot rows for metric');
  }
  const demo = scoped.every((r) => r.quality === 'DEMO_DATA');
  if (demo) {
    return metric('DEMO_DATA', undefined, 'search_console', 'Demo data — not used as live measure');
  }
  const usable = scoped.filter((r) => r.quality !== 'DEMO_DATA' && r.quality !== 'UNKNOWN');
  if (!usable.length) {
    return metric('UNKNOWN', undefined, 'search_console', 'No verified snapshot values');
  }

  // Latest date only — one value per article (avoid summing all history).
  const latestDate = usable.map((r) => r.date || '').sort().at(-1) || '';
  const onLatest = usable.filter((r) => (r.date || '') === latestDate);
  const byArticle = new Map<string, (typeof usable)[number]>();
  for (const row of onLatest) {
    const key = String(row.articleId ?? row.id ?? '');
    if (!key) continue;
    byArticle.set(key, row);
  }
  const latestRows = Array.from(byArticle.values());
  if (!latestRows.length) {
    return metric('UNAVAILABLE', undefined, 'search_console', 'No latest-date article snapshots');
  }

  if (field === 'ctr' || field === 'position') {
    const avg =
      latestRows.reduce((sum, r) => sum + Number(r[field] || 0), 0) / Math.max(1, latestRows.length);
    return metric(
      'AVAILABLE',
      Number(avg.toFixed(4)),
      'search_console',
      `latest ${latestDate}; ${latestRows.length} articles`
    );
  }
  const total = latestRows.reduce((sum, r) => sum + Number(r[field] || 0), 0);
  return metric(
    'AVAILABLE',
    total,
    'search_console',
    `latest ${latestDate}; ${latestRows.length} articles`
  );
}

export function newMeasurementId(): string {
  return `mms-${crypto.randomBytes(5).toString('hex')}`;
}

export function captureSiteSnapshot(
  siteId: string,
  missionId: string,
  type: 'BASELINE' | 'OUTCOME'
): MissionMeasurementSnapshot {
  const index = getContentIndex(siteId);
  const perf = loadPerformanceStore(siteId);
  const now = new Date().toISOString();

  const articles = (index.articles || []).filter((a) => a.siteId === siteId);
  const stale = articles.filter(
    (a) => a.freshness === 'likely_outdated' || a.freshness === 'needs_review'
  ).length;

  const records = (perf.records || []).filter((r) => r.siteId === siteId);
  const seoIssues = records.filter((r) => {
    const dims = r.health?.dimensions || {};
    return Object.values(dims).some(
      (d: any) => d?.status === 'fail' || d?.status === 'error' || d?.status === 'attention'
    );
  }).length;
  const decayed = records.filter((r) => r.decay?.status === 'DECAYED').length;
  const orphanRisk = records.filter((r) => r.linkingImpact?.isOrphan).length;

  const gsc = perf.providers.find((p) => p.provider === 'search_console');
  const analytics = perf.providers.find((p) => p.provider === 'analytics');
  const wordpress = perf.providers.find((p) => p.provider === 'wordpress');

  const contentAvailable = articles.length > 0 || Boolean(index.indexedAt);

  return {
    id: newMeasurementId(),
    missionId,
    siteId,
    type,
    capturedAt: now,
    sourceVersions: {
      contentIndexAt: index.indexedAt || index.lastSyncedAt,
      performanceLastSyncedAt: perf.lastSyncedAt,
      decisionEngineVersion: String(DECISION_ENGINE_VERSION)
    },
    metrics: {
      content: {
        articleCount: contentAvailable
          ? metric('AVAILABLE', articles.length, 'content-index')
          : metric('UNAVAILABLE', undefined, 'content-index', 'Content index empty'),
        staleArticleCount: contentAvailable
          ? metric('AVAILABLE', stale, 'content-index.freshness')
          : metric('UNAVAILABLE', undefined, 'content-index'),
        contentGapCount: contentAvailable
          ? metric('AVAILABLE', (index.gaps || []).length, 'content-index.gaps')
          : metric('UNAVAILABLE', undefined, 'content-index'),
        opportunityCount: contentAvailable
          ? metric('AVAILABLE', (index.opportunities || []).length, 'content-index.opportunities')
          : metric('UNAVAILABLE', undefined, 'content-index')
      },
      seo: {
        seoIssueCount:
          records.length > 0
            ? metric('AVAILABLE', seoIssues, 'performance.health')
            : metric('UNAVAILABLE', undefined, 'performance', 'No performance records'),
        decayedArticleCount:
          records.length > 0
            ? metric('AVAILABLE', decayed, 'performance.decay')
            : metric('UNAVAILABLE', undefined, 'performance'),
        orphanRiskCount:
          records.length > 0
            ? metric('AVAILABLE', orphanRisk, 'performance.linkingImpact')
            : metric('UNAVAILABLE', undefined, 'performance')
      },
      performance: {
        impressions: sumVerifiedSnapshots(perf.snapshots || [], siteId, 'impressions', gsc),
        clicks: sumVerifiedSnapshots(perf.snapshots || [], siteId, 'clicks', gsc),
        ctr: sumVerifiedSnapshots(perf.snapshots || [], siteId, 'ctr', gsc),
        averagePosition: sumVerifiedSnapshots(perf.snapshots || [], siteId, 'position', gsc)
      },
      providers: {
        searchConsole: providerMetric(gsc),
        analytics: providerMetric(analytics),
        wordpress: providerMetric(wordpress)
      }
    }
  };
}

export function saveMeasurement(
  siteId: string,
  snap: MissionMeasurementSnapshot
): MissionMeasurementSnapshot {
  if (snap.siteId !== siteId) throw new Error('Site mismatch');
  const store = loadMissionStore(siteId);
  const measurements = Array.isArray(store.measurements) ? store.measurements : [];
  const idx = measurements.findIndex((m) => m.id === snap.id);
  if (idx >= 0) measurements[idx] = snap;
  else measurements.unshift(snap);
  store.measurements = measurements.filter((m) => m.siteId === siteId).slice(0, 80);
  saveMissionStore(siteId, store);
  return snap;
}

export function getMeasurement(
  siteId: string,
  measurementId: string
): MissionMeasurementSnapshot | undefined {
  const store = loadMissionStore(siteId);
  return (store.measurements || []).find((m) => m.id === measurementId && m.siteId === siteId);
}

export function getMissionMeasurements(
  siteId: string,
  missionId: string
): MissionMeasurementSnapshot[] {
  return (loadMissionStore(siteId).measurements || []).filter(
    (m) => m.missionId === missionId && m.siteId === siteId
  );
}

/** Capture + persist baseline when mission starts (idempotent if already set). */
export function captureBaseline(siteId: string, missionId: string): MissionMeasurementSnapshot {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  if (mission.baselineMeasurementId) {
    const existing = getMeasurement(siteId, mission.baselineMeasurementId);
    if (existing) return existing;
  }
  const snap = captureSiteSnapshot(siteId, missionId, 'BASELINE');
  saveMeasurement(siteId, snap);
  upsertMission(siteId, {
    ...mission,
    baselineMeasurementId: snap.id,
    updatedAt: new Date().toISOString()
  });
  emitDomainEvent({
    type: 'MISSION_BASELINE_CAPTURED',
    siteId,
    entityId: missionId,
    metadata: { measurementId: snap.id }
  });
  return snap;
}

/** Capture outcome snapshot for terminal mission states. */
export function captureOutcomeSnapshot(
  siteId: string,
  missionId: string
): MissionMeasurementSnapshot {
  const mission = getMission(siteId, missionId);
  if (!mission || mission.siteId !== siteId) throw new Error('Mission not found');
  const snap = captureSiteSnapshot(siteId, missionId, 'OUTCOME');
  saveMeasurement(siteId, snap);
  const latest = getMission(siteId, missionId);
  if (!latest) throw new Error('Mission not found');
  upsertMission(siteId, {
    ...latest,
    outcomeMeasurementId: snap.id,
    updatedAt: new Date().toISOString()
  });
  emitDomainEvent({
    type: 'MISSION_OUTCOME_CAPTURED',
    siteId,
    entityId: missionId,
    metadata: { measurementId: snap.id }
  });
  return snap;
}

export function listDirectTaskChanges(siteId: string, missionId: string): AttributedChangeDraft[] {
  const mission = getMission(siteId, missionId);
  if (!mission) return [];
  const plan = getActivePlan(siteId, mission);
  const tasks = plan?.tasks || [];
  const completed = tasks.filter((t) => t.status === 'COMPLETED');
  const drafts: AttributedChangeDraft[] = [];
  const count = (type: string) => completed.filter((t) => t.type === type).length;

  const refreshed = count('UPDATE_ARTICLE') + count('FIX_SEO');
  if (refreshed) {
    drafts.push({
      key: 'articles_refreshed',
      label: `${refreshed} article update/SEO tasks completed`,
      attribution: 'DIRECT_CHANGE',
      delta: refreshed,
      evidence: 'Mission task results'
    });
  }
  const created = count('CREATE_ARTICLE');
  if (created) {
    drafts.push({
      key: 'articles_created_reviewed',
      label: `${created} create-article reviews completed`,
      attribution: 'DIRECT_CHANGE',
      delta: created,
      evidence: 'Mission task results (human review — no auto-publish)'
    });
  }
  const research = count('RESEARCH');
  if (research) {
    drafts.push({
      key: 'research_refreshed',
      label: `${research} research tasks completed`,
      attribution: 'DIRECT_CHANGE',
      delta: research,
      evidence: 'Mission task results'
    });
  }
  const reviews = count('REVIEW_SOURCE') + count('REVIEW_CONTENT');
  if (reviews) {
    drafts.push({
      key: 'human_reviews',
      label: `${reviews} human review tasks approved`,
      attribution: 'DIRECT_CHANGE',
      delta: reviews,
      evidence: 'Mission approve path'
    });
  }
  const syncs = count('SYNC_CONTENT') + count('SYNC_PERFORMANCE');
  if (syncs) {
    drafts.push({
      key: 'syncs',
      label: `${syncs} sync tasks completed`,
      attribution: 'DIRECT_CHANGE',
      delta: syncs,
      evidence: 'Mission task → Job results'
    });
  }
  return drafts;
}

export interface AttributedChangeDraft {
  key: string;
  label: string;
  attribution: 'DIRECT_CHANGE' | 'OBSERVED_CHANGE' | 'UNKNOWN_CAUSE';
  delta?: number;
  evidence: string;
}
