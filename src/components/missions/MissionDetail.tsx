import MissionTaskGraph from './MissionTaskGraph';
import MissionProgress from './MissionProgress';
import MissionPlanDiff from './MissionPlanDiff';

interface Props {
  mission: {
    id: string;
    title: string;
    description?: string;
    goal: string;
    status: string;
    planVersion: number;
  };
  plan?: {
    tasks: any[];
    edges: any[];
    version: number;
    assumptions?: string[];
  } | null;
  order?: string[];
  evaluation?: any;
  diff?: any;
  nextTask?: any;
  nextReason?: string;
  busy?: boolean;
  onPlan?: () => void;
  onStart?: () => void;
  onPause?: () => void;
  onCancel?: () => void;
  onReplan?: () => void;
  onAdvance?: () => void;
  onApprove?: (taskId: string) => void;
}

export default function MissionDetail({
  mission,
  plan,
  order,
  evaluation,
  diff,
  nextTask,
  nextReason,
  busy,
  onPlan,
  onStart,
  onPause,
  onCancel,
  onReplan,
  onAdvance,
  onApprove
}: Props) {
  return (
    <div className="space-y-4" dir="rtl">
      <header className="rounded-xl border border-stone-200 bg-gradient-to-l from-emerald-50 to-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Mission</p>
        <h2 className="mt-1 text-lg font-black text-stone-900">{mission.title}</h2>
        <p className="mt-1 text-sm text-stone-600">{mission.description || mission.goal}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['Plan', onPlan],
            ['Start', onStart],
            ['Advance', onAdvance],
            ['Replan', onReplan],
            ['Pause', onPause],
            ['Cancel', onCancel]
          ].map(([label, fn]) =>
            fn ? (
              <button
                key={String(label)}
                type="button"
                disabled={busy}
                onClick={() => (fn as () => void)()}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-black text-stone-700 disabled:opacity-50"
              >
                {label as string}
              </button>
            ) : null
          )}
        </div>
      </header>

      {evaluation && (
        <MissionProgress
          progress={evaluation.progress}
          completedTasks={evaluation.completedTasks}
          runningTasks={evaluation.runningTasks}
          pendingTasks={evaluation.pendingTasks}
          blockedTasks={evaluation.blockedTasks}
          reviewTasks={evaluation.reviewTasks}
          failedTasks={evaluation.failedTasks}
          planVersion={evaluation.planVersion}
          status={evaluation.status}
        />
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-stone-500">
          Plan · execution order
        </p>
        <MissionTaskGraph tasks={plan?.tasks || []} order={order} edges={plan?.edges} />
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Next task</p>
        {nextTask ? (
          <div className="mt-2 text-sm">
            <p className="font-black text-stone-900">
              {nextTask.type}: {nextTask.title}
            </p>
            <p className="mt-1 text-xs text-stone-600">{nextReason || nextTask.status}</p>
            {nextTask.status === 'WAITING_FOR_REVIEW' && onApprove && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onApprove(nextTask.id)}
                className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
              >
                Approve review
              </button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">{nextReason || 'No actionable task'}</p>
        )}
      </section>

      <MissionPlanDiff diff={diff || null} />
    </div>
  );
}

export function MissionPlanView(props: { plan: any; order?: string[] }) {
  return (
    <MissionTaskGraph tasks={props.plan?.tasks || []} order={props.order} edges={props.plan?.edges} />
  );
}
