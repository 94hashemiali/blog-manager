export default function HealthSummary({
  indexed,
  total,
  clusters,
  weak,
  outdated,
  seed
}: {
  indexed: number;
  total?: number;
  clusters: number;
  weak: number;
  outdated: number;
  seed?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card label="ایندکس‌شده" value={`${indexed}${total ? ` / ${total}` : ''}`} />
      <Card label="خوشه‌ها" value={String(clusters)} />
      <Card label="خوشه ضعیف" value={String(weak)} warn={weak > 0} />
      <Card label="نیاز به بازنگری" value={String(outdated)} warn={outdated > 0} />
      <Card label="منبع پروفایل" value={seed ? 'بذر / دمو' : 'ایندکس واقعی'} warn={Boolean(seed)} />
    </div>
  );
}

function Card({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-stone-200'}`}>
      <div className="text-[10px] text-stone-500 font-bold">{label}</div>
      <div className="text-sm font-black text-stone-900 mt-1">{value}</div>
    </div>
  );
}
