import type { MissionTask } from '../../api/missions';

interface Props {
  task: MissionTask | null;
  onClose?: () => void;
  onOpenJob?: (jobId: string) => void;
  onOpenDecision?: (decisionId: string) => void;
}

export default function MissionTaskDetail({ task, onClose, onOpenJob, onOpenDecision }: Props) {
  if (!task) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
        یک تسک از گراف انتخاب کن.
      </div>
    );
  }

  const rows: Array<[string, string | undefined]> = [
    ['نوع', task.type],
    ['وضعیت', task.status],
    ['اولویت', task.priority],
    ['اطمینان', task.confidence],
    ['اثر مورد انتظار', task.expectedImpact],
    ['effort', task.effort != null ? String(task.effort) : undefined],
    ['article', task.articleId != null ? String(task.articleId) : undefined],
    ['entity', task.entityId],
    ['decision', task.decisionId],
    ['recommendation', task.recommendationId],
    ['job', task.jobId],
    ['logicalKey', task.logicalKey],
    ['created', task.createdAt],
    ['updated', task.updatedAt]
  ];

  return (
    <aside className="rounded-xl border border-stone-200 bg-white p-4" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">جزئیات تسک</p>
          <h3 className="mt-1 text-sm font-black text-stone-900">{task.title}</h3>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-[11px] text-stone-500">
            بستن
          </button>
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-[11px]">
        {rows.map(([k, v]) =>
          v ? (
            <div key={k} className="flex justify-between gap-3 border-b border-stone-50 py-1">
              <dt className="text-stone-500">{k}</dt>
              <dd className="max-w-[60%] break-all text-left font-mono text-stone-800">{v}</dd>
            </div>
          ) : null
        )}
      </dl>

      {task.dependsOn.length > 0 && (
        <p className="mt-3 text-[11px] text-stone-600">dependsOn: {task.dependsOn.join(', ')}</p>
      )}
      {task.prerequisites.length > 0 && (
        <p className="mt-1 text-[11px] text-stone-600">
          prerequisites: {task.prerequisites.join(' · ')}
        </p>
      )}
      {task.blockers.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] text-rose-900">
          {task.blockers.map((b) => (
            <li key={b.code}>
              <strong>{b.code}</strong> — {b.message}
            </li>
          ))}
        </ul>
      )}
      {task.result?.message && (
        <p className="mt-2 rounded-lg bg-stone-50 px-2 py-2 text-[11px] text-stone-700">
          نتیجه: {task.result.message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {task.decisionId && onOpenDecision && (
          <button
            type="button"
            onClick={() => onOpenDecision(task.decisionId!)}
            className="rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-bold"
          >
            باز کردن Decision
          </button>
        )}
        {task.jobId && onOpenJob && (
          <button
            type="button"
            onClick={() => onOpenJob(task.jobId!)}
            className="rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-bold"
          >
            باز کردن Job
          </button>
        )}
        {task.recommendationId && (
          <span className="rounded-lg bg-stone-100 px-2 py-1 text-[10px] text-stone-600">
            rec {task.recommendationId.slice(0, 14)}…
          </span>
        )}
      </div>
      <p className="mt-3 text-[10px] text-stone-400">
        انتشار خودکار انجام نمی‌شود — Publish خارج از Mission می‌ماند.
      </p>
    </aside>
  );
}
