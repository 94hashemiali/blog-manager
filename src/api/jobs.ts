export type OpsJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'RECOVERY_REQUIRED';

export type OpsJobType =
  | 'CONTENT_PRODUCTION'
  | 'CONTENT_UPDATE'
  | 'RESEARCH'
  | 'PERFORMANCE_SYNC'
  | 'INTELLIGENCE_SYNC'
  | 'PUBLISH'
  | 'VISUAL_GENERATION';

export interface OpsJob {
  id: string;
  siteId: string;
  type: OpsJobType;
  status: OpsJobStatus;
  priority: string;
  progress: { current: number; total: number; percentage: number; label: string };
  currentStage?: string;
  stages: string[];
  retryCount: number;
  maxRetries: number;
  lastError?: { code: string; message: string; retryable: boolean };
  productionJobId?: string;
  triggerReason?: string;
  timeline: Array<{ at: string; type: string; message: string; stage?: string }>;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRetryAt?: string;
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function listJobs(params: { siteId?: string; type?: string; status?: string } = {}) {
  const q = new URLSearchParams();
  if (params.siteId) q.set('siteId', params.siteId);
  if (params.type) q.set('type', params.type);
  if (params.status) q.set('status', params.status);
  return parse(await fetch(`/api/jobs?${q.toString()}`));
}

export async function getJob(jobId: string, siteId?: string) {
  const q = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  return parse(await fetch(`/api/jobs/${encodeURIComponent(jobId)}${q}`));
}

export async function createJob(body: Record<string, unknown>) {
  return parse(
    await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
}

export async function cancelJob(jobId: string, siteId?: string) {
  return parse(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId })
    })
  );
}

export async function retryJob(jobId: string, siteId?: string) {
  return parse(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId })
    })
  );
}

export async function pauseJob(jobId: string, siteId?: string) {
  return parse(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId })
    })
  );
}

export async function resumeJob(jobId: string, siteId?: string) {
  return parse(
    await fetch(`/api/jobs/${encodeURIComponent(jobId)}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId })
    })
  );
}

export async function getOperationsOverview(siteId?: string) {
  const q = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  return parse(await fetch(`/api/operations/overview${q}`));
}

export async function getAutomationSettings(siteId: string) {
  return parse(await fetch(`/api/operations/automation/${encodeURIComponent(siteId)}`));
}

export async function saveAutomationSettings(siteId: string, body: Record<string, unknown>) {
  return parse(
    await fetch(`/api/operations/automation/${encodeURIComponent(siteId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
}

export function isTerminalStatus(status: OpsJobStatus) {
  return (
    status === 'COMPLETED' ||
    status === 'FAILED' ||
    status === 'CANCELLED' ||
    status === 'INTERRUPTED' ||
    status === 'RECOVERY_REQUIRED'
  );
}

export function isSuccessfulStatus(status: OpsJobStatus) {
  return status === 'COMPLETED';
}

/** Poll until terminal or timeout. Throws unless COMPLETED. */
export async function pollJob(
  jobId: string,
  opts: { siteId?: string; intervalMs?: number; timeoutMs?: number; onUpdate?: (job: OpsJob) => void } = {}
): Promise<OpsJob> {
  const intervalMs = opts.intervalMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const data = await getJob(jobId, opts.siteId);
    const job = data.job as OpsJob;
    opts.onUpdate?.(job);
    if (isSuccessfulStatus(job.status)) return job;
    if (isTerminalStatus(job.status)) {
      throw new Error(job.lastError?.message || `Job ended with status ${job.status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Job polling timed out');
}
