interface Props {
  progress: number;
  completedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  reviewTasks: number;
  failedTasks: number;
  planVersion: number;
  status: string;
}

export default function MissionProgress({
  progress,
  completedTasks,
  runningTasks,
  pendingTasks,
  blockedTasks,
  reviewTasks,
  failedTasks,
  planVersion,
  status
}: Props) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Progress</p>
        <span className="text-[10px] font-bold text-stone-500">
          {status} · plan v{planVersion}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-sm font-black text-stone-900">{progress}%</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[10px] sm:grid-cols-6">
        {[
          ['Done', completedTasks],
          ['Running', runningTasks],
          ['Pending', pendingTasks],
          ['Blocked', blockedTasks],
          ['Review', reviewTasks],
          ['Failed', failedTasks]
        ].map(([k, v]) => (
          <div key={String(k)}>
            <dt className="text-stone-500">{k}</dt>
            <dd className="font-black text-stone-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
