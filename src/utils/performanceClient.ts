/**
 * Thin client for Content Performance Intelligence routes.
 */

export type ProviderConnectionStatus = 'connected' | 'not_connected' | 'misconfigured' | 'error';

export interface ProviderStatus {
  provider: string;
  status: ProviderConnectionStatus;
  label: string;
  detail: string;
  lastSyncedAt?: string;
  configured: boolean;
}

export interface PerformanceOverview {
  siteId: string;
  assessedAt: string;
  overall: 'healthy' | 'attention_needed' | 'needs_data';
  counts: {
    healthy: number;
    watch: number;
    declining: number;
    decayed: number;
    needsData: number;
    total: number;
  };
  providers: ProviderStatus[];
  topPriorities: ContentActionRecommendation[];
  createRecommendations: ContentActionRecommendation[];
  improveRecommendations: ContentActionRecommendation[];
  hasSearchPerformance: boolean;
  hasAnalytics: boolean;
}

export interface ContentActionRecommendation {
  id: string;
  siteId: string;
  articleId?: string | number;
  title: string;
  group: 'CREATE' | 'IMPROVE';
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityScore: number;
  reasons: string[];
  contributingSignals: string[];
  evidence: string[];
  confidence: string;
  opportunityId?: string;
}

export interface PerformanceArticleRow {
  articleId: string | number;
  title: string;
  url?: string;
  decayStatus: string;
  overallHealth: string;
  daysSinceModification: number | null;
  wordCount: number;
  opportunityCount: number;
  topOpportunity?: string;
  freshnessIssueCount: number;
  quality: string;
}

export interface HealthDimension {
  status: 'pass' | 'warning' | 'error' | 'unknown';
  reasons: string[];
  checks: Array<{ id: string; label: string; status: string; detail: string }>;
}

export interface ArticleHealth {
  overallStatus: 'healthy' | 'watch' | 'attention' | 'unknown';
  dimensions: {
    content: HealthDimension;
    seo: HealthDimension;
    freshness: HealthDimension;
    internalLinks: HealthDimension;
    facts: HealthDimension;
    performance: HealthDimension;
  };
  reasons: string[];
}

export interface PerformanceRecord {
  siteId: string;
  articleId: string | number;
  baseline: {
    title: string;
    url?: string;
    contentAgeDays: number | null;
    daysSinceModification: number | null;
    freshnessClass: string;
    wordCount: number;
    internalLinkCount: number;
    imageCount: number;
    quality: string;
  };
  decay: { status: string; reasons: string[]; signals: Array<{ type: string; severity: string; evidence: string }> };
  freshnessIssues: Array<{ type: string; location: string; severity: string; reason: string; suggestedAction: string }>;
  health: ArticleHealth;
  linkingImpact: {
    incoming: Array<{ title: string }>;
    outgoing: Array<{ title: string }>;
    clusterName?: string;
    potentialNewLinks: Array<{ title: string; reason: string }>;
    isOrphan: boolean;
  };
  opportunities: Array<{
    id: string;
    type: string;
    reason: string;
    evidence: string[];
    severity: string;
    recommendedAction: string;
    priority: number;
    contributingSignals: string[];
  }>;
  trend?: { direction: string; changePercent: number | null; reason: string; sampleSize: number };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || data.message || `خطای سرور ${response.status}`;
    const err: any = new Error(message);
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export function getPerformanceOverview(siteId: string) {
  return request<{ success: boolean; overview: PerformanceOverview }>(`/api/performance/${siteId}/overview`);
}

export function getPerformanceArticles(siteId: string) {
  return request<{ success: boolean; articles: PerformanceArticleRow[] }>(`/api/performance/${siteId}/articles`);
}

export function getPerformanceArticle(siteId: string, articleId: string | number) {
  return request<{ success: boolean; record: PerformanceRecord }>(
    `/api/performance/${siteId}/articles/${articleId}`
  );
}

export function getPerformanceOpportunities(siteId: string) {
  return request<{ success: boolean; opportunities: any[] }>(`/api/performance/${siteId}/opportunities`);
}

export function getNextActions(siteId: string) {
  return request<{
    success: boolean;
    create: ContentActionRecommendation[];
    improve: ContentActionRecommendation[];
    topPriorities: ContentActionRecommendation[];
  }>(`/api/performance/${siteId}/next-actions`);
}

export function syncPerformance(siteId: string, opts: { wait?: boolean } = {}) {
  return request<{
    success: boolean;
    jobId?: string;
    status?: string;
    created?: boolean;
    legacy?: boolean;
    overview?: PerformanceOverview;
    articleCount?: number;
    providers?: ProviderStatus[];
    message?: string;
  }>(`/api/performance/${siteId}/sync`, {
    method: 'POST',
    body: JSON.stringify({ wait: Boolean(opts.wait) })
  });
}

export function createUpdateJob(
  siteId: string,
  articleId: string | number,
  body: { reason?: string; enrichWithAi?: boolean; mode?: 'UPDATE' | 'MERGE' } = {}
) {
  return request<{ success: boolean; job: any; progress: any[]; plan: any; linkingImpact: any }>(
    `/api/performance/${siteId}/articles/${articleId}/create-update-job`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}
