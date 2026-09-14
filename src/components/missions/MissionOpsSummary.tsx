import { useMission } from '../../hooks/useMission';
import type { MissionListItem } from '../../api/missions';

interface Props {
  siteId: string;
  onOpenMissions: () => void;
  onOpenMission?: (id: string) => void;
}

function bucket(missions: MissionListItem[]) {
  return {
    active: missions.filter((m) =>
      ['RUNNING', 'READY', 'WAITING_FOR_REVIEW'].includes(m.status)
    ),
    review: missions.filter((m) => m.status === 'WAITING_FOR_REVIEW'),
    blocked: missions.filter((m) => m.blockedTasks > 0 && m.status !== 'COMPLETED'),
    recent: missions.filter((m) => m.status === 'COMPLETED').slice(0, 3)
  };
}

export default function MissionOpsSummary({ siteId, onOpenMissions, onOpenMission }: Props) {
  const { missions, loading, error } = useMission(siteId, true);
  const { active, review, blocked, recent } = bucket(missions);
  const highlight = active[0] || review[0];

  return (
    <section className="rounded-xl border border-emerald-200/80 bg-gradient-to-l from-emerald-50/80 to-white p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Missions</p>
          <h3 className="text-sm font-black text-stone-900">پل Decision → Task → Job</h3>
        </div>
        <button
          type="button"
          onClick={onOpenMissions}
          className="rounded-lg border border-emerald-300 bg-emerald-700 px-3 py-1.5 text-[11px] font-black text-white"
        >
          باز کردن مرکز مأموریت
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-700">{error}</p>
      )}
      {loading && !missions.length && (
        <p className="mt-2 text-xs text-stone-400">در حال بارگذاری…</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['فعال', String(active.length)],
          ['در انتظار بازبینی', String(review.length)],
          ['دارای blocked', String(blocked.length)],
          ['تکمیل اخیر', String(recent.length)]
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-stone-200/80 bg-white px-3 py-2">
            <div className="text-[10px] font-bold text-stone-500">{k}</div>
            <div className="text-sm font-black text-stone-900">{v}</div>
          </div>
        ))}
      </div>

      {highlight ? (
        <button
          type="button"
          onClick={() => (onOpenMission ? onOpenMission(highlight.id) : onOpenMissions())}
          className="mt-3 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-right text-xs hover:border-emerald-300"
        >
          <span className="font-black text-stone-900">{highlight.title}</span>
          <span className="mx-2 text-stone-400">·</span>
          <span className="uppercase text-stone-600">{highlight.status}</span>
          <p className="mt-1 text-[11px] text-stone-500">
            {highlight.nextTaskTitle
              ? `Next: ${highlight.nextTaskTitle}`
              : highlight.nextReason || 'بدون next task'}
          </p>
        </button>
      ) : (
        <p className="mt-3 text-xs text-stone-500">
          مأموریت فعالی نیست. از مرکز مأموریت یک هدف بساز تا Decision Engine برنامه بسازد.
        </p>
      )}
    </section>
  );
}
