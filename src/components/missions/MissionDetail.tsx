import type {
  Mission,
  MissionEvaluation,
  MissionOutcomeReport,
  MissionPlan,
  MissionTask,
  NextTaskReason,
  PlanDiff
} from '../../api/missions';
import MissionTaskGraph from './MissionTaskGraph';
import MissionProgress from './MissionProgress';
import MissionPlanDiff from './MissionPlanDiff';
import MissionTaskDetail from './MissionTaskDetail';
import MissionOutcome from './MissionOutcome';

interface Props {
  mission: Mission;
  plan?: MissionPlan | null;
  order?: string[];
  evaluation?: MissionEvaluation | null;
  report?: MissionOutcomeReport | null;
  diff?: PlanDiff | null;
  nextTask?: MissionTask | null;
  nextReason?: NextTaskReason;
  nextDetail?: string;
  selectedTaskId?: string | null;
  onSelectTask?: (id: string | null) => void;
  busy?: boolean;
  onPlan?: () => void;
  onStart?: () => void;
  onResume?: () => void;
  onPause?: () => void;
  onCancel?: () => void;
  onReplan?: () => void;
  onAdvance?: () => void;
  onExecute?: (taskId: string) => void;
  onApprove?: (taskId: string) => void;
  onOpenJob?: (jobId: string) => void;
  onOpenDecision?: (decisionId: string) => void;
}

function primaryActions(status: Mission['status'], props: Props) {
  const out: Array<{ label: string; fn?: () => void; tone?: string }> = [];
  if (status === 'DRAFT' || status === 'PLANNING') {
    out.push({ label: 'تولید Plan', fn: props.onPlan, tone: 'emerald' });
  }
  if (status === 'READY' || status === 'DRAFT') {
    out.push({ label: 'Start', fn: props.onStart, tone: 'emerald' });
  }
  if (status === 'RUNNING' || status === 'WAITING_FOR_REVIEW') {
    out.push({ label: 'اجرای بعدی', fn: props.onAdvance, tone: 'emerald' });
    out.push({ label: 'Pause', fn: props.onPause });
  }
  if (status === 'PAUSED') {
    out.push({ label: 'Resume', fn: props.onResume, tone: 'emerald' });
  }
  if (!['CANCELLED', 'COMPLETED'].includes(status)) {
    out.push({ label: 'Re-plan', fn: props.onReplan });
    out.push({ label: 'Cancel', fn: props.onCancel, tone: 'rose' });
  }
  return out.filter((a) => a.fn);
}

export default function MissionDetail({
  mission,
  plan,
  order,
  evaluation,
  report,
  diff,
  nextTask,
  nextReason,
  nextDetail,
  selectedTaskId,
  onSelectTask,
  busy,
  onPlan,
  onStart,
  onResume,
  onPause,
  onCancel,
  onReplan,
  onAdvance,
  onExecute,
  onApprove,
  onOpenJob,
  onOpenDecision
}: Props) {
  const actions = primaryActions(mission.status, {
    mission,
    onPlan,
    onStart,
    onResume,
    onPause,
    onCancel,
    onReplan,
    onAdvance
  });
  const selected =
    (selectedTaskId && plan?.tasks.find((t) => t.id === selectedTaskId)) ||
    nextTask ||
    null;

  const waitingReview =
    nextTask?.status === 'WAITING_FOR_REVIEW' || nextReason === 'WAITING_FOR_REVIEW';

  return (
    <div className="space-y-4" dir="rtl">
      <header className="rounded-xl border border-stone-200 bg-gradient-to-l from-emerald-50 to-white p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Mission</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black text-stone-900">{mission.title}</h2>
          <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase text-stone-700">
            {mission.status}
          </span>
          <span className="text-[10px] text-stone-500">plan v{mission.planVersion}</span>
        </div>
        <p className="mt-1 text-sm text-stone-600">{mission.description || mission.goal}</p>
        <p className="mt-1 text-[10px] text-stone-400">
          هدف: {mission.goal}
          {mission.targetDate ? ` · هدف زمانی: ${mission.targetDate}` : ''}
          {' · '}به‌روز: {new Date(mission.updatedAt).toLocaleString('fa-IR')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={busy}
              onClick={() => a.fn?.()}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-black disabled:opacity-50 ${
                a.tone === 'emerald'
                  ? 'border-emerald-300 bg-emerald-700 text-white'
                  : a.tone === 'rose'
                    ? 'border-rose-200 bg-rose-50 text-rose-800'
                    : 'border-stone-200 bg-white text-stone-700'
              }`}
            >
              {a.label}
            </button>
          ))}
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

      <section
        className={`rounded-xl border p-4 ${
          waitingReview
            ? 'border-amber-300 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50/40'
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-600">
          {waitingReview ? 'WAITING FOR REVIEW' : 'NEXT ACTION'}
        </p>
        {nextTask ? (
          <div className="mt-2 space-y-2 text-sm">
            <p className="font-black text-stone-900">
              {nextTask.type}: {nextTask.title}
            </p>
            <div className="flex flex-wrap gap-2 text-[11px] text-stone-600">
              <span>priority {nextTask.priority}</span>
              {nextTask.confidence && <span>confidence {nextTask.confidence}</span>}
              {nextTask.expectedImpact && <span>impact {nextTask.expectedImpact}</span>}
              {nextTask.effort != null && <span>effort {nextTask.effort}</span>}
            </div>
            <p className="text-xs text-stone-600">
              دلیل: {nextReason || nextTask.status}
              {nextDetail ? ` — ${nextDetail}` : ''}
            </p>
            {nextTask.dependsOn.length > 0 && (
              <p className="text-[11px] text-stone-500">
                وابستگی‌ها: {nextTask.dependsOn.length} مورد باید کامل شوند
              </p>
            )}
            {(nextTask.blockers || []).length > 0 && (
              <p className="text-[11px] text-rose-800">
                Blocker: {nextTask.blockers[0].code} — {nextTask.blockers[0].message}
              </p>
            )}
            {waitingReview ? (
              <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-[11px] text-amber-950">
                <p className="font-bold">چرا review؟</p>
                <p className="mt-1">
                  تسک‌های منبع/محتوا/ایجاد مقاله نیاز به تأیید انسان دارند. Approve فقط ack می‌کند —
                  Publish خودکار انجام نمی‌شود.
                </p>
                {onApprove && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApprove(nextTask.id)}
                    className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
              </div>
            ) : (
              onExecute && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onExecute(nextTask.id)}
                  className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
                >
                  Execute via Recommendation → Job
                </button>
              )
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-600">
            {nextReason || 'NO_ACTIONABLE_TASK'}
            {nextDetail ? ` — ${nextDetail}` : ''}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border border-stone-200 bg-white p-4 lg:col-span-3">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-stone-500">
            Task graph · ترتیب اجرا
          </p>
          {!plan?.tasks?.length ? (
            <p className="text-sm text-stone-400">هنوز plan نداره — Plan بزن.</p>
          ) : (
            <MissionTaskGraph
              tasks={plan.tasks}
              order={order}
              edges={plan.edges}
              selectedId={selectedTaskId || nextTask?.id}
              onSelect={onSelectTask}
            />
          )}
        </section>
        <div className="lg:col-span-2">
          <MissionTaskDetail
            task={selected}
            onOpenJob={onOpenJob}
            onOpenDecision={onOpenDecision}
          />
        </div>
      </div>

      <MissionOutcome report={report || null} />

      <MissionPlanDiff diff={diff || null} />
    </div>
  );
}
