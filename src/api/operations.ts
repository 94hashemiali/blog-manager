import type { OpsJob } from './jobs';

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function getOperationsSnapshot(siteId: string) {
  return parse(await fetch(`/api/operations/overview/${encodeURIComponent(siteId)}`)) as Promise<{
    success: boolean;
    snapshot: OperationsSnapshot;
  }>;
}

export async function getAttention(siteId: string) {
  return parse(await fetch(`/api/operations/attention/${encodeURIComponent(siteId)}`));
}

export async function getRecommendations(siteId: string) {
  return parse(await fetch(`/api/operations/recommendations/${encodeURIComponent(siteId)}`));
}

export async function syncRecommendations(siteId: string) {
  return parse(
    await fetch(`/api/operations/recommendations/${encodeURIComponent(siteId)}/sync`, {
      method: 'POST'
    })
  );
}

export async function acknowledgeRecommendation(siteId: string, id: string) {
  return parse(
    await fetch(
      `/api/operations/recommendations/${encodeURIComponent(siteId)}/${encodeURIComponent(id)}/acknowledge`,
      { method: 'POST' }
    )
  );
}

export async function dismissRecommendation(siteId: string, id: string) {
  return parse(
    await fetch(
      `/api/operations/recommendations/${encodeURIComponent(siteId)}/${encodeURIComponent(id)}/dismiss`,
      { method: 'POST' }
    )
  );
}

export async function executeRecommendation(siteId: string, id: string) {
  return parse(
    await fetch(
      `/api/operations/recommendations/${encodeURIComponent(siteId)}/${encodeURIComponent(id)}/execute`,
      { method: 'POST' }
    )
  );
}

export async function getTimeline(siteId: string) {
  return parse(await fetch(`/api/operations/timeline/${encodeURIComponent(siteId)}`));
}

export async function getContentHealth(siteId: string) {
  return parse(await fetch(`/api/operations/health/${encodeURIComponent(siteId)}`));
}

export async function getImpactDetail(siteId: string, impactId: string) {
  return parse(
    await fetch(
      `/api/operations/impacts/${encodeURIComponent(siteId)}/${encodeURIComponent(impactId)}`
    )
  );
}

export async function getReviewDiff(siteId: string, productionJobId: string) {
  return parse(
    await fetch(
      `/api/operations/review/${encodeURIComponent(siteId)}/diff/${encodeURIComponent(productionJobId)}`
    )
  );
}

/** Legacy ops overview (counts). Prefer getOperationsSnapshot. */
export async function getHealth(siteId?: string) {
  const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  const response = await fetch(`/api/health${qs}`);
  return response.json();
}

export async function getOpsOverview(siteId: string) {
  const response = await fetch(`/api/ops/${siteId}/overview`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error?.message || 'overview failed');
  return data as { success: boolean; overview: any };
}

export interface OperationsSnapshot {
  siteId: string;
  generatedAt: string;
  health: {
    overall: string;
    content: {
      status: string;
      score: number | null;
      reasons: string[];
      counts: Record<string, number>;
    };
    performance: { status: string; reasons: string[]; lastSyncedAt?: string };
    research: { status: string; reasons: string[]; staleCount: number; conflictCount: number };
    providers: Record<string, { status: string; configured: boolean; detail: string }>;
  };
  attention: AttentionItem[];
  activeJobs: number;
  queuedJobs: number;
  failedJobs: number;
  recoveryJobs: number;
  recommendations: OperationRecommendation[];
  openImpacts: Array<{
    id: string;
    sourceUrl: string;
    affectedProductionJobIds: string[];
    affectedSessionIds: string[];
    detectedAt: string;
    note?: string;
  }>;
  schedules: Array<{ id: string; type: string; enabled: boolean; interval: string; nextRunAt?: string }>;
  recentEvents: Array<{ eventId: string; type: string; timestamp: string; entityId?: string; jobId?: string }>;
  recentJobs: OpsJob[];
  reviewQueue: Array<{ id: string; topic: string; stage: string; mode?: string; updatedAt: string }>;
}

export interface AttentionItem {
  id: string;
  siteId: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  entityId?: string;
  articleId?: string | number;
  jobId?: string;
  sourceUrl?: string;
  createdAt: string;
  status: string;
  action: string;
  reasons: string[];
  priorityScore: number;
}

export interface OperationRecommendation {
  id: string;
  siteId: string;
  type: string;
  priority: string;
  title: string;
  explanation: string;
  entityId?: string;
  articleId?: string | number;
  suggestedAction: string;
  status: string;
  linkedJobId?: string;
  linkedProductionJobId?: string;
}
