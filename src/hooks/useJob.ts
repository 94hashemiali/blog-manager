import { useEffect, useRef, useState } from 'react';
import { getJob, type OpsJob, type OpsJobStatus } from '../api/jobs';

const TERMINAL: OpsJobStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED', 'RECOVERY_REQUIRED'];

function isTerminal(status?: string): boolean {
  return !!status && TERMINAL.includes(status as OpsJobStatus);
}

/**
 * Poll a single ops job while active; stop on terminal; backoff; cleanup on unmount.
 */
export function useJob(jobId: string | null | undefined, siteId?: string, enabled = true) {
  const [job, setJob] = useState<OpsJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const delayRef = useRef(1500);

  useEffect(() => {
    if (!enabled || !jobId) {
      setJob(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    delayRef.current = 1500;

    const tick = async () => {
      try {
        const data = await getJob(jobId, siteId);
        if (cancelled) return;
        const next = data.job as OpsJob;
        setJob(next);
        setError(null);

        if (isTerminal(next.status)) {
          return;
        }

        // Mild backoff while still active
        delayRef.current = Math.min(8000, Math.round(delayRef.current * 1.25));
        timer = setTimeout(tick, delayRef.current);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'job poll failed');
        delayRef.current = Math.min(10000, delayRef.current * 1.5);
        timer = setTimeout(tick, delayRef.current);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, siteId, enabled]);

  return {
    job,
    error,
    isTerminal: isTerminal(job?.status),
    isActive: !!job && !isTerminal(job.status)
  };
}
