import { useCallback, useEffect, useState } from 'react';
import type { ManagedSite } from '../types';
import {
  dismissRecommendation,
  executeRecommendation,
  getOperationsSnapshot,
  getReviewDiff,
  type AttentionItem,
  type OperationRecommendation,
  type OperationsSnapshot
} from '../api/operations';
import { AlertTriangle, Activity, CheckCircle2, Clock, RefreshCw, Shield, Wifi, WifiOff } from 'lucide-react';

interface Props {
  activeSite: ManagedSite;
  onOpenView?: (view: 'production' | 'performance' | 'seo' | 'research' | 'posts') => void;
  onOpenJobs?: () => void;
  onOpenSettings?: () => void;
  onOpenProductionJob?: (jobId: string) => void;
}

const SEV: Record<string, string> = {
  CRITICAL: 'border-rose-300 bg-rose-50 text-rose-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-950',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-950',
  LOW: 'border-stone-200 bg-stone-50 text-stone-700',
  INFO: 'border-sky-200 bg-sky-50 text-sky-900'
};

const HEALTH_LABEL: Record<string, string> = {
  healthy: 'سالم',
  needs_attention: 'نیاز به توجه',
  critical: 'بحرانی',
  insufficient_data: 'داده ناکافی'
};

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

export default function OpsOverview({
  activeSite,
  onOpenView,
  onOpenJobs,
  onOpenSettings,
  onOpenProductionJob
}: Props) {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [diffPreview, setDiffPreview] = useState<any>(null);
  const isDemo = Boolean((activeSite as any).isDemo);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOperationsSnapshot(activeSite.id);
      setSnapshot(res.snapshot);
    } catch (err: any) {
      setError(err.message || 'بارگذاری عملیات ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [activeSite.id]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 12000);
    return () => clearInterval(id);
  }, [refresh]);

  const runRec = async (rec: OperationRecommendation, mode: 'execute' | 'dismiss') => {
    setBusyId(rec.id);
    try {
      if (mode === 'dismiss') await dismissRecommendation(activeSite.id, rec.id);
      else {
        const result = await executeRecommendation(activeSite.id, rec.id);
        if (result.productionJobId && onOpenProductionJob) {
          onOpenProductionJob(result.productionJobId);
        } else if (rec.type === 'CONFIGURE_PROVIDER') {
          onOpenSettings?.();
        } else if (rec.suggestedAction === 'SYNC' || rec.type === 'SYNC_CONTENT') {
          onOpenView?.('performance');
        }
      }
      await refresh();
    } catch (err: any) {
      setError(err.message || 'اقدام ناموفق');
    } finally {
      setBusyId(null);
    }
  };

  const openDiff = async (productionJobId: string) => {
    try {
      const data = await getReviewDiff(activeSite.id, productionJobId);
      setDiffPreview(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const attention: AttentionItem[] = snapshot?.attention || [];
  const recs = snapshot?.recommendations || [];

  return (
    <div className="space-y-5" dir="rtl">
      <header className="rounded-2xl border border-stone-200 bg-gradient-to-l from-emerald-50/80 via-white to-stone-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Content Operating System</p>
            <h1 className="mt-1 text-xl font-black text-stone-900">مرکز عملیات محتوا</h1>
            <p className="mt-1 text-sm text-stone-600">
              چه چیزی نیاز به توجه دارد؟ —{' '}
              <span className="font-bold text-emerald-800">{activeSite.name}</span>
              {isDemo && (
                <Badge className="mr-2 bg-amber-100 text-amber-900 border border-amber-200">DEMO</Badge>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenJobs?.()}
              className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700"
            >
              Job Center
            </button>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              تازه‌سازی
            </button>
          </div>
        </div>

        {snapshot && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ['سلامت', HEALTH_LABEL[snapshot.health.overall] || snapshot.health.overall],
              ['در حال اجرا', String(snapshot.activeJobs)],
              ['صف', String(snapshot.queuedJobs)],
              ['ناموفق', String(snapshot.failedJobs)],
              ['بازیابی', String(snapshot.recoveryJobs)],
              ['توصیه باز', String(recs.filter((r) => r.status === 'OPEN').length)]
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-stone-200/80 bg-white/90 px-3 py-2">
                <div className="text-[10px] font-bold text-stone-500">{k}</div>
                <div className="text-sm font-black text-stone-900">{v}</div>
              </div>
            ))}
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {loading && !snapshot && <p className="text-sm text-stone-400">در حال بارگذاری…</p>}

      {snapshot && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* A. Attention — primary column */}
          <section className="space-y-3 lg:col-span-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-black text-stone-900">نیاز به توجه</h2>
            </div>
            {attention.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-400">
                مورد فوری با شواهد فعلی نیست.
              </div>
            ) : (
              <ul className="space-y-2">
                {attention.slice(0, 12).map((row) => (
                  <li
                    key={row.id}
                    className={`rounded-xl border px-3 py-3 text-xs ${SEV[row.severity] || SEV.LOW}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-black/10">{row.severity}</Badge>
                      <span className="font-black">{row.title}</span>
                      <Badge className="bg-white/60 text-stone-700">{row.action}</Badge>
                    </div>
                    <p className="mt-1.5 leading-relaxed opacity-90">{row.description}</p>
                    {row.reasons?.length > 0 && (
                      <p className="mt-1 text-[10px] opacity-70">چرا مهم است: {row.reasons.slice(0, 2).join(' · ')}</p>
                    )}
                    {(row.articleId != null || row.sourceUrl || row.jobId) && (
                      <p className="mt-1 text-[10px] font-mono opacity-60">
                        {[
                          row.articleId != null ? `article ${row.articleId}` : null,
                          row.jobId ? `job ${row.jobId}` : null,
                          row.sourceUrl ? row.sourceUrl.slice(0, 48) : null
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* G. Recommendations */}
            <div className="pt-2">
              <h2 className="mb-2 text-sm font-black text-stone-900">توصیه‌ها</h2>
              {recs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
                  توصیه‌ای باز نیست.
                </div>
              ) : (
                <ul className="space-y-2">
                  {recs.slice(0, 10).map((rec) => (
                    <li key={rec.id} className="rounded-xl border border-stone-200 bg-white px-3 py-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={SEV[rec.priority] || SEV.LOW}>{rec.priority}</Badge>
                            <span className="text-xs font-black text-stone-900">{rec.title}</span>
                            <Badge className="bg-stone-100 text-stone-600">{rec.type}</Badge>
                            <Badge className="bg-stone-50 text-stone-500">{rec.status}</Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-stone-600">{rec.explanation}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {rec.status === 'OPEN' || rec.status === 'ACKNOWLEDGED' ? (
                            <>
                              <button
                                type="button"
                                disabled={busyId === rec.id}
                                onClick={() => runRec(rec, 'execute')}
                                className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                اجرا
                              </button>
                              <button
                                type="button"
                                disabled={busyId === rec.id}
                                onClick={() => runRec(rec, 'dismiss')}
                                className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[10px] font-bold text-stone-600"
                              >
                                رد
                              </button>
                            </>
                          ) : rec.linkedProductionJobId ? (
                            <button
                              type="button"
                              onClick={() => onOpenProductionJob?.(rec.linkedProductionJobId!)}
                              className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[10px] font-bold"
                            >
                              باز کردن جاب
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Review center */}
            <div className="pt-2">
              <h2 className="mb-2 text-sm font-black text-stone-900">مرکز بازبینی</h2>
              {snapshot.reviewQueue.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
                  موردی آماده بازبینی نیست.
                </div>
              ) : (
                <ul className="space-y-2">
                  {snapshot.reviewQueue.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-black text-stone-900">{row.topic}</div>
                        <div className="text-[10px] text-stone-500">
                          {row.stage}
                          {row.mode ? ` · ${row.mode}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDiff(row.id)}
                          className="rounded-lg border border-stone-200 px-2 py-1 text-[10px] font-bold"
                        >
                          Diff
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenProductionJob?.(row.id)}
                          className="rounded-lg bg-stone-900 px-2 py-1 text-[10px] font-black text-white"
                        >
                          بازبینی
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {diffPreview && (
                <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-black">تغییرات پیشنهادی</span>
                    <button type="button" className="text-[10px] font-bold" onClick={() => setDiffPreview(null)}>
                      بستن
                    </button>
                  </div>
                  <ul className="mt-2 list-disc pr-4 text-stone-700">
                    {(diffPreview.diff?.summary || []).map((line: string, i: number) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  {(diffPreview.diff?.sections || []).slice(0, 8).map((sec: any, i: number) => (
                    <div key={i} className="mt-2 border-t border-sky-100 pt-2">
                      <Badge className="bg-white">{sec.change}</Badge> {sec.label}
                      {sec.before && <p className="mt-1 text-rose-700 line-through opacity-80">{sec.before.slice(0, 120)}</p>}
                      {sec.after && <p className="text-emerald-800">{sec.after.slice(0, 120)}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Side column */}
          <aside className="space-y-4">
            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-700" />
                <h2 className="text-sm font-black">عملیات فعال</h2>
              </div>
              {(snapshot.recentJobs || []).filter((j: any) =>
                ['RUNNING', 'QUEUED', 'PAUSED', 'RECOVERY_REQUIRED'].includes(j.status)
              ).length === 0 ? (
                <p className="text-xs text-stone-400">هیچ عملیات فعالی نیست.</p>
              ) : (
                <ul className="space-y-1.5">
                  {(snapshot.recentJobs as any[])
                    .filter((j) => ['RUNNING', 'QUEUED', 'PAUSED', 'RECOVERY_REQUIRED'].includes(j.status))
                    .slice(0, 8)
                    .map((j) => (
                      <li key={j.id} className="rounded-lg border border-stone-100 px-2 py-1.5 text-[11px]">
                        <div className="font-bold">{j.type}</div>
                        <div className="text-stone-500">
                          {j.status} · {j.progress?.percentage ?? 0}% · {j.currentStage || '—'}
                        </div>
                      </li>
                    ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => onOpenJobs?.()}
                className="mt-3 w-full rounded-lg border border-stone-200 py-1.5 text-[10px] font-black"
              >
                Job Center
              </button>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-stone-700" />
                <h2 className="text-sm font-black">سلامت سیستم</h2>
              </div>
              <dl className="space-y-2 text-[11px]">
                <div>
                  <dt className="text-stone-500">محتوا</dt>
                  <dd className="font-bold">
                    {HEALTH_LABEL[snapshot.health.content.status] || snapshot.health.content.status}
                    {snapshot.health.content.score != null ? ` · ${snapshot.health.content.score}/100` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-500">عملکرد</dt>
                  <dd className="font-bold">{HEALTH_LABEL[snapshot.health.performance.status]}</dd>
                </div>
                <div>
                  <dt className="text-stone-500">تحقیق</dt>
                  <dd className="font-bold">
                    {HEALTH_LABEL[snapshot.health.research.status]}
                    {snapshot.health.research.staleCount
                      ? ` · ${snapshot.health.research.staleCount} stale`
                      : ''}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => onOpenView?.('performance')}
                className="mt-3 w-full rounded-lg border border-stone-200 py-1.5 text-[10px] font-black"
              >
                Performance
              </button>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-black">ارائه‌دهندگان</h2>
              <ul className="space-y-1.5">
                {Object.entries(snapshot.health.providers || {}).map(([id, row]) => (
                  <li key={id} className="flex items-start justify-between gap-2 text-[11px]">
                    <span className="font-bold capitalize">{id}</span>
                    <span className="flex items-center gap-1 text-left text-stone-600">
                      {row.status === 'connected' || row.status === 'ok' ? (
                        <Wifi className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-amber-600" />
                      )}
                      <span className="max-w-[140px] truncate" title={row.detail}>
                        {row.status}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onOpenSettings?.()}
                className="mt-3 w-full rounded-lg border border-stone-200 py-1.5 text-[10px] font-black"
              >
                تنظیمات
              </button>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <h2 className="text-sm font-black">فعالیت اخیر</h2>
              </div>
              {snapshot.recentEvents.length === 0 ? (
                <p className="text-xs text-stone-400">رویدادی ثبت نشده.</p>
              ) : (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {snapshot.recentEvents.slice(0, 15).map((ev) => (
                    <li key={ev.eventId} className="border-b border-stone-50 pb-1.5 text-[10px] last:border-0">
                      <div className="font-bold text-stone-800">{ev.type}</div>
                      <div className="text-stone-400">
                        {new Date(ev.timestamp).toLocaleString('fa-IR')}
                        {ev.jobId ? ` · ${ev.jobId.slice(0, 10)}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-black">Impactهای باز</h2>
              {snapshot.openImpacts.length === 0 ? (
                <p className="text-xs text-stone-400">تأثیر منبع بازی نیست.</p>
              ) : (
                <ul className="space-y-1.5 text-[11px]">
                  {snapshot.openImpacts.slice(0, 6).map((imp) => (
                    <li key={imp.id} className="rounded-lg bg-stone-50 px-2 py-1.5">
                      <div className="truncate font-mono text-[10px]">{imp.sourceUrl}</div>
                      <div className="text-stone-500">
                        {imp.affectedSessionIds.length} session · {imp.affectedProductionJobIds.length} article job
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {snapshot.schedules.length > 0 && (
              <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <h2 className="text-sm font-black">زمان‌بندی</h2>
                </div>
                <ul className="space-y-1 text-[11px]">
                  {snapshot.schedules.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>{s.type}</span>
                      <span className="text-stone-500">{s.enabled ? s.interval : 'off'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
