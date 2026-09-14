import type { MissionListItem, MissionStatus } from '../../api/missions';

const STATUS_STYLE: Record<MissionStatus, string> = {
  DRAFT: 'bg-stone-100 text-stone-700 border-stone-200',
  PLANNING: 'bg-sky-50 text-sky-800 border-sky-200',
  READY: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  RUNNING: 'bg-sky-100 text-sky-900 border-sky-300',
  WAITING_FOR_REVIEW: 'bg-amber-100 text-amber-950 border-amber-300',
  PAUSED: 'bg-stone-200 text-stone-800 border-stone-300',
  COMPLETED: 'bg-emerald-100 text-emerald-950 border-emerald-300',
  FAILED: 'bg-rose-100 text-rose-950 border-rose-300',
  CANCELLED: 'bg-stone-100 text-stone-500 border-stone-200'
};

interface Props {
  missions: MissionListItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('fa-IR');
  } catch {
    return iso;
  }
}

export default function MissionList({ missions, selectedId, onSelect, loading }: Props) {
  if (loading && !missions.length) {
    return <p className="text-sm text-stone-400">در حال بارگذاری مأموریت‌ها…</p>;
  }
  if (!missions.length) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-8 text-center">
        <p className="text-sm font-bold text-stone-700">هنوز مأموریتی نیست</p>
        <p className="mt-1 text-xs text-stone-500">
          یک هدف انتخاب کن — سیستم از Decision Engine برنامه می‌سازد.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {missions.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onSelect(m.id)}
            className={`w-full rounded-xl border px-3 py-3 text-right transition ${
              selectedId === m.id
                ? 'border-emerald-300 bg-emerald-50/80 shadow-xs'
                : 'border-stone-200 bg-white hover:border-stone-300'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-black text-stone-900">{m.title}</span>
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase ${STATUS_STYLE[m.status]}`}
              >
                {m.status}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-stone-500">
              <span>{m.goal}</span>
              <span>plan v{m.planVersion}</span>
              <span>{m.progress}% · {m.completedTasks}/{m.taskCount} done</span>
            </div>
            {(m.pendingTasks > 0 || m.blockedTasks > 0 || m.reviewTasks > 0) && (
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-stone-600">
                {m.pendingTasks > 0 && <span>{m.pendingTasks} pending</span>}
                {m.blockedTasks > 0 && <span className="text-rose-700">{m.blockedTasks} blocked</span>}
                {m.reviewTasks > 0 && (
                  <span className="text-amber-800">{m.reviewTasks} review</span>
                )}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-stone-500">
              {m.nextTaskTitle
                ? `بعدی: ${m.nextTaskTitle}`
                : m.nextReason
                  ? `وضعیت: ${m.nextReason}`
                  : 'بدون next task'}
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">{fmtTime(m.updatedAt)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
