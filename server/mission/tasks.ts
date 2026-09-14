import type { Decision } from '../decision/types.js';
import { newTaskId } from './store.js';
import type { MissionTask, MissionTaskType, TaskPriority } from './types.js';
import { REVIEW_TASK_TYPES } from './types.js';

export function decisionActionToTaskType(action: string): MissionTaskType | null {
  switch (action) {
    case 'REFRESH_RESEARCH':
    case 'RESEARCH':
      return 'RESEARCH';
    case 'UPDATE_ARTICLE':
    case 'ADD_INTERNAL_LINKS':
      return 'UPDATE_ARTICLE';
    case 'CREATE_ARTICLE':
      return 'CREATE_ARTICLE';
    case 'FIX_SEO':
      return 'FIX_SEO';
    case 'REVIEW_SOURCE':
      return 'REVIEW_SOURCE';
    case 'REVIEW_CONTENT':
    case 'REVIEW_ARTICLE':
      return 'REVIEW_CONTENT';
    case 'SYNC_PERFORMANCE':
      return 'SYNC_PERFORMANCE';
    case 'SYNC_CONTENT':
      return 'SYNC_CONTENT';
    case 'RETRY_OPERATION':
      return 'RETRY_OPERATION';
    case 'CONFIGURE_PROVIDER':
      return 'CONFIGURE_PROVIDER';
    case 'DEFER':
      return null;
    default:
      return null;
  }
}

export function taskLogicalKey(params: {
  type: MissionTaskType;
  articleId?: string | number;
  entityId?: string;
}): string {
  return [
    params.type,
    params.articleId != null ? String(params.articleId) : '-',
    params.entityId || '-'
  ].join('::');
}

/** Convert a Decision Engine decision into a MissionTask (no scoring). */
export function decisionToTask(
  decision: Decision,
  missionId: string,
  now = new Date().toISOString()
): MissionTask | null {
  const type = decisionActionToTaskType(decision.recommendedAction);
  if (!type) return null;

  const logicalKey = taskLogicalKey({
    type,
    articleId: decision.articleId,
    entityId: decision.entityId
  });

  // Only review task types (+ CREATE, which has no autonomous create job) pause for humans.
  // Mutation decisions with REQUIRES_REVIEW stay PENDING with blockers — do not auto-pause UPDATE.
  const needsReview =
    REVIEW_TASK_TYPES.includes(type) ||
    type === 'CREATE_ARTICLE' ||
    decision.recommendedAction === 'REVIEW_ARTICLE';

  return {
    id: newTaskId(),
    missionId,
    siteId: decision.siteId,
    title: decision.title,
    type,
    logicalKey,
    decisionId: decision.id,
    decisionAction: decision.recommendedAction,
    plannedAction: decision.recommendedAction,
    recommendationId: decision.recommendationId,
    articleId: decision.articleId,
    entityId: decision.entityId,
    status: needsReview ? 'WAITING_FOR_REVIEW' : 'PENDING',
    priority: decision.priority as TaskPriority,
    confidence: decision.confidence,
    expectedImpact: decision.expectedImpact,
    effort: decision.effort,
    score: decision.score,
    dependsOn: [],
    blocks: [],
    blockers: decision.blockers.map((b) => ({ code: b.code, message: b.message })),
    prerequisites: decision.explanation?.prerequisites || [],
    createdAt: now,
    updatedAt: now
  };
}

export function isReviewTask(task: MissionTask): boolean {
  return (
    task.status === 'WAITING_FOR_REVIEW' ||
    REVIEW_TASK_TYPES.includes(task.type) ||
    task.type === 'CREATE_ARTICLE'
  );
}
