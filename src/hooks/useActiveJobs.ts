import { useEffect, useState } from 'react';
import { listJobs, type OpsJob } from '../api/jobs';

export function useActiveJobs(siteId?: string, enabled = true) {
  const [jobs, setJobs] = useState<OpsJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !siteId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await listJobs({ siteId });
        if (cancelled) return;
        setJobs(data.jobs || []);
        setError(null);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      }
    };
    load();
    const hasActive = () =>
      jobs.some((j) => j.status === 'RUNNING' || j.status === 'QUEUED' || j.status === 'PAUSED');
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [siteId, enabled]);

  const activeCount = jobs.filter((j) => j.status === 'RUNNING' || j.status === 'QUEUED').length;
  return { jobs, activeCount, error, setJobs };
}
