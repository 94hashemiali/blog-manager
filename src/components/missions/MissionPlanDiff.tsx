interface Diff {
  planVersionFrom: number;
  planVersionTo: number;
  addedTasks: string[];
  removedTasks: string[];
  changedTasks: string[];
  unchangedTasks: string[];
  reason: string;
  at: string;
}

export default function MissionPlanDiff({ diff }: { diff: Diff | null }) {
  if (!diff) {
    return <p className="text-sm text-stone-400">No plan diff yet.</p>;
  }
  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
        Plan diff v{diff.planVersionFrom} → v{diff.planVersionTo}
      </p>
      <p className="text-stone-700">
        <span className="font-bold">Reason:</span> {diff.reason}
      </p>
      {diff.addedTasks.length > 0 && (
        <div>
          <p className="font-black text-emerald-800">Added</p>
          <ul className="list-disc pr-4 text-stone-700">
            {diff.addedTasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {diff.removedTasks.length > 0 && (
        <div>
          <p className="font-black text-rose-800">Removed</p>
          <ul className="list-disc pr-4 text-stone-700">
            {diff.removedTasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {diff.changedTasks.length > 0 && (
        <div>
          <p className="font-black text-amber-800">Changed</p>
          <ul className="list-disc pr-4 text-stone-700">
            {diff.changedTasks.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
