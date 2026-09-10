import type { ArticleHealth, PerformanceRecord } from '../../utils/performanceClient';

const DIM_LABEL: Record<string, string> = {
  content: 'محتوا',
  seo: 'سئو',
  freshness: 'تازگی',
  internalLinks: 'لینک‌ها',
  facts: 'حقایق',
  performance: 'عملکرد'
};

const STATUS_LABEL: Record<string, string> = {
  pass: 'قبول',
  warning: 'هشدار',
  error: 'خطا',
  unknown: 'نامشخص'
};

const STATUS_CLASS: Record<string, string> = {
  pass: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-rose-100 text-rose-800',
  unknown: 'bg-stone-100 text-stone-600'
};

interface Props {
  record: PerformanceRecord | null;
  busy: boolean;
  onCreateUpdate: () => void;
}

export default function ArticleHealthCard({ record, busy, onCreateUpdate }: Props) {
  if (!record) {
    return (
      <section className="rounded-2xl border border-dashed border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-black text-stone-900">سلامت مقاله</h2>
        <p className="mt-3 text-sm text-stone-400">یک ردیف از جدول را انتخاب کنید.</p>
      </section>
    );
  }

  const health: ArticleHealth = record.health;
  const topOpp = record.opportunities[0];

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-stone-900">سلامت مقاله</h2>
          <p className="mt-1 text-xs font-bold text-stone-700">{record.baseline.title}</p>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black text-stone-700">
          {health.overallStatus}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {(Object.keys(health.dimensions) as Array<keyof typeof health.dimensions>).map((key) => {
          const dim = health.dimensions[key];
          return (
            <div key={key} className="rounded-xl border border-stone-100 bg-stone-50 p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-stone-600">{DIM_LABEL[key] || key}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[dim.status]}`}>
                  {STATUS_LABEL[dim.status] || dim.status}
                </span>
              </div>
              {dim.reasons[0] && <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">{dim.reasons[0]}</p>}
            </div>
          );
        })}
      </div>

      {topOpp && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-black text-amber-900">اقدام پیشنهادی: {topOpp.recommendedAction}</p>
          <p className="mt-1 text-xs text-amber-800">{topOpp.reason}</p>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-3 text-xs text-stone-600">
        <p className="font-bold text-stone-800">تأثیر لینک داخلی</p>
        <p className="mt-1">
          ورودی: {record.linkingImpact.incoming.length} · خروجی: {record.linkingImpact.outgoing.length}
          {record.linkingImpact.clusterName ? ` · خوشه: ${record.linkingImpact.clusterName}` : ''}
          {record.linkingImpact.isOrphan ? ' · یتیم' : ''}
        </p>
        {record.linkingImpact.potentialNewLinks.length > 0 && (
          <p className="mt-1">لینک‌های بالقوه: {record.linkingImpact.potentialNewLinks.length}</p>
        )}
      </div>

      {record.trend && (
        <p className="mt-3 text-[11px] text-stone-500">
          روند: {record.trend.direction}
          {record.trend.changePercent != null ? ` (${record.trend.changePercent}%)` : ''} — {record.trend.reason}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={onCreateUpdate}
        className="mt-4 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? 'در حال ساخت…' : 'به‌روزرسانی این مقاله'}
      </button>
    </section>
  );
}
