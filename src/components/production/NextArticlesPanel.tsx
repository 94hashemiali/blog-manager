import type { NextArticleRecommendation } from '../../utils/productionClient';

interface Props {
  recommendations: NextArticleRecommendation[];
  indexEmpty: boolean;
  indexedAt?: string;
  loading: boolean;
  onStart: (row: NextArticleRecommendation) => void;
  onRefresh: () => void;
}

export default function NextArticlesPanel({
  recommendations,
  indexEmpty,
  indexedAt,
  loading,
  onStart,
  onRefresh
}: Props) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-stone-900">الان چه مقاله‌ای بنویسم؟</h2>
          <p className="mt-1 text-sm text-stone-500">
            پیشنهادها از ایندکس واقعی سایت محاسبه شده‌اند؛ حجم جستجو یا ترافیک ساخته نمی‌شود.
          </p>
          {indexedAt && (
            <p className="mt-1 text-[11px] text-stone-400">آخرین ایندکس: {new Date(indexedAt).toLocaleString('fa-IR')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-50"
        >
          تازه‌سازی
        </button>
      </div>

      {loading && <div className="py-8 text-center text-sm text-stone-400">در حال بارگذاری پیشنهادها…</div>}

      {!loading && indexEmpty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ایندکس محتوا خالی است. ابتدا سایت را از مرکز سئو همگام‌سازی کنید تا پیشنهادها بر اساس محتوای واقعی ساخته شوند.
        </div>
      )}

      {!loading && !indexEmpty && recommendations.length === 0 && (
        <div className="py-8 text-center text-sm text-stone-400">فرصتی برای نمایش پیدا نشد.</div>
      )}

      <div className="space-y-3">
        {recommendations.map((row) => (
          <article key={row.opportunityId} className="rounded-xl border border-stone-100 bg-stone-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-stone-900">{row.title}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-500 border border-stone-200">
                    اولویت {row.priority}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-500 border border-stone-200">
                    {row.searchIntent}
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-500 border border-stone-200">
                    شواهد: {row.evidenceAvailability.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  کلیدواژه: {row.primaryKeyword}
                  {row.clusterName ? ` · خوشه: ${row.clusterName}` : ''}
                  {row.clusterHealthScore != null ? ` · سلامت خوشه: ${row.clusterHealthScore}` : ''}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {row.whyBullets.slice(0, 4).map((bullet) => (
                    <li key={bullet} className="flex gap-2 text-xs leading-relaxed text-stone-700">
                      <span className="mt-0.5 text-emerald-600">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                {row.seasonalNote && (
                  <p className="mt-2 text-[11px] text-cyan-800 bg-cyan-50 border border-cyan-100 rounded-lg px-2 py-1">
                    {row.seasonalNote}
                  </p>
                )}
                {row.decision !== 'CREATE_NEW' && (
                  <p className="mt-2 text-[11px] font-bold text-amber-700">
                    توجه موتور تمایز: {row.decision} · ریسک {row.cannibalizationRisk}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onStart(row)}
                className="shrink-0 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white hover:bg-emerald-700"
              >
                شروع تولید
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
