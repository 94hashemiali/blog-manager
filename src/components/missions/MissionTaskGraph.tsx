interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  priority?: string;
  confidence?: string;
  expectedImpact?: string;
  dependsOn?: string[];
  blockers?: Array<{ code: string; message: string }>;
  decisionId?: string;
  recommendationId?: string;
  jobId?: string;
}

interface Props {
  tasks: Task[];
  order?: string[];
  edges?: Array<{ from: string; to: string; reason: string }>;
}

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  RUNNING: 'border-sky-300 bg-sky-50 text-sky-900',
  READY: 'border-stone-300 bg-white text-stone-900',
  PENDING: 'border-stone-200 bg-stone-50 text-stone-700',
  WAITING_FOR_REVIEW: 'border-amber-300 bg-amber-50 text-amber-950',
  BLOCKED: 'border-rose-300 bg-rose-50 text-rose-900',
  FAILED: 'border-rose-400 bg-rose-100 text-rose-950',
  STALE: 'border-orange-300 bg-orange-50 text-orange-950',
  CANCELLED: 'border-stone-200 bg-stone-100 text-stone-500',
  SKIPPED: 'border-stone-200 bg-stone-50 text-stone-500'
};

export default function MissionTaskGraph({ tasks, order }: Props) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sequence = (order?.length ? order.map((id) => byId.get(id)).filter(Boolean) : tasks) as Task[];

  if (!sequence.length) {
    return <p className="text-sm text-stone-400">No tasks in plan.</p>;
  }

  return (
    <ol className="space-y-0">
      {sequence.map((task, i) => (
        <li key={task.id}>
          <div
            className={`rounded-xl border px-3 py-3 text-xs ${STATUS_COLOR[task.status] || STATUS_COLOR.PENDING}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-black uppercase">
                {task.type}
              </span>
              <span className="font-black">{task.title}</span>
              <span className="text-[10px] font-bold uppercase opacity-70">{task.status}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] opacity-80">
              {task.priority && <span>priority {task.priority}</span>}
              {task.confidence && <span>confidence {task.confidence}</span>}
              {task.expectedImpact && <span>impact {task.expectedImpact}</span>}
            </div>
            {(task.blockers || []).length > 0 && (
              <p className="mt-1 text-[10px]">
                Blocker: {task.blockers![0].code} — {task.blockers![0].message}
              </p>
            )}
            <p className="mt-1 font-mono text-[10px] opacity-60">
              {[
                task.decisionId ? `dec ${task.decisionId.slice(0, 12)}` : null,
                task.recommendationId ? `rec ${task.recommendationId.slice(0, 12)}` : null,
                task.jobId ? `job ${task.jobId.slice(0, 12)}` : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {i < sequence.length - 1 && (
            <div className="flex justify-center py-1 text-stone-400" aria-hidden>
              ↓
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
