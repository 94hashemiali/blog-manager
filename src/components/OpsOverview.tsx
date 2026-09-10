import { useCallback, useEffect, useState } from 'react';
import type { ManagedSite } from '../types';
import { getHealth, getOpsOverview } from '../api/ops';

interface Props {
  activeSite: ManagedSite;
  onOpenView?: (view: 'production' | 'performance' | 'seo' | 'research') => void;
}

export default function OpsOverview({ activeSite, onOpenView }: Props) {
  const [overview, setOverview] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ops, healthRes] = await Promise.all([getOpsOverview(activeSite.id), getHealth(activeSite.id)]);
      setOverview(ops.overview);
      setHealth(healthRes);
    } catch (err: any) {
      setError(err.message || 'بارگذاری نمای کلی ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [activeSite.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-stone-200 bg-gradient-to-l from-stone-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-stone-900">نمای عملیاتی</h1>
            <p className="mt-1 text-sm text-stone-600">
              چه چیزی نیاز به توجه دارد؟ — فقط دادهٔ واقعی برای{' '}
              <span className="font-bold text-emerald-700">{activeSite.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700"
          >
            تازه‌سازی
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      {loading && !overview && <p className="text-sm text-stone-400">در حال بارگذاری…</p>}

      {overview && (
        <>
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-stone-900">نیاز به توجه</h2>
            {overview.attention?.length === 0 ? (
              <p className="mt-3 text-sm text-stone-400">مورد فوری با شواهد فعلی نیست.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {overview.attention.map((row: any) => (
                  <li
                    key={row.id}
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      row.severity === 'high'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : row.severity === 'medium'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-stone-200 bg-stone-50 text-stone-700'
                    }`}
                  >
                    {row.text}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onOpenView?.('production')}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] font-bold"
              >
                تولید
              </button>
              <button
                type="button"
                onClick={() => onOpenView?.('performance')}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] font-bold"
              >
                عملکرد
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-stone-900">شمارنده‌ها</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['کارهای تولید', overview.counts.productionJobs],
                ['نیاز به بازبینی', overview.counts.needsReview],
                ['ناموفق', overview.counts.failedJobs],
                ['فرصت عملکرد', overview.counts.performanceOpportunities]
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 text-center">
                  <div className="text-xl font-black text-stone-800">{value as number}</div>
                  <div className="text-[11px] font-bold text-stone-500">{label as string}</div>
                </div>
              ))}
            </div>
            {overview.counts.performanceNeedsSync && (
              <p className="mt-3 text-xs text-amber-800">عملکرد: همگام‌سازی لازم است (GET داده نمی‌سازد).</p>
            )}
          </section>

          {health?.providers && (
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-stone-900">وضعیت ارائه‌دهنده‌ها</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(health.providers).map(([key, value]: any) => (
                  <div key={key} className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                    <div className="font-bold text-stone-800">{key}</div>
                    <div className="text-stone-600">
                      {value.status}
                      {!value.configured ? ' · not configured' : ''}
                    </div>
                    <div className="text-stone-400">{value.detail}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
