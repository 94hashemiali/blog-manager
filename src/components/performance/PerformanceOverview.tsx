import type { PerformanceOverview } from '../../utils/performanceClient';

const OVERALL_LABEL: Record<string, string> = {
  healthy: 'سالم',
  attention_needed: 'نیاز به توجه',
  needs_data: 'نیاز به داده'
};

export default function PerformanceOverviewPanel({ overview }: { overview: PerformanceOverview }) {
  const { counts } = overview;
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-stone-900">سلامت محتوا</h2>
          <p className="mt-1 text-xs text-stone-500">بر اساس متادیتای وردپرس، تازگی، لینک داخلی و سیگنال‌های موجود</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            overview.overall === 'healthy'
              ? 'bg-emerald-100 text-emerald-800'
              : overview.overall === 'attention_needed'
                ? 'bg-amber-100 text-amber-900'
                : 'bg-stone-100 text-stone-700'
          }`}
        >
          وضعیت کلی: {OVERALL_LABEL[overview.overall] || overview.overall}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: 'سالم', value: counts.healthy, tone: 'text-emerald-700' },
          { label: 'تحت نظر', value: counts.watch, tone: 'text-amber-700' },
          { label: 'نزولی', value: counts.declining, tone: 'text-orange-700' },
          { label: 'فرسوده', value: counts.decayed, tone: 'text-rose-700' },
          { label: 'نیاز به داده', value: counts.needsData, tone: 'text-stone-600' }
        ].map((cell) => (
          <div key={cell.label} className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 text-center">
            <div className={`text-xl font-black ${cell.tone}`}>{cell.value}</div>
            <div className="mt-0.5 text-[11px] font-bold text-stone-500">{cell.label}</div>
          </div>
        ))}
      </div>
      {!overview.hasSearchPerformance && (
        <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
          Search Console متصل نیست — نمودار کلیک/نمایش و رتبه ساخته نمی‌شود. پس از اتصال، روندها و فرصت‌های جستجو اینجا ظاهر می‌شوند.
        </div>
      )}
      {(overview as any).needsSync && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          دادهٔ عملکرد همگام نشده. GET فقط دادهٔ ذخیره‌شده را می‌خواند — «همگام‌سازی عملکرد» را بزنید.
        </div>
      )}
    </section>
  );
}
