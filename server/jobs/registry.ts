import type { OpsJob, OpsJobType } from './types.js';
import type { JobProgress } from './types.js';

export interface JobHandlerContext {
  job: OpsJob;
  updateProgress: (progress: JobProgress, stage?: string) => Promise<OpsJob>;
  heartbeat: () => Promise<OpsJob>;
  assertNotCancelled: () => void;
  assertNotPaused: () => void;
  emitStage: (stage: string, message: string, done?: boolean) => Promise<void>;
}

export type JobHandler = (ctx: JobHandlerContext) => Promise<Record<string, unknown> | void>;

const handlers = new Map<OpsJobType, JobHandler>();

export function registerJobHandler(type: OpsJobType, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function getJobHandler(type: OpsJobType): JobHandler | undefined {
  return handlers.get(type);
}

export function listRegisteredHandlers(): OpsJobType[] {
  return [...handlers.keys()];
}
