import crypto from 'crypto';
import { db } from '../db.js';
import type { AutomationRule, DomainEvent, DomainEventType } from './types.js';
import { enqueueJob } from './enqueue.js';
import { listDomainEvents } from './events.js';

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
  /** Hard defaults — never auto-publish. */
  settings: {
    monitoringEnabled: boolean;
    automaticContentGeneration: boolean;
    automaticPublishing: boolean;
  };
}

function defaults(): AutomationStore {
  return {
    schemaVersion: 1,
    rules: [],
    recommendations: [],
    settings: {
      monitoringEnabled: false,
      automaticContentGeneration: false,
      automaticPublishing: false
    }
  };
}

export function loadAutomation(siteId: string): AutomationStore {
  const raw = db.getAutomationStore(siteId);
  if (!raw || typeof raw !== 'object') return defaults();
  return {
    ...defaults(),
    ...raw,
    settings: {
      ...defaults().settings,
      ...(raw.settings || {}),
      automaticPublishing: false
    },
    rules: Array.isArray(raw.rules) ? raw.rules.filter((r: AutomationRule) => r.siteId === siteId) : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.filter((r: any) => r.siteId === siteId)
      : []
  };
}

export function saveAutomation(siteId: string, store: AutomationStore): AutomationStore {
  const next = {
    ...store,
    siteId,
    schemaVersion: 1,
    settings: {
      ...store.settings,
      automaticPublishing: false
    }
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

/**
 * Evaluate rules against a domain event.
 * May create research/update/performance jobs or recommendations.
 * NEVER creates PUBLISH jobs.
 */
export function applyAutomationForEvent(event: DomainEvent): Array<{ action: string; jobId?: string }> {
  const store = loadAutomation(event.siteId);
  if (!store.settings.monitoringEnabled) return [];

  const results: Array<{ action: string; jobId?: string }> = [];
  for (const rule of store.rules) {
    if (!rule.enabled) continue;
    if (rule.trigger !== event.type) continue;

    if (rule.action === 'RECORD_RECOMMENDATION' || rule.action === 'CREATE_REVIEW_TASK') {
      store.recommendations.unshift({
        id: `rec-${crypto.randomBytes(3).toString('hex')}`,
        siteId: event.siteId,
        text: rule.label || `${event.type} needs attention`,
        triggerEventId: event.eventId,
        createdAt: new Date().toISOString(),
        status: 'OPEN'
      });
      results.push({ action: rule.action });
      continue;
    }

    if (rule.action === 'CREATE_PERFORMANCE_SYNC') {
      const { job } = enqueueJob({
        siteId: event.siteId,
        type: 'PERFORMANCE_SYNC',
        priority: 'LOW',
        triggerReason: rule.label,
        triggerEventId: event.eventId,
        idempotencyKey: `auto-perf-${event.siteId}-${event.eventId}`
      });
      results.push({ action: rule.action, jobId: job.id });
      continue;
    }

    if (rule.action === 'CREATE_RESEARCH_JOB') {
      const topic = String(event.metadata?.topic || '');
      if (!topic) {
        store.recommendations.unshift({
          id: `rec-${crypto.randomBytes(3).toString('hex')}`,
          siteId: event.siteId,
          text: `Research refresh recommended (${event.type})`,
          triggerEventId: event.eventId,
          createdAt: new Date().toISOString(),
          status: 'OPEN'
        });
        results.push({ action: 'RECORD_RECOMMENDATION' });
        continue;
      }
      const { job } = enqueueJob({
        siteId: event.siteId,
        type: 'RESEARCH',
        payload: { topic },
        triggerReason: rule.label,
        triggerEventId: event.eventId,
        entityKey: `research:${topic}`,
        idempotencyKey: `auto-research-${event.siteId}-${topic}`
      });
      results.push({ action: rule.action, jobId: job.id });
      continue;
    }

    if (rule.action === 'CREATE_UPDATE_JOB') {
      // Only recommend — actual UPDATE job needs article identity from human/UI.
      store.recommendations.unshift({
        id: `rec-${crypto.randomBytes(3).toString('hex')}`,
        siteId: event.siteId,
        text: `Update recommended: ${rule.label} (${event.type})`,
        triggerEventId: event.eventId,
        createdAt: new Date().toISOString(),
        status: 'OPEN'
      });
      results.push({ action: 'RECORD_RECOMMENDATION' });
    }
  }

  if (results.length) saveAutomation(event.siteId, store);
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
