import type { ContentActionRecommendation } from '../../utils/performanceClient';

interface Props {
  items: ContentActionRecommendation[];
  busyId: string | null;
  onCreateUpdate: (item: ContentActionRecommendation) => void;
}

const PRIORITY_CLASS: Record<string, string> = {
  HIGH: 'bg-rose-100 text-rose-800',
  MEDIUM: 'bg-amber-100 text-amber-800',
  LOW: 'bg-stone-100 text-stone-600'
};

export default function PerformanceOpportunityList({ items, busyId, onCreateUpdate }: Props) {
  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-stone-900">اولویت‌های بهبود</h2>
        <p className="mt-3 text-sm text-stone-400">فعلاً اولویت بهبودی با شواهد کافی پیدا نشد.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black text-stone-900">اولویت‌های بهبود</h2>
      <p className="mt-1 text-xs text-stone-500">رتبه‌بندی قطعی بر اساس شواهد موجود — بدون حجم جستجوی ساختگی</p>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <article key={item.id} className="rounded-xl border border-stone-100 bg-stone-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-stone-400">{index + 1}.</span>
                  <h3 className="text-sm font-black text-stone-900">{item.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${PRIORITY_CLASS[item.priority]}`}>
                    {item.priority}
                  </span>
                  <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] font-bold text-stone-500">
                    {item.action}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {item.reasons.slice(0, 3).map((reason) => (
                    <li key={reason} className="text-xs text-stone-700">
                      • {reason}
                    </li>
                  ))}
                </ul>
                {item.contributingSignals.length > 0 && (
                  <p className="mt-2 text-[11px] text-stone-500">
                    سیگنال‌ها: {item.contributingSignals.slice(0, 4).join(' · ')}
                  </p>
                )}
              </div>
              {item.articleId != null && item.group === 'IMPROVE' && (
                <button
                  type="button"
                  disabled={busyId === String(item.articleId)}
                  onClick={() => onCreateUpdate(item)}
                  className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busyId === String(item.articleId) ? '…' : 'ساخت کار به‌روزرسانی'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
