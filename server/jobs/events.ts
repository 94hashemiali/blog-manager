import crypto from 'crypto';
import { db } from '../db.js';
import type { DomainEvent, DomainEventType } from './types.js';

interface EventStore {
  schemaVersion: number;
  events: DomainEvent[];
}

function empty(siteId: string): EventStore {
  return { schemaVersion: 1, events: [] };
}

export function listDomainEvents(siteId: string, limit = 50): DomainEvent[] {
  const raw = db.getOpsEventStore(siteId);
  const events = Array.isArray(raw?.events) ? raw.events : [];
  return events
    .filter((row: DomainEvent) => !row.siteId || row.siteId === siteId)
    .slice(0, limit);
}

export function emitDomainEvent(params: {
  type: DomainEventType;
  siteId: string;
  entityId?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
}): DomainEvent {
  const event: DomainEvent = {
    eventId: `evt-${crypto.randomBytes(6).toString('hex')}`,
    type: params.type,
    siteId: params.siteId,
    entityId: params.entityId,
    jobId: params.jobId,
    timestamp: new Date().toISOString(),
    metadata: params.metadata
  };
  const raw = db.getOpsEventStore(params.siteId);
  const store: EventStore = {
    schemaVersion: 1,
    events: [event, ...(Array.isArray(raw?.events) ? raw.events : [])].slice(0, 200)
  };
  db.saveOpsEventStore(params.siteId, store);
  // Lazy import avoids circular deps (automation → enqueue → runner → events).
  void import('./automation.js')
    .then((mod) => {
      try {
        mod.applyAutomationForEvent(event);
      } catch (err) {
        console.warn('automation apply failed', err);
      }
    })
    .catch(() => undefined);
  return event;
}
