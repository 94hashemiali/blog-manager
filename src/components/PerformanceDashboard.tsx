import { useCallback, useEffect, useState } from 'react';
import type { ManagedSite } from '../types';
import {
  createUpdateJob,
  getNextActions,
  getPerformanceArticle,
  getPerformanceArticles,
  getPerformanceOverview,
  syncPerformance,
  type ContentActionRecommendation,
  type PerformanceArticleRow,
  type PerformanceOverview,
  type PerformanceRecord
} from '../utils/performanceClient';
import PerformanceOverviewPanel from './performance/PerformanceOverview';
import ProviderStatusCard from './performance/ProviderStatusCard';
import PerformanceOpportunityList from './performance/PerformanceOpportunityList';
import ContentHealthTable from './performance/ContentHealthTable';
import ArticleHealthCard from './performance/ArticleHealthCard';
import DecayPanel from './performance/DecayPanel';

interface Props {
  activeSite: ManagedSite;
  onOpenUpdateJob?: (jobId: string) => void;
}

export default function PerformanceDashboard({ activeSite, onOpenUpdateJob }: Props) {
  const siteId = activeSite.id;
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [articles, setArticles] = useState<PerformanceArticleRow[]>([]);
  const [improve, setImprove] = useState<ContentActionRecommendation[]>([]);
  const [create, setCreate] = useState<ContentActionRecommendation[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | undefined>();
  const [record, setRecord] = useState<PerformanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, articlesRes, nextRes] = await Promise.all([
        getPerformanceOverview(siteId),
        getPerformanceArticles(siteId),
        getNextActions(siteId)
      ]);
      setOverview(overviewRes.overview);
      setArticles(articlesRes.articles);
      setImprove(nextRes.improve);
      setCreate(nextRes.create);
    } catch (err: any) {
      setError(err.message || 'بارگذاری عملکرد ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    setSelectedId(undefined);
    setRecord(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedId == null) {
      setRecord(null);
      return;
    }
    let cancelled = false;
    getPerformanceArticle(siteId, selectedId)
      .then((res) => {
        if (!cancelled) setRecord(res.record);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId, selectedId]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncPerformance(siteId);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateUpdate = async (articleId: string | number, reason?: string) => {
    setBusyId(String(articleId));
    setError(null);
    try {
      const res = await createUpdateJob(siteId, articleId, { reason });
      if (onOpenUpdateJob && res.job?.id) {
        onOpenUpdateJob(res.job.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-stone-200 bg-gradient-to-l from-cyan-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-stone-900">سلامت و عملکرد محتوا</h1>
            <p className="mt-1 text-sm text-stone-600">
              حلقه بازخورد برای{' '}
              <span className="font-bold text-cyan-800">{activeSite.name}</span> — چه چیزی را به‌روز کنم؟
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            {syncing ? 'در حال همگام‌سازی…' : 'همگام‌سازی عملکرد'}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {loading && !overview && <p className="text-sm text-stone-400">در حال بارگذاری…</p>}

      {overview && (
        <>
          <PerformanceOverviewPanel overview={overview} />
          <ProviderStatusCard providers={overview.providers} />
          <PerformanceOpportunityList
            items={improve.length ? improve : overview.topPriorities.filter((row) => row.group === 'IMPROVE')}
            busyId={busyId}
            onCreateUpdate={(item) => {
              if (item.articleId != null) handleCreateUpdate(item.articleId, item.reasons[0]);
            }}
          />

          {(create.length > 0 || overview.createRecommendations.length > 0) && (
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-stone-900">ایجاد (CREATE)</h2>
              <p className="mt-1 text-xs text-stone-500">پیشنهاد تولید محتوای جدید از گراف فرصت‌ها — جدا از بهبود مقالات موجود</p>
              <ul className="mt-3 space-y-2">
                {(create.length ? create : overview.createRecommendations).slice(0, 6).map((row) => (
                  <li key={row.id} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                    <span className="font-bold text-stone-800">{row.title}</span>
                    <span className="mr-2 text-stone-500">· {row.priority}</span>
                    {row.reasons[0] && <span className="text-stone-600">— {row.reasons[0]}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-6">
              <ContentHealthTable articles={articles} selectedId={selectedId} onSelect={setSelectedId} />
              <DecayPanel articles={articles} />
            </div>
            <ArticleHealthCard
              record={record}
              busy={busyId === String(selectedId)}
              onCreateUpdate={() => {
                if (selectedId != null) handleCreateUpdate(selectedId);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
