import fs from 'fs';
import { getAI } from '../geminiClient.js';
import { db } from '../db.js';
import { getWebSearchProvider } from '../research/providers.js';
import { getAnalyticsProvider, getSearchConsoleProvider } from '../performance/providers.js';
import { loadPerformanceStore } from '../performance/store.js';

export type ProviderHealthStatus =
  | 'configured'
  | 'connected'
  | 'not_configured'
  | 'misconfigured'
  | 'error'
  | 'unknown';

export interface ProviderCapabilityReport {
  id: string;
  label: string;
  status: ProviderHealthStatus;
  configured: boolean;
  capabilities: string[];
  detail: string;
}

function dataDirWritable(): { ok: boolean; detail: string } {
  const dir = process.env.BLOG_MANAGER_DATA_DIR || './data';
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return { ok: true, detail: dir };
  } catch (err: any) {
    return { ok: false, detail: err?.message || 'data dir not writable' };
  }
}

export function reportProviderCapabilities(siteId?: string): ProviderCapabilityReport[] {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && getAI());
  const site = siteId ? db.getSiteById(siteId) : undefined;
  const hasWpCreds = Boolean(site?.wordpress?.username && site?.wordpress?.applicationPassword);
  const web = getWebSearchProvider().getStatus();
  const gsc = getSearchConsoleProvider().getConnectionStatus();
  const ga = getAnalyticsProvider().getConnectionStatus();
  const perf = siteId ? loadPerformanceStore(siteId) : null;

  // Creds present ≠ live WP probe. Never claim "connected" without a successful
  // WordpressClient.getStatus() round-trip (kept out of this sync health path).
  const wpStatus: ProviderHealthStatus = !site
    ? 'unknown'
    : hasWpCreds
      ? 'configured'
      : 'not_configured';

  return [
    {
      id: 'gemini',
      label: 'Gemini',
      status: geminiConfigured ? 'configured' : 'not_configured',
      configured: geminiConfigured,
      capabilities: geminiConfigured
        ? ['json_generation', 'text_generation', 'image_generation']
        : [],
      detail: geminiConfigured ? 'GEMINI_API_KEY present' : 'GEMINI_API_KEY missing'
    },
    {
      id: 'wordpress',
      label: 'WordPress',
      status: wpStatus,
      configured: hasWpCreds,
      capabilities: hasWpCreds ? ['read_posts', 'write_posts', 'categories', 'products'] : [],
      detail: !site
        ? 'No site selected'
        : hasWpCreds
          ? 'Credentials present on server (reachability not probed on /health)'
          : 'WordPress application password not set on server'
    },
    {
      id: 'web_search',
      label: 'Web Search',
      status: web.status === 'not_configured' ? 'not_configured' : (web.status as ProviderHealthStatus),
      configured: web.configured,
      capabilities: web.configured ? ['search'] : [],
      detail: web.detail
    },
    {
      id: 'search_console',
      label: 'Search Console',
      status: gsc.status === 'not_connected' ? 'not_configured' : (gsc.status as ProviderHealthStatus),
      configured: gsc.configured,
      capabilities: gsc.configured
        ? ['page_performance', 'query_performance', 'clicks', 'impressions', 'ctr', 'position']
        : [],
      detail: gsc.detail
    },
    {
      id: 'analytics',
      label: 'Analytics',
      status: ga.status === 'not_connected' ? 'not_configured' : (ga.status as ProviderHealthStatus),
      configured: ga.configured,
      capabilities: ga.configured ? ['sessions', 'users', 'page_views'] : [],
      detail: ga.detail
    },
    {
      id: 'performance_store',
      label: 'Performance store',
      status: perf && perf.records.length > 0 ? 'configured' : 'unknown',
      configured: true,
      capabilities: ['overview', 'decay', 'opportunities'],
      detail: perf?.lastSyncedAt ? `Last synced ${perf.lastSyncedAt}` : 'Never synced'
    }
  ];
}

export function buildHealthPayload(siteId?: string) {
  const providers = reportProviderCapabilities(siteId);
  const gemini = providers.find((row) => row.id === 'gemini');
  const dataDir = dataDirWritable();
  const criticalDown = gemini?.status === 'not_configured' || !dataDir.ok;
  return {
    status: criticalDown ? 'degraded' : 'healthy',
    checkedAt: new Date().toISOString(),
    dataDir: dataDir.ok,
    dataDirPath: dataDir.detail,
    providers: Object.fromEntries(
      providers.map((row) => [row.id, { status: row.status, configured: row.configured, detail: row.detail }])
    ),
    capabilities: providers
  };
}
