import type { PerformanceArticleRow } from '../../utils/performanceClient';

interface Props {
  articles: PerformanceArticleRow[];
}

export default function DecayPanel({ articles }: Props) {
  const watched = articles.filter((row) =>
    ['WATCH', 'DECLINING', 'DECAYED'].includes(row.decayStatus)
  );

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black text-stone-900">موتور فرسودگی محتوا</h2>
      <p className="mt-1 text-xs text-stone-500">سن به‌تنهایی به‌معنای فرسودگی نیست؛ ترکیب سیگنال‌ها لازم است.</p>
      {watched.length === 0 ? (
        <p className="mt-4 text-sm text-stone-400">مقاله‌ای در وضعیت تحت‌نظر / نزولی / فرسوده نیست.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {watched.slice(0, 8).map((row) => (
            <li key={String(row.articleId)} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
              <span className="font-bold text-stone-800">{row.title}</span>
              <span className="mr-2 text-stone-500">· {row.decayStatus}</span>
              {row.freshnessIssueCount > 0 && (
                <span className="text-amber-700">· {row.freshnessIssueCount} مسئله تازگی</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
