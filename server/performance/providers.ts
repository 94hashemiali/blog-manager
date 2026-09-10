import type { PerformanceSnapshot, ProviderStatus } from './types.js';

export interface PagePerformanceRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
}

export interface QueryPerformanceRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  date: string;
}

export interface SearchPerformanceProvider {
  kind: 'search_console';
  getConnectionStatus(): ProviderStatus;
  getSitePerformance(params: {
    siteId: string;
    startDate: string;
    endDate: string;
  }): Promise<{ status: 'ok' | 'not_connected' | 'error'; rows: PagePerformanceRow[]; error?: string }>;
  getPagePerformance(params: {
    siteId: string;
    pageUrl: string;
    startDate: string;
    endDate: string;
  }): Promise<{ status: 'ok' | 'not_connected' | 'error'; rows: PagePerformanceRow[]; error?: string }>;
  getQueryPerformance(params: {
    siteId: string;
    startDate: string;
    endDate: string;
  }): Promise<{ status: 'ok' | 'not_connected' | 'error'; rows: QueryPerformanceRow[]; error?: string }>;
}

export interface AnalyticsProvider {
  kind: 'analytics';
  getConnectionStatus(): ProviderStatus;
}

/**
 * Search Console provider stub. Credentials are not wired yet, so every call
 * returns not_connected instead of inventing clicks/impressions.
 */
export class NotConnectedSearchConsoleProvider implements SearchPerformanceProvider {
  kind = 'search_console' as const;

  getConnectionStatus(): ProviderStatus {
    const configured = Boolean(process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID && process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET);
    return {
      provider: 'search_console',
      status: configured ? 'not_connected' : 'not_connected',
      label: 'Google Search Console',
      detail: configured
        ? 'اعتبارنامه پیکربندی شده اما OAuth هنوز متصل نشده است.'
        : 'یکپارچه‌سازی Search Console پیکربندی نشده است.',
      configured
    };
  }

  async getSitePerformance() {
    return { status: 'not_connected' as const, rows: [], error: 'Search Console is not connected.' };
  }

  async getPagePerformance() {
    return { status: 'not_connected' as const, rows: [], error: 'Search Console is not connected.' };
  }

  async getQueryPerformance() {
    return { status: 'not_connected' as const, rows: [], error: 'Search Console is not connected.' };
  }
}

export class NotConnectedAnalyticsProvider implements AnalyticsProvider {
  kind = 'analytics' as const;

  getConnectionStatus(): ProviderStatus {
    const configured = Boolean(process.env.GOOGLE_ANALYTICS_PROPERTY_ID);
    return {
      provider: 'analytics',
      status: 'not_connected',
      label: 'Google Analytics',
      detail: configured
        ? 'شناسهٔ property تنظیم شده اما اتصال فعال نیست.'
        : 'یکپارچه‌سازی Analytics پیکربندی نشده است.',
      configured
    };
  }
}

export function defaultProviderStatuses(): ProviderStatus[] {
  const gsc = new NotConnectedSearchConsoleProvider().getConnectionStatus();
  const ga = new NotConnectedAnalyticsProvider().getConnectionStatus();
  return [
    {
      provider: 'wordpress',
      status: 'connected',
      label: 'WordPress content index',
      detail: 'فرادادهٔ محتوا از ایندکس محلی وردپرس خوانده می‌شود.',
      configured: true
    },
    gsc,
    ga,
    {
      provider: 'manual',
      status: 'connected',
      label: 'Manual / imported notes',
      detail: 'ورودی دستی در صورت وجود ذخیره می‌شود؛ فعلاً خالی است.',
      configured: true
    }
  ];
}

export function getSearchConsoleProvider(): SearchPerformanceProvider {
  return new NotConnectedSearchConsoleProvider();
}

export function getAnalyticsProvider(): AnalyticsProvider {
  return new NotConnectedAnalyticsProvider();
}

/** Rejects snapshots that look fabricated or incomplete. */
export function validateSnapshot(input: unknown, siteId: string): PerformanceSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  if (String(row.siteId || '') !== siteId) return null;
  if (row.articleId == null || !row.date) return null;
  const source = String(row.source || '');
  if (!['wordpress', 'search_console', 'analytics', 'manual', 'imported'].includes(source)) return null;

  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

  // Position 0 is not a valid average position from Search Console.
  const position = num(row.position);
  if (position === 0) return null;

  return {
    id: String(row.id || `snap-${siteId}-${row.articleId}-${row.date}`),
    siteId,
    articleId: row.articleId as string | number,
    date: String(row.date),
    clicks: num(row.clicks),
    impressions: num(row.impressions),
    ctr: num(row.ctr),
    position,
    source: source as PerformanceSnapshot['source'],
    quality: (row.quality as PerformanceSnapshot['quality']) || 'UNKNOWN'
  };
}
