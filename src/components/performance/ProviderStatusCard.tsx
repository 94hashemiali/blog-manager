import type { ProviderStatus } from '../../utils/performanceClient';

const STATUS_LABEL: Record<string, string> = {
  connected: 'متصل',
  not_connected: 'متصل نیست',
  misconfigured: 'پیکربندی ناقص',
  error: 'خطا'
};

export default function ProviderStatusCard({ providers }: { providers: ProviderStatus[] }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black text-stone-900">منابع داده عملکرد</h2>
      <p className="mt-1 text-xs text-stone-500">
        اعداد Search Console یا Analytics فقط وقتی نمایش داده می‌شوند که واقعاً متصل باشند.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {providers.map((provider) => (
          <div key={provider.provider} className="rounded-xl border border-stone-100 bg-stone-50/80 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-stone-800">{provider.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  provider.status === 'connected'
                    ? 'bg-emerald-100 text-emerald-800'
                    : provider.status === 'not_connected'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                }`}
              >
                {STATUS_LABEL[provider.status] || provider.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">{provider.detail}</p>
            {provider.provider === 'search_console' && provider.status === 'not_connected' && (
              <button
                type="button"
                disabled
                className="mt-3 w-full rounded-lg border border-dashed border-stone-300 px-2 py-1.5 text-[11px] font-bold text-stone-400"
                title="OAuth هنوز پیکربندی نشده"
              >
                اتصال Search Console (پیکربندی نشده)
              </button>
            )}
            {provider.provider === 'analytics' && provider.status === 'not_connected' && (
              <button
                type="button"
                disabled
                className="mt-3 w-full rounded-lg border border-dashed border-stone-300 px-2 py-1.5 text-[11px] font-bold text-stone-400"
              >
                اتصال Analytics (پیکربندی نشده)
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
