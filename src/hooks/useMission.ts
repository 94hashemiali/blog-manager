import { useCallback, useEffect, useState } from 'react';
import {
  advanceMission,
  approveMissionTask,
  cancelMission,
  createMission,
  executeMissionTask,
  getMission,
  getMissionDiff,
  getMissionEvaluation,
  getMissionTasks,
  getNextMissionTask,
  listMissions,
  pauseMission,
  planMission,
  replanMission,
  resumeMission,
  startMission,
  type Mission,
  type MissionEvaluation,
  type MissionGoal,
  type MissionListItem,
  type MissionPlan,
  type MissionTask,
  type NextTaskResult,
  type PlanDiff
} from '../api/missions';

export function useMission(siteId?: string, enabled = true) {
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [plan, setPlan] = useState<MissionPlan | null>(null);
  const [tasks, setTasks] = useState<MissionTask[]>([]);
  const [edges, setEdges] = useState<MissionPlan['edges']>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<MissionEvaluation | null>(null);
  const [outcome, setOutcome] = useState<Awaited<
    ReturnType<typeof getMissionEvaluation>
  >['outcome'] | null>(null);
  const [diff, setDiff] = useState<PlanDiff | null>(null);
  const [next, setNext] = useState<NextTaskResult>({ task: null });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    if (!siteId) return;
    const data = await listMissions(siteId);
    setMissions(data.missions || []);
  }, [siteId]);

  const refreshDetail = useCallback(
    async (missionId: string) => {
      if (!siteId) return;
      const [m, tasksData, evalData, diffData, nextData] = await Promise.all([
        getMission(siteId, missionId),
        getMissionTasks(siteId, missionId).catch(() => ({
          tasks: [] as MissionTask[],
          edges: [] as MissionPlan['edges'],
          order: [] as string[]
        })),
        getMissionEvaluation(siteId, missionId).catch(() => null),
        getMissionDiff(siteId, missionId).catch(() => ({ diff: null })),
        getNextMissionTask(siteId, missionId).catch(
          (): NextTaskResult => ({ task: null })
        )
      ]);
      setMission(m.mission);
      setPlan(m.plan);
      setTasks(tasksData.tasks || m.plan?.tasks || []);
      setEdges(tasksData.edges || m.plan?.edges || []);
      setOrder(tasksData.order || []);
      setEvaluation(evalData?.evaluation || null);
      setOutcome(evalData?.outcome || null);
      setDiff(diffData?.diff || null);
      setNext({ task: nextData.task ?? null, reason: nextData.reason, detail: nextData.detail });
    },
    [siteId]
  );

  const refresh = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      await refreshList();
      if (selectedId) await refreshDetail(selectedId);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [siteId, selectedId, refreshList, refreshDetail]);

  useEffect(() => {
    setSelectedId(null);
    setMission(null);
    setPlan(null);
    setTasks([]);
    setEvaluation(null);
    setDiff(null);
    setNext({ task: null });
    setError(null);
  }, [siteId]);

  useEffect(() => {
    if (!enabled || !siteId) return;
    let cancelled = false;
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (cancelled) return;
      try {
        await refreshList();
        if (selectedId) await refreshDetail(selectedId);
        if (!cancelled) setError(null);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, siteId, selectedId, refreshList, refreshDetail]);

  const run = useCallback(
    async (fn: () => Promise<string | void>) => {
      setBusy(true);
      setError(null);
      try {
        const focusId = await fn();
        await refreshList();
        const id = focusId || selectedId;
        if (id) await refreshDetail(id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refreshList, refreshDetail, selectedId]
  );

  const select = useCallback(
    async (id: string | null) => {
      setSelectedId(id);
      if (!id || !siteId) {
        setMission(null);
        return;
      }
      setLoading(true);
      try {
        await refreshDetail(id);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [siteId, refreshDetail]
  );

  const create = useCallback(
    async (input: {
      title: string;
      description?: string;
      goal?: MissionGoal;
      targetDate?: string;
      autoPlan?: boolean;
    }) => {
      if (!siteId) return null;
      let created: Mission | null = null;
      await run(async () => {
        const data = await createMission(siteId, input);
        created = data.mission;
        if (input.autoPlan !== false) {
          await planMission(siteId, data.mission.id);
        }
        setSelectedId(data.mission.id);
        return data.mission.id;
      });
      return created;
    },
    [siteId, run]
  );

  return {
    missions,
    selectedId,
    mission,
    plan,
    tasks,
    edges,
    order,
    evaluation,
    outcome,
    diff,
    next,
    error,
    loading,
    busy,
    select,
    refresh,
    create,
    planNow: (id: string) => run(async () => { await planMission(siteId!, id); }),
    start: (id: string) => run(async () => { await startMission(siteId!, id); }),
    pause: (id: string) => run(async () => { await pauseMission(siteId!, id); }),
    resume: (id: string) => run(async () => { await resumeMission(siteId!, id); }),
    cancel: (id: string) => run(async () => { await cancelMission(siteId!, id); }),
    replan: (id: string, reason?: string) =>
      run(async () => {
        await replanMission(siteId!, id, reason);
      }),
    advance: (id: string) => run(async () => { await advanceMission(siteId!, id); }),
    executeTask: (missionId: string, taskId: string) =>
      run(async () => {
        await executeMissionTask(siteId!, missionId, taskId);
      }),
    approve: (missionId: string, taskId: string) =>
      run(async () => {
        await approveMissionTask(siteId!, missionId, taskId);
      })
  };
}
