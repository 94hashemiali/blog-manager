import { useCallback, useEffect, useState } from 'react';
import {
  getNextBestActions,
  getDecision,
  executeDecision,
  reevaluateDecision
} from '../api/decision';

export function useDecision(siteId?: string, enabled = true) {
  const [nextBest, setNextBest] = useState<any>(null);
  const [topActions, setTopActions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const refresh = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await getNextBestActions(siteId);
      setNextBest(data.nextBest || null);
      setTopActions(data.actions || data.topActions || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const reevaluate = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const data = await reevaluateDecision(siteId);
      setNextBest(data.nextBest || null);
      setTopActions(data.topActions || []);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const openDetail = useCallback(
    async (decisionId: string) => {
      if (!siteId) return null;
      const data = await getDecision(siteId, decisionId);
      setDetail(data.decision || data);
      return data;
    },
    [siteId]
  );

  const execute = useCallback(
    async (decisionId: string) => {
      if (!siteId) return null;
      const data = await executeDecision(siteId, decisionId);
      await refresh();
      return data;
    },
    [siteId, refresh]
  );

  useEffect(() => {
    if (!enabled || !siteId) return;
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (cancelled) return;
      await refresh();
    };
    tick();
    const id = setInterval(tick, 20000);
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

  return {
    nextBest,
    topActions,
    error,
    loading,
    detail,
    setDetail,
    refresh,
    reevaluate,
    openDetail,
    execute
  };
}
