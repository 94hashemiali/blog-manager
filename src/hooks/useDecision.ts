import { useCallback, useEffect, useState } from 'react';
import { getDecisions } from '../api/decisions';

export function useDecision(siteId?: string, enabled = true) {
  const [nextBest, setNextBest] = useState<any>(null);
  const [topActions, setTopActions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await getDecisions(siteId);
      setNextBest(data.nextBest || null);
      setTopActions(data.topActions || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (!enabled || !siteId) return;
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (cancelled) return;
      await refresh();
    };
    tick();
    const id = setInterval(tick, 15000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [siteId, enabled, refresh]);

  return { nextBest, topActions, error, loading, refresh };
}
