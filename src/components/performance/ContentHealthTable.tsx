import type { PerformanceArticleRow } from '../../utils/performanceClient';

interface Props {
  articles: PerformanceArticleRow[];
  selectedId?: string | number;
  onSelect: (articleId: string | number) => void;
}

const DECAY_LABEL: Record<string, string> = {
  HEALTHY: 'سالم',
  WATCH: 'تحت نظر',
  DECLINING: 'نزولی',
  DECAYED: 'فرسوده',
  INSUFFICIENT_DATA: 'داده ناکافی'
};

export default function ContentHealthTable({ articles, selectedId, onSelect }: Props) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black text-stone-900">جدول سلامت مقالات</h2>
      <p className="mt-1 text-xs text-stone-500">متادیتای وردپرس و ارزیابی محلی — نه متریک جعلی SEO</p>
      {articles.length === 0 ? (
        <p className="mt-4 text-sm text-stone-400">ایندکس خالی است یا هنوز همگام‌سازی عملکرد اجرا نشده.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-right text-xs">
            <thead>
              <tr className="border-b border-stone-100 text-stone-500">
                <th className="px-2 py-2 font-bold">عنوان</th>
                <th className="px-2 py-2 font-bold">فرسودگی</th>
                <th className="px-2 py-2 font-bold">سلامت</th>
                <th className="px-2 py-2 font-bold">روز از ویرایش</th>
                <th className="px-2 py-2 font-bold">فرصت‌ها</th>
                <th className="px-2 py-2 font-bold">کیفیت داده</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((row) => (
                <tr
                  key={String(row.articleId)}
                  onClick={() => onSelect(row.articleId)}
                  className={`cursor-pointer border-b border-stone-50 hover:bg-emerald-50/40 ${
                    String(selectedId) === String(row.articleId) ? 'bg-emerald-50/60' : ''
                  }`}
                >
                  <td className="max-w-[240px] truncate px-2 py-2.5 font-bold text-stone-800">{row.title}</td>
                  <td className="px-2 py-2.5">{DECAY_LABEL[row.decayStatus] || row.decayStatus}</td>
                  <td className="px-2 py-2.5">{row.overallHealth}</td>
                  <td className="px-2 py-2.5" dir="ltr">
                    {row.daysSinceModification ?? '—'}
                  </td>
                  <td className="px-2 py-2.5">
                    {row.opportunityCount}
                    {row.topOpportunity ? ` · ${row.topOpportunity}` : ''}
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.quality === 'DEMO_DATA'
                          ? 'bg-violet-100 text-violet-800'
                          : row.quality === 'VERIFIED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {row.quality === 'DEMO_DATA' ? 'دمو' : row.quality}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
