/**
 * Thin client for the Content Production OS routes.
 * Keeps fetch/error handling out of the React components.
 */

export type ProductionStage =
  | 'idea'
  | 'researched'
  | 'brief_ready'
  | 'drafting'
  | 'draft_ready'
  | 'fact_checked'
  | 'seo_ready'
  | 'review'
  | 'approved'
  | 'publishing'
  | 'published'
  | 'needs_revision';

export type ProgressStatus = 'done' | 'warn' | 'current' | 'todo';

export interface ProgressStep {
  key: string;
  label: string;
  status: ProgressStatus;
}

export interface ProductionJobSummary {
  id: string;
  stage: ProductionStage;
  topic: string;
  primaryKeyword: string;
  searchIntent: string;
  mode?: 'CREATE' | 'UPDATE' | 'MERGE';
  decision?: string;
  validationScore?: number;
  factCheckRisk?: string;
  seoScore?: number;
  versionCount: number;
  wordpressPostId?: number;
  publishedUrl?: string;
  updatedAt: string;
}

export interface NextArticleRecommendation {
  opportunityId: string;
  title: string;
  primaryKeyword: string;
  searchIntent: string;
  contentType: string;
  clusterName?: string;
  priority: number;
  confidence: string;
  whyBullets: string[];
  decision: string;
  cannibalizationRisk: string;
  evidenceAvailability: {
    relatedArticles: number;
    relatedProducts: number;
    verifiableFacts: number;
    status: 'strong' | 'partial' | 'thin';
  };
  clusterHealthScore?: number;
  seasonalNote?: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || data.message || data.reason || `خطای سرور ${response.status}`;
    const err: any = new Error(message);
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export function listProductionJobs(siteId: string) {
  return request<{ success: boolean; jobs: ProductionJobSummary[] }>(`/api/production/${siteId}/jobs`);
}

export function getProductionJob(siteId: string, jobId: string) {
  return request<{ success: boolean; job: any; progress: ProgressStep[] }>(
    `/api/production/${siteId}/jobs/${jobId}`
  );
}

export function createProductionJob(
  siteId: string,
  body: {
    topic: string;
    primaryKeyword?: string;
    searchIntent?: string;
    opportunityId?: string;
    targetAudience?: string;
  }
) {
  return request<{ success: boolean; job: any; progress: ProgressStep[] }>(`/api/production/${siteId}/jobs`, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function runStage(siteId: string, jobId: string, stage: string, body: Record<string, unknown> = {}) {
  return request<{ success: boolean; job: any; progress: ProgressStep[]; checklist?: any }>(
    `/api/production/${siteId}/jobs/${jobId}/${stage}`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function editSection(
  siteId: string,
  jobId: string,
  body: { sectionHeading: string; action: string; userInstruction?: string }
) {
  return request<{ success: boolean; job: any; progress: ProgressStep[] }>(
    `/api/production/${siteId}/jobs/${jobId}/section-edit`,
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function saveDraftContent(
  siteId: string,
  jobId: string,
  body: { title?: string; content?: string; metaDescription?: string; excerpt?: string; slug?: string; userNotes?: string }
) {
  return request<{ success: boolean; job: any; progress: ProgressStep[] }>(
    `/api/production/${siteId}/jobs/${jobId}/draft`,
    { method: 'PUT', body: JSON.stringify(body) }
  );
}

export function getNextArticles(siteId: string, limit = 8) {
  return request<{
    success: boolean;
    recommendations: NextArticleRecommendation[];
    indexEmpty: boolean;
    indexedAt: string;
  }>(`/api/production/${siteId}/next-articles?limit=${limit}`);
}

export function getVisualRequest(siteId: string, jobId: string) {
  return request<{ success: boolean; visualBrief: any; visualEngineRequest: any }>(
    `/api/production/${siteId}/jobs/${jobId}/visual-request`
  );
}

export function attachVisual(siteId: string, jobId: string, assetId: string) {
  return request<{ success: boolean; job: any; progress: ProgressStep[] }>(
    `/api/production/${siteId}/jobs/${jobId}/attach-visual`,
    { method: 'POST', body: JSON.stringify({ assetId }) }
  );
}

export function restoreJobVersion(siteId: string, jobId: string, version: number) {
  return request<{ success: boolean; job: any; progress: ProgressStep[] }>(
    `/api/production/${siteId}/jobs/${jobId}/versions/${version}/restore`,
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export const SECTION_ACTIONS = [
  { id: 'improve_clarity', label: 'روشن‌تر کردن' },
  { id: 'make_more_practical', label: 'عملی‌تر کردن' },
  { id: 'make_more_technical', label: 'فنی‌تر کردن' },
  { id: 'shorten', label: 'کوتاه کردن' },
  { id: 'expand', label: 'گسترش دادن' },
  { id: 'add_examples', label: 'افزودن مثال' },
  { id: 'improve_seo', label: 'بهبود سئو' },
  { id: 'fix_repetition', label: 'حذف تکرار' },
  { id: 'rewrite_introduction', label: 'بازنویسی مقدمه' },
  { id: 'rewrite_conclusion', label: 'بازنویسی جمع‌بندی' },
  { id: 'improve_faq', label: 'بهبود FAQ' },
  { id: 'improve_comparison', label: 'بهبود مقایسه' }
] as const;
