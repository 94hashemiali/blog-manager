/** Mission Plan layer — deterministic orchestration over Decision Engine. */

export const MISSION_SCHEMA_VERSION = 1;
export const MAX_CONCURRENT_MISSION_TASKS = 1;

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
  /** Active plan snapshot id. */
  activePlanId?: string;
}

/** List row with progress — no fabricated SEO metrics. */
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
  /** Stable logical key for dedupe across plan versions. */
  logicalKey: string;
  decisionId?: string;
  decisionAction?: string;
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
  result?: {
    message?: string;
    opsJobId?: string;
    productionJobId?: string;
    at?: string;
  };
  /** Original decision action at plan time — for stale detection. */
  plannedAction?: string;
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
  decisionEngineVersion: number;
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

export const MISSION_GOALS: MissionGoal[] = [
  'ORGANIC_GROWTH',
  'CONTENT_REFRESH',
  'CONTENT_EXPANSION',
  'SEO_IMPROVEMENT',
  'RESEARCH_REFRESH',
  'CONTENT_HEALTH',
  'CUSTOM'
];

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

export interface MissionStore {
  schemaVersion: number;
  siteId: string;
  missions: Mission[];
  plans: MissionPlan[];
  diffs: PlanDiff[];
  outcomes: MissionOutcome[];
}

/** Goal → allowed decision actions (filter only — no second scoring). */
export const GOAL_ACTION_FILTER: Record<MissionGoal, string[] | null> = {
  ORGANIC_GROWTH: [
    'UPDATE_ARTICLE',
    'CREATE_ARTICLE',
    'FIX_SEO',
    'SYNC_PERFORMANCE',
    'REFRESH_RESEARCH',
    'RESEARCH'
  ],
  CONTENT_REFRESH: [
    'UPDATE_ARTICLE',
    'REFRESH_RESEARCH',
    'FIX_SEO',
    'REVIEW_SOURCE',
    'REVIEW_CONTENT',
    'REVIEW_ARTICLE'
  ],
  CONTENT_EXPANSION: ['CREATE_ARTICLE', 'RESEARCH', 'REFRESH_RESEARCH', 'REVIEW_CONTENT'],
  SEO_IMPROVEMENT: ['FIX_SEO', 'UPDATE_ARTICLE', 'SYNC_CONTENT', 'SYNC_PERFORMANCE'],
  RESEARCH_REFRESH: ['REFRESH_RESEARCH', 'RESEARCH', 'REVIEW_SOURCE'],
  CONTENT_HEALTH: [
    'UPDATE_ARTICLE',
    'REVIEW_ARTICLE',
    'REVIEW_CONTENT',
    'RETRY_OPERATION',
    'CONFIGURE_PROVIDER',
    'SYNC_CONTENT',
    'FIX_SEO'
  ],
  CUSTOM: null
};

export const REVIEW_TASK_TYPES: MissionTaskType[] = [
  'REVIEW_SOURCE',
  'REVIEW_CONTENT',
  'CONFIGURE_PROVIDER'
];
