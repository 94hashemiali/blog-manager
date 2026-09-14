import type { MissionEdge, MissionTask } from '../../api/missions';

interface Props {
  tasks: MissionTask[];
  order?: string[];
  edges?: MissionEdge[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
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

export default function MissionTaskGraph({
  tasks,
  order,
  edges = [],
  selectedId,
  onSelect
}: Props) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sequence = (order?.length ? order.map((id) => byId.get(id)).filter(Boolean) : tasks) as MissionTask[];
  const edgeReason = (from: string, to: string) =>
    edges.find((e) => e.from === from && e.to === to)?.reason;

  if (!sequence.length) {
    return <p className="text-sm text-stone-400">تسکی در plan نیست.</p>;
  }

  return (
    <ol className="space-y-0">
      {sequence.map((task, i) => {
        const prev = sequence[i - 1];
        const depNote =
          prev && task.dependsOn.includes(prev.id)
            ? edgeReason(prev.id, task.id) || 'dependency'
            : task.dependsOn.length
              ? `${task.dependsOn.length} deps`
              : null;
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onSelect?.(task.id)}
              className={`w-full rounded-xl border px-3 py-3 text-right text-xs transition ${
                STATUS_COLOR[task.status] || STATUS_COLOR.PENDING
              } ${selectedId === task.id ? 'ring-2 ring-emerald-400' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-black uppercase">
                  {task.type}
                </span>
                <span className="font-black">{task.title}</span>
                <span className="text-[10px] font-bold uppercase opacity-70">{task.status}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] opacity-80">
                <span>priority {task.priority}</span>
                {task.confidence && <span>confidence {task.confidence}</span>}
                {task.expectedImpact && <span>impact {task.expectedImpact}</span>}
                {depNote && <span>↳ {depNote}</span>}
              </div>
              {(task.blockers || []).length > 0 && (
                <p className="mt-1 text-[10px]">
                  Blocker: {task.blockers[0].code} — {task.blockers[0].message}
                </p>
              )}
            </button>
            {i < sequence.length - 1 && (
              <div className="flex justify-center py-1 text-stone-400" aria-hidden>
                ↓
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
