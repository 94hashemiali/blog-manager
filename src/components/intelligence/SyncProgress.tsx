const STAGE_LABELS: Record<string, string> = {
  connecting: 'اتصال به وردپرس',
  fetching_articles: 'دریافت مقالات',
  fetching_categories: 'دریافت دسته‌ها',
  fetching_tags: 'دریافت برچسب‌ها',
  detecting_products: 'تشخیص محصولات',
  normalizing: 'نرمال‌سازی محتوا',
  fingerprints: 'ساخت اثرانگشت',
  clusters: 'ساخت خوشه‌ها',
  gaps: 'تشخیص شکاف‌ها',
  updating_intelligence: 'به‌روزرسانی هوش سایت'
};

export default function SyncProgress({
  stage,
  done,
  total,
  detail
}: {
  stage?: string | null;
  done?: number;
  total?: number;
  detail?: string;
}) {
  if (!stage) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
      <span className="font-bold">{STAGE_LABELS[stage] || stage}</span>
      {typeof done === 'number' && typeof total === 'number' && total > 0 && (
        <span>
          Indexed {done} / {total} articles
        </span>
      )}
      {detail && <span className="text-stone-500 truncate">{detail}</span>}
    </div>
  );
}
