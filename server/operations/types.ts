export const OPERATIONS_SCHEMA_VERSION = 1;

export type AttentionSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AttentionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
export type AttentionAction =
  | 'RESEARCH'
  | 'UPDATE'
  | 'REVIEW'
  | 'SYNC'
  | 'CONFIGURE'
  | 'RETRY'
  | 'VIEW';

export interface AttentionItem {
  id: string;
  siteId: string;
  type: string;
  severity: AttentionSeverity;
  title: string;
  description: string;
  entityId?: string;
  articleId?: string | number;
  jobId?: string;
  sourceUrl?: string;
  createdAt: string;
  status: AttentionStatus;
  action: AttentionAction;
  reasons: string[];
  priorityScore: number;
}

export type RecommendationType =
  | 'UPDATE_ARTICLE'
  | 'RESEARCH_ARTICLE'
  | 'FIX_SEO'
  | 'REVIEW_SOURCE'
  | 'SYNC_CONTENT'
  | 'CONFIGURE_PROVIDER'
  | 'RETRY_OPERATION'
  | 'RESEARCH_REFRESH';

export type RecommendationStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';

export interface OperationRecommendation {
  id: string;
  siteId: string;
  type: RecommendationType;
  priority: AttentionSeverity;
  title: string;
  explanation: string;
  entityId?: string;
  articleId?: string | number;
  sourceUrl?: string;
  triggerEventId?: string;
  suggestedAction: AttentionAction;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
  status: RecommendationStatus;
  linkedJobId?: string;
  linkedProductionJobId?: string;
  metadata?: Record<string, unknown>;
}

export type ContentHealthStatus = 'healthy' | 'needs_attention' | 'critical' | 'insufficient_data';

export interface ContentHealthSummary {
  status: ContentHealthStatus;
  score: number | null;
  reasons: string[];
  counts: {
    total: number;
    decaying: number;
    stale: number;
    seoIssues: number;
    researchIssues: number;
    sourceImpacts: number;
  };
  lastUpdated?: string;
}

export interface ArticleHealthView {
  articleId: string | number;
  title: string;
  score: number | null;
  status: ContentHealthStatus;
  reasons: string[];
  signals: string[];
  lastUpdated?: string;
}

export type AutomationPolicy = 'MONITOR_ONLY' | 'RECOMMEND' | 'AUTO_RESEARCH' | 'AUTO_UPDATE_DRAFT' | 'APPROVAL_REQUIRED';

export interface OperationsSnapshot {
  siteId: string;
  generatedAt: string;
  health: {
    overall: ContentHealthStatus;
    content: ContentHealthSummary;
    performance: { status: ContentHealthStatus; reasons: string[]; lastSyncedAt?: string };
    research: { status: ContentHealthStatus; reasons: string[]; staleCount: number; conflictCount: number };
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
  recentJobs: Array<Record<string, unknown>>;
  reviewQueue: Array<{ id: string; topic: string; stage: string; mode?: string; updatedAt: string }>;
}

export interface ContentDiffSection {
  kind: 'title' | 'heading' | 'paragraph' | 'meta';
  label: string;
  before?: string;
  after?: string;
  change: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface ContentDiffReport {
  titleChanged: boolean;
  sections: ContentDiffSection[];
  summary: string[];
}
