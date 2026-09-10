import { db } from '../db.js';
import type { OpsSchedule } from './types.js';
import { enqueueJob } from './enqueue.js';

interface ScheduleStore {
  schemaVersion: number;
  schedules: OpsSchedule[];
}

function load(): ScheduleStore {
  const raw = db.getScheduleStore();
  return {
    schemaVersion: 1,
    schedules: Array.isArray(raw?.schedules) ? raw.schedules : []
  };
}

function save(store: ScheduleStore): void {
  db.saveScheduleStore({ schemaVersion: 1, schedules: store.schedules.slice(0, 200) });
}

function intervalMs(interval: OpsSchedule['interval']): number {
  return interval === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}

export function listSchedules(siteId?: string): OpsSchedule[] {
  const rows = load().schedules;
  return siteId ? rows.filter((row) => row.siteId === siteId) : rows;
}

export function upsertSchedule(input: Omit<OpsSchedule, 'createdAt' | 'updatedAt'> & { createdAt?: string }): OpsSchedule {
  const store = load();
  const now = new Date().toISOString();
  const existing = store.schedules.findIndex((row) => row.id === input.id);
  const row: OpsSchedule = {
    ...input,
    createdAt: input.createdAt || now,
    updatedAt: now,
    nextRunAt:
      input.enabled && !input.nextRunAt
        ? new Date(Date.now() + intervalMs(input.interval)).toISOString()
        : input.nextRunAt
  };
  if (existing >= 0) store.schedules[existing] = row;
  else store.schedules.push(row);
  save(store);
  return row;
}

export function disableSchedulesForSite(siteId: string): void {
  const store = load();
  store.schedules = store.schedules.map((row) =>
    row.siteId === siteId ? { ...row, enabled: false, updatedAt: new Date().toISOString() } : row
  );
  save(store);
}

/** Timer only enqueues jobs — never runs expensive work inline. */
export function runDueSchedules(now = Date.now()): Array<{ scheduleId: string; jobId: string }> {
  const store = load();
  const created: Array<{ scheduleId: string; jobId: string }> = [];

  for (const schedule of store.schedules) {
    if (!schedule.enabled) continue;
    if (!db.getSiteById(schedule.siteId)) continue;
    const dueAt = schedule.nextRunAt ? new Date(schedule.nextRunAt).getTime() : 0;
    if (!Number.isFinite(dueAt) || dueAt > now) continue;

    let jobId = '';
    if (schedule.type === 'PERFORMANCE_SYNC') {
      jobId = enqueueJob({
        siteId: schedule.siteId,
        type: 'PERFORMANCE_SYNC',
        priority: 'LOW',
        triggerReason: 'schedule:PERFORMANCE_SYNC',
        idempotencyKey: `sched-perf-${schedule.siteId}-${schedule.nextRunAt || 'due'}`
      }).job.id;
    } else if (schedule.type === 'INTELLIGENCE_SYNC') {
      jobId = enqueueJob({
        siteId: schedule.siteId,
        type: 'INTELLIGENCE_SYNC',
        priority: 'LOW',
        payload: { mode: 'incremental' },
        triggerReason: 'schedule:INTELLIGENCE_SYNC',
        idempotencyKey: `sched-intel-${schedule.siteId}-${schedule.nextRunAt || 'due'}`
      }).job.id;
    } else if (schedule.type === 'RESEARCH_REFRESH') {
      // Creates recommendation-style research jobs only when payload.topic present — skip bare refresh.
      // Schedules without topic are no-ops by design (no silent mass refresh).
      continue;
    }

    if (!jobId) continue;
    schedule.lastRunAt = new Date(now).toISOString();
    schedule.nextRunAt = new Date(now + intervalMs(schedule.interval)).toISOString();
    schedule.updatedAt = schedule.lastRunAt;
    created.push({ scheduleId: schedule.id, jobId });
  }

  save(store);
  return created;
}

let scheduleTimer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (scheduleTimer) return;
  scheduleTimer = setInterval(() => {
    try {
      runDueSchedules();
    } catch (err) {
      console.warn('scheduler tick failed', err);
    }
  }, 30_000);
  scheduleTimer.unref?.();
}

export function stopScheduler(): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = null;
}
