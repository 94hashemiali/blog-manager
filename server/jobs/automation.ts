import crypto from 'crypto';
import { db } from '../db.js';
import type { AutomationRule, DomainEvent, DomainEventType } from './types.js';
import { enqueueJob } from './enqueue.js';
import { listDomainEvents } from './events.js';
import type { AutomationPolicy } from '../operations/types.js';
import { upsertRecommendation, recommendationDedupeKey } from '../operations/recommendations.js';

const DEFAULT_MAX_ACTIONS_PER_HOUR = 20;
const PROCESSED_CAP = 500;
const ACTION_LOG_CAP = 200;

interface AutomationActionLogEntry {
  at: string;
  ruleId: string;
  eventId: string;
  action: string;
  jobId?: string;
}

interface AutomationStore {
  schemaVersion: number;
  rules: AutomationRule[];
  recommendations: Array<{
    id: string;
    siteId: string;
    text: string;
    triggerEventId?: string;
    createdAt: string;
    status: 'OPEN' | 'DISMISSED';
  }>;
  /** eventId::ruleId — prevent infinite event→automation→event loops. */
  processedKeys: string[];
  actionLog: AutomationActionLogEntry[];
  settings: {
    monitoringEnabled: boolean;
    automaticContentGeneration: boolean;
    automaticPublishing: boolean;
    policy: AutomationPolicy;
    maxActionsPerHour: number;
  };
}

function defaults(): AutomationStore {
  return {
    schemaVersion: 2,
    rules: [],
    recommendations: [],
    processedKeys: [],
    actionLog: [],
    settings: {
      monitoringEnabled: false,
      automaticContentGeneration: false,
      automaticPublishing: false,
      policy: 'RECOMMEND',
      maxActionsPerHour: DEFAULT_MAX_ACTIONS_PER_HOUR
    }
  };
}

function processedKey(eventId: string, ruleId: string): string {
  return `${eventId}::${ruleId}`;
}

function countActionsLastHour(log: AutomationActionLogEntry[]): number {
  const cutoff = Date.now() - 60 * 60 * 1000;
  return log.filter((row) => {
    const t = Date.parse(row.at);
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

export function loadAutomation(siteId: string): AutomationStore {
  const raw = db.getAutomationStore(siteId);
  if (!raw || typeof raw !== 'object') return defaults();
  const base = defaults();
  return {
    ...base,
    ...raw,
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      automaticPublishing: false,
      policy: (raw.settings?.policy as AutomationPolicy) || 'RECOMMEND',
      maxActionsPerHour:
        typeof raw.settings?.maxActionsPerHour === 'number'
          ? raw.settings.maxActionsPerHour
          : DEFAULT_MAX_ACTIONS_PER_HOUR
    },
    rules: Array.isArray(raw.rules) ? raw.rules.filter((r: AutomationRule) => r.siteId === siteId) : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.filter((r: any) => r.siteId === siteId)
      : [],
    processedKeys: Array.isArray(raw.processedKeys) ? raw.processedKeys.slice(0, PROCESSED_CAP) : [],
    actionLog: Array.isArray(raw.actionLog) ? raw.actionLog.slice(0, ACTION_LOG_CAP) : []
  };
}

export function saveAutomation(siteId: string, store: AutomationStore): AutomationStore {
  const next = {
    ...store,
    siteId,
    schemaVersion: 2,
    settings: {
      ...store.settings,
      automaticPublishing: false
    },
    processedKeys: store.processedKeys.slice(0, PROCESSED_CAP),
    actionLog: store.actionLog.slice(0, ACTION_LOG_CAP)
  };
  db.saveAutomationStore(siteId, next);
  return next;
}

export function updateAutomationSettings(
  siteId: string,
  patch: Partial<AutomationStore['settings']>
): AutomationStore {
  const store = loadAutomation(siteId);
  store.settings = {
    ...store.settings,
    ...patch,
    automaticPublishing: false
  };
  return saveAutomation(siteId, store);
}

export function upsertAutomationRule(rule: Omit<AutomationRule, 'id'> & { id?: string }): AutomationRule {
  const store = loadAutomation(rule.siteId);
  const row: AutomationRule = {
    ...rule,
    id: rule.id || `rule-${crypto.randomBytes(3).toString('hex')}`
  };
  const idx = store.rules.findIndex((r) => r.id === row.id);
  if (idx >= 0) store.rules[idx] = row;
  else store.rules.push(row);
  saveAutomation(rule.siteId, store);
  return row;
}

function recordLegacyRecommendation(
  store: AutomationStore,
  event: DomainEvent,
  text: string
): void {
  store.recommendations.unshift({
    id: `rec-${crypto.randomBytes(3).toString('hex')}`,
    siteId: event.siteId,
    text,
    triggerEventId: event.eventId,
    createdAt: new Date().toISOString(),
    status: 'OPEN'
  });
  store.recommendations = store.recommendations.slice(0, 100);
}

function markProcessed(
  store: AutomationStore,
  event: DomainEvent,
  rule: AutomationRule,
  action: string,
  jobId?: string
): void {
  const key = processedKey(event.eventId, rule.id);
  if (!store.processedKeys.includes(key)) {
    store.processedKeys.unshift(key);
    store.processedKeys = store.processedKeys.slice(0, PROCESSED_CAP);
  }
  store.actionLog.unshift({
    at: new Date().toISOString(),
    ruleId: rule.id,
    eventId: event.eventId,
    action,
    jobId
  });
  store.actionLog = store.actionLog.slice(0, ACTION_LOG_CAP);
}

/**
 * Evaluate rules against a domain event.
 * May create research/update/performance jobs or recommendations.
 * NEVER creates PUBLISH jobs.
 */
export function applyAutomationForEvent(event: DomainEvent): Array<{ action: string; jobId?: string }> {
  const store = loadAutomation(event.siteId);
  if (!store.settings.monitoringEnabled) return [];

  const policy = store.settings.policy || 'RECOMMEND';
  if (policy === 'MONITOR_ONLY') return [];

  const results: Array<{ action: string; jobId?: string }> = [];
  let dirty = false;
  const maxPerHour = store.settings.maxActionsPerHour || DEFAULT_MAX_ACTIONS_PER_HOUR;

  for (const rule of store.rules) {
    if (!rule.enabled) continue;
    if (rule.trigger !== event.type) continue;

    const key = processedKey(event.eventId, rule.id);
    if (store.processedKeys.includes(key)) continue;

    if (countActionsLastHour(store.actionLog) >= maxPerHour) {
      upsertRecommendation({
        siteId: event.siteId,
        type: 'RETRY_OPERATION',
        priority: 'MEDIUM',
        title: 'Automation rate limited',
        explanation: `Max ${maxPerHour} automated actions/hour exceeded. Event ${event.type} deferred for rule ${rule.id}.`,
        entityId: event.eventId,
        triggerEventId: event.eventId,
        suggestedAction: 'VIEW',
        dedupeKey: recommendationDedupeKey({
          siteId: event.siteId,
          type: 'RETRY_OPERATION',
          entityId: `rate-limit-${new Date().toISOString().slice(0, 13)}`,
          reasonCategory: 'AUTOMATION_RATE_LIMITED'
        }),
        metadata: { automationRateLimited: true, ruleId: rule.id, eventType: event.type }
      });
      // Do NOT markProcessed — event/rule must retry after rate window.
      results.push({ action: 'AUTOMATION_RATE_LIMITED' });
      dirty = true;
      break;
    }

    const explain = `Triggered by: ${event.type}. Rule: ${rule.label}.`;

    if (rule.action === 'RECORD_RECOMMENDATION' || rule.action === 'CREATE_REVIEW_TASK') {
      recordLegacyRecommendation(store, event, rule.label || `${event.type} needs attention`);
      upsertRecommendation({
        siteId: event.siteId,
        type: 'REVIEW_SOURCE',
        priority: 'MEDIUM',
        title: rule.label || `${event.type} needs attention`,
        explanation: explain,
        entityId: event.entityId,
        triggerEventId: event.eventId,
        suggestedAction: 'REVIEW',
        dedupeKey: recommendationDedupeKey({
          siteId: event.siteId,
          type: 'REVIEW_SOURCE',
          entityId: event.entityId || event.eventId,
          reasonCategory: `AUTO_${event.type}`
        }),
        metadata: { ruleId: rule.id, automationExplain: explain }
      });
      markProcessed(store, event, rule, rule.action);
      results.push({ action: rule.action });
      dirty = true;
      continue;
    }

    if (rule.action === 'CREATE_PERFORMANCE_SYNC') {
      if (policy === 'APPROVAL_REQUIRED') {
        upsertRecommendation({
          siteId: event.siteId,
          type: 'SYNC_CONTENT',
          priority: 'LOW',
          title: 'Approve performance sync',
          explanation: explain,
          triggerEventId: event.eventId,
          suggestedAction: 'SYNC',
          dedupeKey: recommendationDedupeKey({
            siteId: event.siteId,
            type: 'SYNC_CONTENT',
            entityId: event.eventId,
            reasonCategory: 'AUTO_PERF'
          }),
          metadata: { ruleId: rule.id, automationExplain: explain, opsJobType: 'PERFORMANCE_SYNC' }
        });
        markProcessed(store, event, rule, 'RECORD_RECOMMENDATION');
        results.push({ action: 'RECORD_RECOMMENDATION' });
        dirty = true;
        continue;
      }
      const { job } = enqueueJob({
        siteId: event.siteId,
        type: 'PERFORMANCE_SYNC',
        priority: 'LOW',
        triggerReason: `${rule.label} | ${explain}`,
        triggerEventId: event.eventId,
        idempotencyKey: `auto-perf-${event.siteId}-${event.eventId}`
      });
      markProcessed(store, event, rule, rule.action, job.id);
      results.push({ action: rule.action, jobId: job.id });
      dirty = true;
      continue;
    }

    if (rule.action === 'CREATE_RESEARCH_JOB') {
      const topic = String(event.metadata?.topic || '');
      const allowAutoResearch = policy === 'AUTO_RESEARCH' || policy === 'AUTO_UPDATE_DRAFT';
      if (!topic || !allowAutoResearch) {
        recordLegacyRecommendation(store, event, `Research refresh recommended (${event.type})`);
        upsertRecommendation({
          siteId: event.siteId,
          type: 'RESEARCH_REFRESH',
          priority: 'MEDIUM',
          title: `Research recommended: ${topic || event.type}`,
          explanation: explain,
          entityId: event.entityId,
          triggerEventId: event.eventId,
          suggestedAction: 'RESEARCH',
          dedupeKey: recommendationDedupeKey({
            siteId: event.siteId,
            type: 'RESEARCH_REFRESH',
            entityId: event.entityId || topic || event.eventId,
            reasonCategory: 'AUTO_RESEARCH'
          }),
          metadata: { topic, ruleId: rule.id, automationExplain: explain }
        });
        markProcessed(store, event, rule, 'RECORD_RECOMMENDATION');
        results.push({ action: 'RECORD_RECOMMENDATION' });
        dirty = true;
        continue;
      }
      const { job } = enqueueJob({
        siteId: event.siteId,
        type: 'RESEARCH',
        payload: { topic },
        triggerReason: `${rule.label} | ${explain}`,
        triggerEventId: event.eventId,
        entityKey: `research:${topic}`,
        idempotencyKey: `auto-research-${event.siteId}-${event.eventId}-${topic}`
      });
      markProcessed(store, event, rule, rule.action, job.id);
      results.push({ action: rule.action, jobId: job.id });
      dirty = true;
      continue;
    }

    if (rule.action === 'CREATE_UPDATE_JOB') {
      const articleId = event.metadata?.articleId;
      const allowDraft = policy === 'AUTO_UPDATE_DRAFT' && articleId != null;
      if (!allowDraft) {
        recordLegacyRecommendation(store, event, `Update recommended: ${rule.label} (${event.type})`);
        upsertRecommendation({
          siteId: event.siteId,
          type: 'UPDATE_ARTICLE',
          priority: 'HIGH',
          title: `Update recommended: ${rule.label}`,
          explanation: explain,
          entityId: articleId != null ? String(articleId) : event.entityId,
          articleId: articleId as string | number | undefined,
          triggerEventId: event.eventId,
          suggestedAction: 'UPDATE',
          dedupeKey: recommendationDedupeKey({
            siteId: event.siteId,
            type: 'UPDATE_ARTICLE',
            entityId: articleId != null ? String(articleId) : event.entityId || event.eventId,
            reasonCategory: 'AUTO_UPDATE'
          }),
          metadata: { ruleId: rule.id, automationExplain: explain, articleId }
        });
        markProcessed(store, event, rule, 'RECORD_RECOMMENDATION');
        results.push({ action: 'RECORD_RECOMMENDATION' });
        dirty = true;
        continue;
      }
      // Explicit article + AUTO_UPDATE_DRAFT — still never publish.
      // Defer to recommendation execute path for production job creation (safer).
      upsertRecommendation({
        siteId: event.siteId,
        type: 'UPDATE_ARTICLE',
        priority: 'HIGH',
        title: `Auto-draft update allowed: article ${articleId}`,
        explanation: `${explain} Policy AUTO_UPDATE_DRAFT — execute recommendation to create draft job.`,
        entityId: String(articleId),
        articleId: articleId as string | number,
        triggerEventId: event.eventId,
        suggestedAction: 'UPDATE',
        dedupeKey: recommendationDedupeKey({
          siteId: event.siteId,
          type: 'UPDATE_ARTICLE',
          entityId: String(articleId),
          reasonCategory: 'AUTO_UPDATE_DRAFT'
        }),
        metadata: { ruleId: rule.id, automationExplain: explain, autoDraft: true }
      });
      markProcessed(store, event, rule, 'RECORD_RECOMMENDATION');
      results.push({ action: 'RECORD_RECOMMENDATION' });
      dirty = true;
    }
  }

  if (dirty) saveAutomation(event.siteId, store);
  return results;
}

export function listAutomationRecommendations(siteId: string) {
  return loadAutomation(siteId).recommendations.filter((r) => r.status === 'OPEN');
}

export function processRecentEventsForAutomation(siteId: string, limit = 10): void {
  for (const event of listDomainEvents(siteId, limit)) {
    applyAutomationForEvent(event);
  }
}

export type { DomainEventType };
