type Level = 'high' | 'medium' | 'low';

const LABELS: Record<string, string> = {
  high: 'اطمینان بالا',
  medium: 'اطمینان متوسط',
  low: 'اطمینان پایین',
  observed: 'مشاهده‌شده',
  calculated: 'محاسبه‌شده',
  inferred: 'استنتاج',
  estimated: 'تخمین',
  unknown: 'نامشخص',
  seed: 'داده بذر'
};

export default function ConfidenceBadge({
  confidence,
  sourceType
}: {
  confidence?: Level | string;
  sourceType?: string;
}) {
  const conf = confidence || 'medium';
  const src = sourceType || 'estimated';
  const color =
    src === 'observed' || src === 'calculated'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : src === 'seed'
        ? 'bg-stone-100 text-stone-600 border-stone-200'
        : 'bg-amber-50 text-amber-900 border-amber-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${color}`}>
      {LABELS[src] || src}
      {conf ? ` · ${LABELS[conf] || conf}` : ''}
    </span>
  );
}
