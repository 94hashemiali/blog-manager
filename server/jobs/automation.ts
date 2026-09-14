import crypto from 'crypto';
import { db } from '../db.js';
import type { AutomationRule, DomainEvent, DomainEventType } from './types.js';
import { listDomainEvents } from './events.js';
import type { AutomationPolicy } from '../decision/types.js';
import { upsertRecommendation, recommendationDedupeKey } from '../operations/recommendations.js';
import { runDecisionEngine } from '../decision/engine.js';
import { applyPolicyToDecision } from '../decision/policy.js';

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
  /**
   * Legacy text recommendations — read-only compatibility.
   * New writes stopped; Decision Engine → canonical ops recommendations.
   */
  recommendations: Array<{
    id: string;
    siteId: string;
    text: string;
    triggerEventId?: string;
    createdAt: string;
    status: 'OPEN' | 'DISMISSED';
  }>;
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
    schemaVersion: 3,
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
    schemaVersion: 3,
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
 * Automation = trigger only.
 * Event → Decision Engine (WHAT) → policy (WHETHER).
 * Rules may still enqueue safe sync jobs when policy allows.
 * NEVER invents prioritization or publishes.
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
        explanation: `Max ${maxPerHour} automated actions/hour exceeded. Event ${event.type} deferred.`,
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
      results.push({ action: 'AUTOMATION_RATE_LIMITED' });
      dirty = true;
      break;
    }

    // Rules never invent jobs/recommendations — Decision Engine owns WHAT.
    markProcessed(store, event, rule, 'DEFER_TO_DECISION_ENGINE');
    results.push({ action: 'DEFER_TO_DECISION_ENGINE' });
    dirty = true;
  }

  if (dirty) saveAutomation(event.siteId, store);

  const decisionKey = processedKey(event.eventId, '__decision_engine__');
  if (!store.processedKeys.includes(decisionKey)) {
    try {
      if (countActionsLastHour(store.actionLog) >= maxPerHour) {
        upsertRecommendation({
          siteId: event.siteId,
          type: 'RETRY_OPERATION',
          priority: 'MEDIUM',
          title: 'Automation rate limited',
          explanation: `Max ${maxPerHour} automated actions/hour exceeded before Decision Engine apply.`,
          entityId: event.eventId,
          triggerEventId: event.eventId,
          suggestedAction: 'VIEW',
          dedupeKey: recommendationDedupeKey({
            siteId: event.siteId,
            type: 'RETRY_OPERATION',
            entityId: `rate-limit-decision-${new Date().toISOString().slice(0, 13)}`,
            reasonCategory: 'AUTOMATION_RATE_LIMITED'
          }),
          metadata: { automationRateLimited: true, eventType: event.type, via: 'decision_engine' }
        });
        results.push({ action: 'AUTOMATION_RATE_LIMITED' });
      } else {
        const engine = runDecisionEngine(event.siteId, { persist: true, topN: 3 });
        if (engine.nextBest) {
          const applied = applyPolicyToDecision(event.siteId, engine.nextBest, policy);
          results.push({
            action: `DECISION_${applied.outcome}`,
            jobId: applied.jobId
          });
          if (applied.outcome === 'executed' || applied.outcome === 'recommended') {
            store.actionLog.unshift({
              at: new Date().toISOString(),
              ruleId: '__decision_engine__',
              eventId: event.eventId,
              action: `DECISION_${applied.outcome}`,
              jobId: applied.jobId
            });
            store.actionLog = store.actionLog.slice(0, ACTION_LOG_CAP);
          }
        }
      }
      store.processedKeys.unshift(decisionKey);
      store.processedKeys = store.processedKeys.slice(0, PROCESSED_CAP);
      saveAutomation(event.siteId, store);
    } catch {
      /* decision layer optional */
    }
  }

  return results;
}

/** @deprecated Legacy text recs — prefer canonical ops recommendations. */
export function listAutomationRecommendations(siteId: string) {
  return loadAutomation(siteId).recommendations.filter((r) => r.status === 'OPEN');
}

export function processRecentEventsForAutomation(siteId: string, limit = 10): void {
  for (const event of listDomainEvents(siteId, limit)) {
    applyAutomationForEvent(event);
  }
}

export type { DomainEventType };
