/** Thin typed client for Mission APIs — no business logic. */

export type MissionGoal =
  | 'ORGANIC_GROWTH'
  | 'CONTENT_REFRESH'
  | 'CONTENT_EXPANSION'
  | 'SEO_IMPROVEMENT'
  | 'RESEARCH_REFRESH'
  | 'CONTENT_HEALTH'
  | 'CUSTOM';

export type MissionStatus =
  | 'DRAFT'
  | 'PLANNING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING_FOR_REVIEW'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type MissionTaskType =
  | 'RESEARCH'
  | 'UPDATE_ARTICLE'
  | 'CREATE_ARTICLE'
  | 'VISUAL_GENERATION'
  | 'FIX_SEO'
  | 'REVIEW_SOURCE'
  | 'REVIEW_CONTENT'
  | 'SYNC_PERFORMANCE'
  | 'SYNC_CONTENT'
  | 'RETRY_OPERATION'
  | 'CONFIGURE_PROVIDER';

export type MissionTaskStatus =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'WAITING_FOR_REVIEW'
  | 'STALE'
  | 'CANCELLED'
  | 'SKIPPED';

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface Mission {
  id: string;
  siteId: string;
  title: string;
  description: string;
  goal: MissionGoal;
  status: MissionStatus;
  planId?: string;
  planVersion: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  targetDate?: string;
  activePlanId?: string;
}

export interface MissionListItem extends Mission {
  progress: number;
  completedTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  runningTasks: number;
  failedTasks: number;
  taskCount: number;
  nextTaskTitle?: string;
  nextReason?: string;
}

export interface MissionTask {
  id: string;
  missionId: string;
  siteId: string;
  title: string;
  type: MissionTaskType;
  logicalKey: string;
  decisionId?: string;
  decisionAction?: string;
  plannedAction?: string;
  recommendationId?: string;
  jobId?: string;
  articleId?: string | number;
  entityId?: string;
  status: MissionTaskStatus;
  priority: TaskPriority;
  confidence?: string;
  expectedImpact?: string;
  effort?: number;
  score?: number;
  dependsOn: string[];
  blocks: string[];
  blockers: Array<{ code: string; message: string }>;
  prerequisites: string[];
  createdAt: string;
  updatedAt: string;
  result?: { message?: string; opsJobId?: string; productionJobId?: string; at?: string };
}

export interface MissionEdge {
  from: string;
  to: string;
  reason: string;
}

export interface MissionPlan {
  id: string;
  missionId: string;
  siteId: string;
  version: number;
  generatedAt: string;
  decisionEngineVersion?: string;
  tasks: MissionTask[];
  edges: MissionEdge[];
  expectedImpact?: string;
  estimatedEffort?: number;
  blockers: Array<{ code: string; message: string }>;
  assumptions: string[];
}

export interface PlanDiff {
  missionId: string;
  planVersionFrom: number;
  planVersionTo: number;
  addedTasks: string[];
  removedTasks: string[];
  changedTasks: string[];
  unchangedTasks: string[];
  reason: string;
  at: string;
}

export type NextTaskReason =
  | 'WAITING_FOR_REVIEW'
  | 'BLOCKED'
  | 'WAITING_FOR_DEPENDENCY'
  | 'NO_ACTIONABLE_TASK'
  | 'MISSION_COMPLETED'
  | 'MISSION_PAUSED'
  | 'MISSION_NOT_RUNNING'
  | 'CONCURRENCY_LIMIT';

export interface NextTaskResult {
  task: MissionTask | null;
  reason?: NextTaskReason;
  detail?: string;
}

export interface MissionEvaluation {
  missionId: string;
  siteId: string;
  status: MissionStatus;
  planVersion: number;
  progress: number;
  completedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  failedTasks: number;
  staleTasks: number;
  nextTask: MissionTask | null;
  nextReason?: NextTaskReason;
}

export interface MissionOutcome {
  missionId: string;
  siteId: string;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  decisionsEvaluated: number;
  jobsExecuted: number;
  startedAt?: string;
  completedAt?: string;
  performance?: 'INSUFFICIENT_DATA' | { beforeRecords: number; afterRecords: number };
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

const base = (siteId: string) => `/api/missions/${encodeURIComponent(siteId)}`;

export async function listMissions(siteId: string): Promise<{ missions: MissionListItem[] }> {
  return parse(await fetch(base(siteId)));
}

export async function createMission(
  siteId: string,
  body: { title: string; description?: string; goal?: MissionGoal; targetDate?: string }
): Promise<{ mission: Mission }> {
  return parse(
    await fetch(base(siteId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
}

export async function getMission(
  siteId: string,
  missionId: string
): Promise<{ mission: Mission; plan: MissionPlan | null }> {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}`));
}

export async function planMission(
  siteId: string,
  missionId: string
): Promise<{ mission: Mission; plan: MissionPlan }> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/plan`, { method: 'POST' })
  );
}

export async function getMissionPlan(
  siteId: string,
  missionId: string
): Promise<{ plan: MissionPlan; order: string[] }> {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/plan`));
}

export async function startMission(
  siteId: string,
  missionId: string
): Promise<{ mission: Mission; next: NextTaskResult }> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/start`, { method: 'POST' })
  );
}

export async function pauseMission(siteId: string, missionId: string): Promise<{ mission: Mission }> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/pause`, { method: 'POST' })
  );
}

export async function resumeMission(
  siteId: string,
  missionId: string
): Promise<{ mission: Mission; next: NextTaskResult }> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/resume`, { method: 'POST' })
  );
}

export async function cancelMission(
  siteId: string,
  missionId: string
): Promise<{ mission: Mission }> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/cancel`, { method: 'POST' })
  );
}

export async function replanMission(
  siteId: string,
  missionId: string,
  reason?: string
): Promise<{ mission: Mission; plan: MissionPlan; diff: PlanDiff }> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/replan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    })
  );
}

export async function getMissionTasks(
  siteId: string,
  missionId: string
): Promise<{ tasks: MissionTask[]; edges: MissionEdge[]; order: string[] }> {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/tasks`));
}

export async function getNextMissionTask(
  siteId: string,
  missionId: string
): Promise<NextTaskResult & { success?: boolean }> {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/next-task`));
}

export async function getMissionEvaluation(
  siteId: string,
  missionId: string
): Promise<{ evaluation: MissionEvaluation; outcome: MissionOutcome }> {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/evaluation`));
}

export async function getMissionDiff(
  siteId: string,
  missionId: string
): Promise<{ diff: PlanDiff | null }> {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/diff`));
}

export async function advanceMission(
  siteId: string,
  missionId: string
): Promise<{
  mission: Mission;
  task: MissionTask;
  message: string;
  opsJobId?: string;
  productionJobId?: string;
  replanned?: boolean;
}> {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(missionId)}/advance`, { method: 'POST' })
  );
}

export async function executeMissionTask(
  siteId: string,
  missionId: string,
  taskId: string
): Promise<{
  mission: Mission;
  task: MissionTask;
  message: string;
  opsJobId?: string;
  productionJobId?: string;
  replanned?: boolean;
}> {
  return parse(
    await fetch(
      `${base(siteId)}/${encodeURIComponent(missionId)}/tasks/${encodeURIComponent(taskId)}/execute`,
      { method: 'POST' }
    )
  );
}

export async function approveMissionTask(
  siteId: string,
  missionId: string,
  taskId: string
): Promise<{ mission: Mission; task: MissionTask; message: string }> {
  return parse(
    await fetch(
      `${base(siteId)}/${encodeURIComponent(missionId)}/tasks/${encodeURIComponent(taskId)}/approve`,
      { method: 'POST' }
    )
  );
}
