import { useEffect, useState } from 'react';
import { useMission } from '../../hooks/useMission';
import MissionCreate from './MissionCreate';
import MissionDetail from './MissionDetail';
import MissionList from './MissionList';

interface Props {
  siteId: string;
  onOpenJob?: (jobId: string) => void;
  onOpenDecision?: (decisionId: string) => void;
  /** Compact embed for OpsOverview */
  compact?: boolean;
  initialMissionId?: string | null;
  onInitialMissionConsumed?: () => void;
}

export default function MissionsPanel({
  siteId,
  onOpenJob,
  onOpenDecision,
  compact,
  initialMissionId,
  onInitialMissionConsumed
}: Props) {
  const m = useMission(siteId, true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialMissionId) return;
    void m.select(initialMissionId).then(() => onInitialMissionConsumed?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when id arrives
  }, [initialMissionId]);

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Missions</p>
          <h2 className="text-sm font-black text-stone-900">
            {compact ? 'مأموریت‌های فعال' : 'مرکز مأموریت · Task Graph'}
          </h2>
        </div>
        <button
          type="button"
          disabled={m.busy}
          onClick={() => m.refresh()}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-[10px] font-bold text-stone-600"
        >
          Refresh
        </button>
      </div>

      {m.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {m.error}
        </div>
      )}

      <div className={`grid gap-4 ${compact ? 'lg:grid-cols-1' : 'lg:grid-cols-3'}`}>
        <div className="space-y-3">
          <MissionCreate
            busy={m.busy}
            onCreate={async (input) => {
              await m.create({ ...input, autoPlan: true });
            }}
          />
          <MissionList
            missions={m.missions}
            selectedId={m.selectedId}
            onSelect={(id) => {
              setSelectedTaskId(null);
              void m.select(id);
            }}
            loading={m.loading}
          />
        </div>
        {!compact && (
          <div className="lg:col-span-2">
            {m.mission ? (
              <MissionDetail
                mission={m.mission}
                plan={
                  m.plan
                    ? { ...m.plan, tasks: m.tasks.length ? m.tasks : m.plan.tasks, edges: m.edges }
                    : m.plan
                }
                order={m.order}
                evaluation={m.evaluation}
                report={m.report}
                diff={m.diff}
                nextTask={m.next.task}
                nextReason={m.next.reason}
                nextDetail={m.next.detail}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                busy={m.busy}
                onPlan={() => m.planNow(m.mission!.id)}
                onStart={() => m.start(m.mission!.id)}
                onResume={() => m.resume(m.mission!.id)}
                onPause={() => m.pause(m.mission!.id)}
                onCancel={() => m.cancel(m.mission!.id)}
                onReplan={() => m.replan(m.mission!.id, 'UI replan')}
                onAdvance={() => m.advance(m.mission!.id)}
                onExecute={(taskId) => m.executeTask(m.mission!.id, taskId)}
                onApprove={(taskId) => m.approve(m.mission!.id, taskId)}
                onOpenJob={onOpenJob}
                onOpenDecision={onOpenDecision}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
                یک مأموریت بساز یا انتخاب کن.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
