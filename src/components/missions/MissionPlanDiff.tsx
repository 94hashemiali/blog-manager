import type { PlanDiff } from '../../api/missions';

interface Props {
  diff: PlanDiff | null;
}

export default function MissionPlanDiff({ diff }: Props) {
  if (!diff) {
    return (
      <section className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-4 text-sm text-stone-400">
        هنوز plan diff نیست (بعد از re-plan ظاهر می‌شود).
      </section>
    );
  }

  const groups: Array<[string, string[]]> = [
    ['Added', diff.addedTasks],
    ['Removed', diff.removedTasks],
    ['Changed', diff.changedTasks],
    ['Unchanged', diff.unchangedTasks]
  ];

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4" dir="rtl">
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Plan diff</p>
      <p className="mt-1 text-xs text-stone-600">
        v{diff.planVersionFrom} → v{diff.planVersionTo} · {diff.reason}
      </p>
      <p className="text-[10px] text-stone-400">{new Date(diff.at).toLocaleString('fa-IR')}</p>
      <p className="mt-2 text-[11px] text-stone-500">
        کارهای completed/running حفظ می‌شوند؛ فقط pendingهای کهنه عوض می‌شوند.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {groups.map(([label, items]) => (
          <div key={label} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase text-stone-500">
              {label} ({items.length})
            </p>
            {items.length ? (
              <ul className="mt-1 space-y-0.5 text-[11px] text-stone-700">
                {items.slice(0, 8).map((t) => (
                  <li key={t}>• {t}</li>
                ))}
                {items.length > 8 && <li>… +{items.length - 8}</li>}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-stone-400">—</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
