import { useCallback, useEffect, useState } from 'react';
import {
  advanceMission,
  approveMissionTask,
  cancelMission,
  createMission,
  getMission,
  getMissionDiff,
  getMissionEvaluation,
  getMissionTasks,
  getNextMissionTask,
  listMissions,
  pauseMission,
  planMission,
  replanMission,
  startMission
} from '../../api/missions';
import MissionCreate from './MissionCreate';
import MissionDetail from './MissionDetail';
import MissionList from './MissionList';

interface Props {
  siteId: string;
}

export default function MissionsPanel({ siteId }: Props) {
  const [missions, setMissions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [tasksPayload, setTasksPayload] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [next, setNext] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    const data = await listMissions(siteId);
    setMissions(data.missions || []);
  }, [siteId]);

  const refreshDetail = useCallback(
    async (missionId: string) => {
      const [m, tasks, evalData, diffData, nextData] = await Promise.all([
        getMission(siteId, missionId),
        getMissionTasks(siteId, missionId).catch(() => ({ tasks: [], edges: [], order: [] })),
        getMissionEvaluation(siteId, missionId).catch(() => null),
        getMissionDiff(siteId, missionId).catch(() => ({ diff: null })),
        getNextMissionTask(siteId, missionId).catch(() => ({}))
      ]);
      setDetail(m);
      setTasksPayload(tasks);
      setEvaluation(evalData?.evaluation || null);
      setDiff(diffData?.diff || null);
      setNext(nextData);
    },
    [siteId]
  );

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setTasksPayload(null);
    setEvaluation(null);
    setDiff(null);
    setNext(null);
    setError(null);
    refreshList().catch((err) => setError(err.message));
  }, [siteId, refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    refreshDetail(selectedId).catch((err) => setError(err.message));
  }, [selectedId, refreshDetail]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refreshList();
      if (selectedId) await refreshDetail(selectedId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Missions</p>
          <h2 className="text-sm font-black text-stone-900">Mission Plan · task graph</h2>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3">
          <MissionCreate
            busy={busy}
            onCreate={async (input) => {
              await run(async () => {
                const data = await createMission(siteId, input);
                setSelectedId(data.mission.id);
              });
            }}
          />
          <MissionList
            missions={missions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={busy}
          />
        </div>
        <div className="lg:col-span-2">
          {detail?.mission ? (
            <MissionDetail
              mission={detail.mission}
              plan={detail.plan || { tasks: tasksPayload?.tasks || [], edges: tasksPayload?.edges || [] }}
              order={tasksPayload?.order}
              evaluation={evaluation}
              diff={diff}
              nextTask={next?.task}
              nextReason={next?.reason}
              busy={busy}
              onPlan={() =>
                run(async () => {
                  await planMission(siteId, detail.mission.id);
                })
              }
              onStart={() =>
                run(async () => {
                  await startMission(siteId, detail.mission.id);
                })
              }
              onPause={() =>
                run(async () => {
                  await pauseMission(siteId, detail.mission.id);
                })
              }
              onCancel={() =>
                run(async () => {
                  await cancelMission(siteId, detail.mission.id);
                })
              }
              onReplan={() =>
                run(async () => {
                  await replanMission(siteId, detail.mission.id, 'UI replan');
                })
              }
              onAdvance={() =>
                run(async () => {
                  await advanceMission(siteId, detail.mission.id);
                })
              }
              onApprove={(taskId) =>
                run(async () => {
                  await approveMissionTask(siteId, detail.mission.id, taskId);
                })
              }
            />
          ) : (
            <p className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
              Select or create a mission.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
