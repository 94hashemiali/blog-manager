import { useCallback, useEffect, useState } from 'react';
import type { ManagedSite } from '../types';
import PipelineStrip from './production/PipelineStrip';
import NextArticlesPanel from './production/NextArticlesPanel';
import {
  SECTION_ACTIONS,
  attachVisual,
  createProductionJob,
  editSection,
  getNextArticles,
  getProductionJob,
  getVisualRequest,
  listProductionJobs,
  restoreJobVersion,
  runStage,
  runPipelineJob,
  saveDraftContent,
  type NextArticleRecommendation,
  type ProductionJobSummary,
  type ProgressStep
} from '../utils/productionClient';
import {
  createUpdateJob,
  getNextActions,
  type ContentActionRecommendation
} from '../utils/performanceClient';
import { addResearchSource, refreshResearchSession } from '../utils/researchClient';
import { pollJob } from '../api/jobs';

interface Props {
  activeSite: ManagedSite;
  onOpenVisuals?: () => void;
  initialJobId?: string | null;
  onInitialJobConsumed?: () => void;
}

type ReviewTab = 'content' | 'seo' | 'facts' | 'links' | 'visuals' | 'publishing';

const STAGE_LABELS: Record<string, string> = {
  idea: 'ایده',
  researched: 'تحقیق‌شده',
  brief_ready: 'بریف آماده',
  drafting: 'در حال نگارش',
  draft_ready: 'پیش‌نویس آماده',
  fact_checked: 'بررسی صحت',
  seo_ready: 'سئو آماده',
  review: 'بازبینی',
  approved: 'تأییدشده',
  publishing: 'در حال انتشار',
  published: 'منتشرشده',
  needs_revision: 'نیاز به اصلاح'
};

export default function ContentStudio({
  activeSite,
  onOpenVisuals,
  initialJobId,
  onInitialJobConsumed
}: Props) {
  const [jobs, setJobs] = useState<ProductionJobSummary[]>([]);
  const [recommendations, setRecommendations] = useState<NextArticleRecommendation[]>([]);
  const [improveActions, setImproveActions] = useState<ContentActionRecommendation[]>([]);
  const [indexEmpty, setIndexEmpty] = useState(false);
  const [indexedAt, setIndexedAt] = useState<string>();
  const [job, setJob] = useState<any>(null);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<ReviewTab>('content');
  const [topicInput, setTopicInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [sectionHeading, setSectionHeading] = useState('');
  const [sectionAction, setSectionAction] = useState(SECTION_ACTIONS[0].id);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [researchUrl, setResearchUrl] = useState('');
  const [showResearchDetail, setShowResearchDetail] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);

  const siteId = activeSite.id;

  const refreshLists = useCallback(async () => {
    setLoadingList(true);
    setLoadingRecs(true);
    setError(null);
    try {
      const [jobsRes, nextRes, improveRes] = await Promise.all([
        listProductionJobs(siteId),
        getNextArticles(siteId, 8),
        getNextActions(siteId).catch(() => ({ improve: [] as ContentActionRecommendation[] }))
      ]);
      setJobs(jobsRes.jobs);
      setRecommendations(nextRes.recommendations);
      setIndexEmpty(nextRes.indexEmpty);
      setIndexedAt(nextRes.indexedAt);
      setImproveActions(improveRes.improve || []);
    } catch (err: any) {
      setError(err.message || 'بارگذاری استودیو ناموفق بود.');
    } finally {
      setLoadingList(false);
      setLoadingRecs(false);
    }
  }, [siteId]);

  useEffect(() => {
    setJob(null);
    setProgress([]);
    refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    if (!initialJobId) return;
    let cancelled = false;
    (async () => {
      setBusy('load');
      try {
        const payload = await getProductionJob(siteId, initialJobId);
        if (!cancelled) {
          setJob(payload.job);
          setProgress(payload.progress);
          if (payload.job?.draft) {
            setDraftTitle(payload.job.draft.title || '');
            setDraftContent(payload.job.draft.content || '');
          }
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) {
          setBusy(null);
          onInitialJobConsumed?.();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialJobId, siteId, onInitialJobConsumed]);

  const applyJobPayload = (payload: { job: any; progress: ProgressStep[] }) => {
    setJob(payload.job);
    setProgress(payload.progress);
    if (payload.job?.draft) {
      setDraftTitle(payload.job.draft.title || '');
      setDraftContent(payload.job.draft.content || '');
      if (!sectionHeading && payload.job.draft.sections?.[0]?.heading) {
        setSectionHeading(payload.job.draft.sections[0].heading);
      }
    }
  };

  const openJob = async (jobId: string) => {
    setBusy('load');
    setError(null);
    try {
      applyJobPayload(await getProductionJob(siteId, jobId));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const startFromRecommendation = async (row: NextArticleRecommendation) => {
    setBusy('create');
    setError(null);
    try {
      const payload = await createProductionJob(siteId, {
        topic: row.title,
        primaryKeyword: row.primaryKeyword,
        searchIntent: row.searchIntent,
        opportunityId: row.opportunityId
      });
      applyJobPayload(payload);
      await refreshLists();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const startFromInput = async () => {
    if (!topicInput.trim()) return;
    setBusy('create');
    setError(null);
    try {
      const payload = await createProductionJob(siteId, {
        topic: topicInput.trim(),
        primaryKeyword: keywordInput.trim() || undefined
      });
      applyJobPayload(payload);
      setTopicInput('');
      setKeywordInput('');
      await refreshLists();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const startFromImprove = async (row: ContentActionRecommendation) => {
    if (row.articleId == null) return;
    setBusy('update');
    setError(null);
    try {
      const payload = await createUpdateJob(siteId, row.articleId, {
        reason: row.reasons[0]
      });
      applyJobPayload({ job: payload.job, progress: payload.progress });
      await refreshLists();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const startResearch = async () => {
    if (!job) return;
    await run('research', { urls: collectResearchUrls() });
  };

  const handleAddResearchSource = async () => {
    if (!job?.research?.researchSessionId || !researchUrl.trim()) return;
    setResearchBusy(true);
    setError(null);
    try {
      const url = researchUrl.trim().split(/[\n,]/)[0];
      await addResearchSource(siteId, job.research.researchSessionId, url);
      // Re-run research with the new URL so the packet stays in sync.
      const urls = [
        ...(job.research.sources || []).map((row: any) => row.url).filter(Boolean),
        url
      ];
      await run('research', { urls: [...new Set(urls)] });
      setResearchUrl('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResearchBusy(false);
    }
  };

  const handleRefreshResearch = async () => {
    if (!job?.research) return;
    setResearchBusy(true);
    setError(null);
    try {
      const urls = (job.research.sources || [])
        .map((row: any) => row.url)
        .filter((url: string | undefined): url is string => Boolean(url && /^https?:\/\//i.test(url)));
      if (job.research.researchSessionId) {
        await refreshResearchSession(siteId, job.research.researchSessionId);
      }
      await run('research', { urls, forceRefreshUrls: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResearchBusy(false);
    }
  };

  const collectResearchUrls = () => {
    const fromInput = researchUrl
      .split(/[\n,]/)
      .map((row) => row.trim())
      .filter(Boolean);
    const fromJob = (job?.research?.sources || [])
      .map((row: any) => row.url)
      .filter((url: string | undefined): url is string => Boolean(url && /^https?:\/\//i.test(url)));
    return [...new Set([...fromInput, ...fromJob])];
  };

  const run = async (stage: string, body: Record<string, unknown> = {}) => {
    if (!job) return;
    setBusy(stage);
    setError(null);
    try {
      const payload = await runStage(siteId, job.id, stage, body);
      applyJobPayload(payload);
      await refreshLists();
    } catch (err: any) {
      setError(err.message);
      if (err.payload?.job) applyJobPayload(err.payload);
    } finally {
      setBusy(null);
    }
  };

  const runPipelineToReview = async () => {
    if (!job) return;
    setBusy('pipeline');
    setError(null);
    try {
      const queued = await runPipelineJob(siteId, job.id, {
        runUntil: 'review',
        urls: collectResearchUrls()
      });
      setBusy(`ops:${queued.jobId}`);
      await pollJob(queued.jobId, {
        siteId,
        intervalMs: 1500,
        onUpdate: (ops) => {
          setBusy(`ops:${ops.progress?.label || ops.currentStage || ops.status}`);
        }
      });
      const refreshed = await getProductionJob(siteId, job.id);
      applyJobPayload(refreshed);
      await refreshLists();
    } catch (err: any) {
      setError(err.message);
      if (err.payload?.job) applyJobPayload(err.payload);
    } finally {
      setBusy(null);
    }
  };

  const handleSectionEdit = async () => {
    if (!job || !sectionHeading) return;
    setBusy('section-edit');
    setError(null);
    try {
      applyJobPayload(await editSection(siteId, job.id, { sectionHeading, action: sectionAction }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = async () => {
    if (!job) return;
    setBusy('save-draft');
    setError(null);
    try {
      applyJobPayload(
        await saveDraftContent(siteId, job.id, { title: draftTitle, content: draftContent })
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleVisual = async () => {
    if (!job) return;
    setBusy('visual');
    setError(null);
    try {
      const visual = await getVisualRequest(siteId, job.id);
      const response = await fetch('/api/ai/visual-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...visual.visualEngineRequest, async: false })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'ساخت تصویر ناموفق بود.');
      }
      const assetId = data.image?.id || data.image?.imageId || data.asset?.id;
      if (assetId) applyJobPayload(await attachVisual(siteId, job.id, assetId));
      onOpenVisuals?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (version: number) => {
    if (!job) return;
    setBusy('restore');
    setError(null);
    try {
      applyJobPayload(await restoreJobVersion(siteId, job.id, version));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const reviewTabs: Array<{ id: ReviewTab; label: string }> = [
    { id: 'content', label: 'محتوا' },
    { id: 'seo', label: 'سئو' },
    { id: 'facts', label: 'ادعاها' },
    { id: 'links', label: 'لینک‌ها' },
    { id: 'visuals', label: 'تصویر' },
    { id: 'publishing', label: 'انتشار' }
  ];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-stone-200 bg-gradient-to-l from-emerald-50 to-white p-5 shadow-sm">
        <h1 className="text-xl font-black text-stone-900">استودیوی تولید محتوا</h1>
        <p className="mt-1 text-sm text-stone-600">
          تحقیق → بریف → پیش‌نویس → بررسی صحت → سئو → تصویر → بازبینی → انتشار برای{' '}
          <span className="font-bold text-emerald-700">{activeSite.name}</span>
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {!job && (
        <>
          <NextArticlesPanel
            recommendations={recommendations}
            indexEmpty={indexEmpty}
            indexedAt={indexedAt}
            loading={loadingRecs}
            onStart={startFromRecommendation}
            onRefresh={refreshLists}
          />

          {improveActions.length > 0 && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
              <h2 className="text-lg font-black text-stone-900">الان چه چیزی را بهبود دهم؟</h2>
              <p className="mt-1 text-sm text-stone-600">
                پیشنهادهای IMPROVE از سیگنال‌های سلامت/فرسودگی — بدون اعداد Search Console ساختگی
              </p>
              <div className="mt-4 space-y-3">
                {improveActions.slice(0, 5).map((row) => (
                  <article key={row.id} className="rounded-xl border border-amber-100 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-black text-stone-900">{row.title}</h3>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            {row.priority}
                          </span>
                          <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-500">
                            {row.action}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {row.reasons.slice(0, 3).map((reason) => (
                            <li key={reason} className="text-xs text-stone-700">
                              • {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        disabled={busy === 'update'}
                        onClick={() => startFromImprove(row)}
                        className="shrink-0 rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-black text-white hover:bg-amber-800 disabled:opacity-50"
                      >
                        ساخت کار به‌روزرسانی
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black text-stone-900">شروع از موضوع دلخواه</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={topicInput}
                onChange={(event) => setTopicInput(event.target.value)}
                placeholder="موضوع مقاله"
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
              />
              <input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="کلیدواژهٔ اصلی (اختیاری)"
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy === 'create' || !topicInput.trim()}
                onClick={startFromInput}
                className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                ساخت کار تولید
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-black text-stone-900">کارهای تولید اخیر</h2>
            {loadingList && <p className="text-sm text-stone-400">در حال بارگذاری…</p>}
            {!loadingList && jobs.length === 0 && (
              <p className="text-sm text-stone-400">هنوز کاری ساخته نشده است.</p>
            )}
            <div className="space-y-2">
              {jobs.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => openJob(row.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 text-right hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div>
                    <div className="text-sm font-bold text-stone-800">{row.topic}</div>
                    <div className="text-[11px] text-stone-500">
                      {STAGE_LABELS[row.stage] || row.stage}
                      {row.decision ? ` · ${row.decision}` : ''}
                      {row.validationScore != null ? ` · اعتبار ${row.validationScore}` : ''}
                    </div>
                  </div>
                  <span className="text-[11px] text-stone-400">
                    {new Date(row.updatedAt).toLocaleDateString('fa-IR')}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {job && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => setJob(null)}
                className="text-xs font-bold text-stone-500 hover:text-stone-800"
              >
                ← بازگشت به فهرست
              </button>
              <h2 className="mt-1 text-lg font-black text-stone-900">{job.topic}</h2>
              <p className="text-xs text-stone-500">
                {job.primaryKeyword} · {STAGE_LABELS[job.stage] || job.stage}
                {job.mode ? ` · حالت: ${job.mode}` : ''}
                {job.decision?.recommendation ? ` · تصمیم: ${job.decision.recommendation}` : ''}
              </p>
              {(job.mode === 'UPDATE' || job.mode === 'MERGE') && (
                <div className="mt-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
                  <p className="font-black">به‌روزرسانی مقاله موجود</p>
                  {job.updateReason && <p className="mt-1">دلیل: {job.updateReason}</p>}
                  {job.sourceArticleId != null && (
                    <p className="mt-1 text-[11px]">شناسه منبع: {String(job.sourceArticleId)}</p>
                  )}
                  {job.updatePlan?.whyUpdateNeeded?.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {job.updatePlan.whyUpdateNeeded.slice(0, 4).map((line: string) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={runPipelineToReview}
                className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white disabled:opacity-50"
              >
                {busy ? `در حال ${busy}…` : 'اجرای خط تولید تا بازبینی'}
              </button>
              {!job.research && (
                <StageButton label="تحقیق" busy={busy} stage="research" onClick={() => startResearch()} />
              )}
              {job.research && !job.brief && (
                <StageButton label="بریف" busy={busy} stage="brief" onClick={() => run('brief')} />
              )}
              {job.brief && !job.draft && (
                <StageButton label="نگارش" busy={busy} stage="draft" onClick={() => run('draft')} />
              )}
              {job.draft && !job.factCheck && (
                <StageButton label="بررسی صحت" busy={busy} stage="fact-check" onClick={() => run('fact-check')} />
              )}
              {job.draft && !job.seoPreflight && (
                <StageButton
                  label="پیش‌پرواز سئو"
                  busy={busy}
                  stage="seo-preflight"
                  onClick={() => run('seo-preflight')}
                />
              )}
              {job.draft && job.stage !== 'review' && job.stage !== 'approved' && job.stage !== 'published' && (
                <StageButton label="بازبینی" busy={busy} stage="review" onClick={() => run('review')} />
              )}
              {job.stage === 'review' && (
                <StageButton label="تأیید" busy={busy} stage="approve" onClick={() => run('approve')} />
              )}
            </div>
          </div>

          <PipelineStrip progress={progress} />

          {job.decision && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
              <div className="font-black text-stone-800">موتور تمایز</div>
              <p className="mt-1 text-stone-600">
                {job.decision.recommendation} · شباهت {job.decision.similarityScore}٪ · ریسک{' '}
                {job.decision.cannibalizationRisk}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-stone-600">
                {(job.decision.reasons || []).slice(0, 3).map((reason: string) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            </section>
          )}

          {job.research && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-stone-900">تحقیق</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    اطمینان: {job.research.researchConfidence}
                    {job.research.qualityGate ? ` · کیفیت: ${job.research.qualityGate.status}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowResearchDetail((value) => !value)}
                    className="rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-bold text-stone-600"
                  >
                    {showResearchDetail ? 'بستن جزئیات' : 'مشاهده تحقیق'}
                  </button>
                  <button
                    type="button"
                    disabled={researchBusy || Boolean(busy)}
                    onClick={handleRefreshResearch}
                    className="rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-bold text-stone-600 disabled:opacity-50"
                  >
                    تازه‌سازی
                  </button>
                </div>
              </div>

              {job.research.webProviderStatus === 'not_configured' && (
                <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  WEB RESEARCH PROVIDER NOT CONFIGURED — جستجوی وب فعال نیست. از ایندکس وردپرس، کاتالوگ محصول و URL دستی استفاده می‌شود. Gemini جستجو نمی‌کند.
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { label: 'منابع', value: job.research.sources?.length || 0 },
                  { label: 'مدارک', value: job.research.evidence?.length || 0 },
                  {
                    label: 'تأییدشده',
                    value: (job.research.claims || []).filter((c: any) => c.status === 'SUPPORTED').length
                  },
                  {
                    label: 'نیاز به تأیید',
                    value: (job.research.claims || []).filter((c: any) => c.status === 'NEEDS_VERIFICATION').length
                  },
                  { label: 'تعارض', value: job.research.conflicts?.length || 0 }
                ].map((cell) => (
                  <div key={cell.label} className="rounded-xl border border-stone-100 bg-stone-50 px-2 py-2 text-center">
                    <div className="text-lg font-black text-stone-800">{cell.value}</div>
                    <div className="text-[10px] font-bold text-stone-500">{cell.label}</div>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-sm text-stone-700">{job.research.articleObjective}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={researchUrl}
                  onChange={(event) => setResearchUrl(event.target.value)}
                  placeholder="افزودن منبع: https://..."
                  className="min-w-[220px] flex-1 rounded-xl border border-stone-200 px-3 py-2 text-xs"
                  dir="ltr"
                />
                <button
                  type="button"
                  disabled={researchBusy || !researchUrl.trim()}
                  onClick={handleAddResearchSource}
                  className="rounded-xl bg-stone-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                >
                  افزودن منبع
                </button>
              </div>

              {job.research.unknownFacts?.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-bold">قابل تأیید نیست / UNKNOWN</div>
                  <ul className="mt-1 space-y-1">
                    {job.research.unknownFacts.slice(0, 5).map((fact: string) => (
                      <li key={fact}>• {fact}</li>
                    ))}
                  </ul>
                </div>
              )}

              {showResearchDetail && (
                <div className="mt-4 space-y-3 border-t border-stone-100 pt-3 text-xs">
                  <div>
                    <div className="font-black text-stone-800">منابع</div>
                    <ul className="mt-1 space-y-1 text-stone-600">
                      {(job.research.sources || []).slice(0, 12).map((source: any) => (
                        <li key={source.id}>
                          {source.label}
                          {source.url ? (
                            <>
                              {' '}
                              <a href={source.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
                                مشاهده
                              </a>
                            </>
                          ) : null}
                          {source.notes ? ` · ${source.notes}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-black text-stone-800">ادعاها</div>
                    <ul className="mt-1 space-y-2">
                      {(job.research.claims || []).slice(0, 12).map((claim: any) => (
                        <li key={claim.id} className="rounded-lg border border-stone-100 bg-stone-50 px-2 py-1.5">
                          <div className="font-bold text-stone-800">
                            [{claim.status}] {claim.text}
                          </div>
                          <div className="text-stone-500">{claim.reason}</div>
                        </li>
                      ))}
                      {(job.research.claims || []).length === 0 && (
                        <li className="text-stone-400">هنوز ادعای ساخت‌یافته‌ای ثبت نشده است.</li>
                      )}
                    </ul>
                  </div>
                  {(job.research.conflicts || []).length > 0 && (
                    <div>
                      <div className="font-black text-rose-800">تعارض‌ها</div>
                      <ul className="mt-1 space-y-1 text-rose-700">
                        {job.research.conflicts.map((conflict: any) => (
                          <li key={conflict.id}>
                            • {conflict.difference} ({conflict.resolutionStatus})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {!job.research && job && (
            <section className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-4">
              <h3 className="text-sm font-black text-stone-900">شروع تحقیق</h3>
              <p className="mt-1 text-xs text-stone-500">
                می‌توانید قبل از اجرا یک یا چند URL منبع اضافه کنید (اختیاری).
              </p>
              <textarea
                value={researchUrl}
                onChange={(event) => setResearchUrl(event.target.value)}
                placeholder="https://example.com/spec&#10;https://example.com/manual"
                className="mt-3 w-full rounded-xl border border-stone-200 px-3 py-2 text-xs"
                rows={3}
                dir="ltr"
              />
            </section>
          )}

          {job.brief && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="text-sm font-black text-stone-900">بریف محتوایی</h3>
              <p className="mt-1 text-sm font-bold text-emerald-800">{job.brief.workingTitle}</p>
              <p className="mt-2 text-xs text-stone-600">
                <span className="font-bold">چرا باید وجود داشته باشد:</span> {job.brief.whyThisArticleShouldExist}
              </p>
              <p className="mt-1 text-xs text-stone-600">
                <span className="font-bold">تفاوت با محتوای موجود:</span> {job.brief.howItDiffersFromExisting}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {job.brief.outline.map((section: any) => (
                  <div key={section.heading} className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                    <div className="font-bold text-stone-800">{section.heading}</div>
                    <div className="text-stone-500">{section.purpose}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {job.draft && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-stone-900">پیش‌نویس</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={Boolean(busy)}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] font-bold"
                  >
                    ذخیرهٔ ویرایش دستی
                  </button>
                </div>
              </div>
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm font-bold"
              />
              <textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                rows={16}
                className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm leading-7 font-mono"
              />

              <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                <div className="mb-2 text-xs font-black text-stone-700">ویرایش یک بخش (نه کل مقاله)</div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <select
                    value={sectionHeading}
                    onChange={(event) => setSectionHeading(event.target.value)}
                    className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
                  >
                    {(job.draft.sections || []).map((section: any) => (
                      <option key={section.heading} value={section.heading}>
                        {section.heading}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sectionAction}
                    onChange={(event) => setSectionAction(event.target.value as typeof sectionAction)}
                    className="rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
                  >
                    {SECTION_ACTIONS.map((action) => (
                      <option key={action.id} value={action.id}>
                        {action.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleSectionEdit}
                    disabled={Boolean(busy)}
                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    اعمال
                  </button>
                </div>
              </div>
            </section>
          )}

          {job.draft && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {reviewTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setReviewTab(tab.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                      reviewTab === tab.id
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'text-stone-500 hover:bg-stone-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {reviewTab === 'content' && job.validation && (
                <ReportBlock
                  title={`اعتبارسنجی · امتیاز ${job.validation.score} · ${job.validation.passed ? 'قبول' : 'رد'}`}
                  errors={job.validation.errors.map((item: any) => item.message)}
                  warnings={job.validation.warnings.map((item: any) => item.message)}
                  extras={job.validation.needsVerification}
                  extrasLabel="نیاز به تأیید"
                  recommendations={job.validation.recommendations}
                />
              )}

              {reviewTab === 'seo' && job.seoPreflight && (
                <div className="space-y-2">
                  <div className="text-sm font-black">
                    پیش‌پرواز سئو · امتیاز {job.seoPreflight.score}
                  </div>
                  {job.seoPreflight.checks.map((check: any) => (
                    <div key={check.id} className="flex gap-2 rounded-lg border border-stone-100 px-3 py-2 text-xs">
                      <StatusPill status={check.status} />
                      <div>
                        <div className="font-bold text-stone-800">{check.label}</div>
                        <div className="text-stone-500">{check.detail}</div>
                      </div>
                    </div>
                  ))}
                  {job.seoPreflight.recommendations.map((line: string) => (
                    <div key={line} className="text-xs text-cyan-800">→ {line}</div>
                  ))}
                </div>
              )}

              {reviewTab === 'facts' && job.factCheck && (
                <div className="space-y-2">
                  <div className="text-sm font-black">
                    بررسی صحت · ریسک {job.factCheck.riskLevel}
                    {job.factCheck.degraded ? ' · (حالت محدود بدون مدل)' : ''}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {Object.entries(job.factCheck.summary || {}).map(([key, value]) => (
                      <span key={key} className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5">
                        {key}: {String(value)}
                      </span>
                    ))}
                  </div>
                  {(job.factCheck.claims || []).slice(0, 12).map((claim: any) => (
                    <div key={claim.claim} className="rounded-lg border border-stone-100 px-3 py-2 text-xs">
                      <div className="font-bold text-stone-800">{claim.verdict}</div>
                      <div className="text-stone-700">{claim.claim}</div>
                      <div className="text-stone-400">{claim.reason}</div>
                      {claim.matchedEvidenceId && (
                        <div className="mt-1 text-[11px] text-emerald-700">
                          مدرک: {claim.matchedEvidenceId}
                          {claim.sourceType ? ` · ${claim.sourceType}` : ''}
                        </div>
                      )}
                      {!claim.matchedEvidenceId && claim.requiresAction && (
                        <div className="mt-1 text-[11px] font-bold text-amber-700">
                          نیاز به ویرایش / حذف ادعا / یافتن منبع
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {reviewTab === 'links' && (
                <div className="space-y-2">
                  {(job.internalLinks || job.brief?.internalLinks || []).map((link: any) => (
                    <div key={`${link.targetArticleId}-${link.anchorText}`} className="rounded-lg border border-stone-100 px-3 py-2 text-xs">
                      <div className="font-bold text-stone-800">
                        {link.anchorText} → {link.targetTitle}
                      </div>
                      <div className="text-stone-500">
                        {link.relationshipType} · {link.placement}
                      </div>
                      <div className="text-stone-400">{link.reason}</div>
                    </div>
                  ))}
                  {(job.internalLinks || []).length === 0 && (
                    <p className="text-xs text-stone-400">هنوز لینک داخلی پیشنهاد نشده است.</p>
                  )}
                </div>
              )}

              {reviewTab === 'visuals' && (
                <div className="space-y-3 text-sm">
                  {job.visualBrief ? (
                    <>
                      <p>
                        <span className="font-bold">موضوع تصویر:</span> {job.visualBrief.requiredSubject}
                      </p>
                      <p>
                        <span className="font-bold">هدف:</span> {job.visualBrief.imagePurpose}
                      </p>
                      <p className="text-xs text-stone-500">ممنوع: {job.visualBrief.prohibitedConcepts?.join(' · ')}</p>
                      <button
                        type="button"
                        onClick={handleVisual}
                        disabled={Boolean(busy)}
                        className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-black text-white disabled:opacity-50"
                      >
                        ساخت تصویر از روی بریف
                      </button>
                      {job.visualAssetIds?.length > 0 && (
                        <p className="text-xs text-emerald-700">
                          {job.visualAssetIds.length} تصویر به این کار متصل شده است.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-stone-400">بریف تصویری پس از ساخت بریف محتوایی آماده می‌شود.</p>
                  )}
                </div>
              )}

              {reviewTab === 'publishing' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => run('publishing-checklist')}
                    disabled={Boolean(busy)}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-bold"
                  >
                    تازه‌سازی چک‌لیست انتشار
                  </button>
                  {job.publishingChecklist && (
                    <>
                      <div className="text-sm font-black">
                        {job.publishingChecklist.canPublish ? 'آمادهٔ انتشار' : 'انتشار مسدود است'}
                      </div>
                      {job.publishingChecklist.items.map((item: any) => (
                        <div key={item.id} className="flex gap-2 rounded-lg border border-stone-100 px-3 py-2 text-xs">
                          <StatusPill status={item.status} />
                          <div>
                            <div className="font-bold">
                              {item.label}
                              {item.blocking ? ' (مسدودکننده)' : ''}
                            </div>
                            <div className="text-stone-500">{item.detail}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => run('publish', { operation: 'SAVE_LOCAL_DRAFT' })}
                      className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold"
                    >
                      ذخیرهٔ پیش‌نویس محلی
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busy) || job.stage !== 'approved'}
                      onClick={() =>
                        run('publish', {
                          operation:
                            job.mode === 'UPDATE' || job.mode === 'MERGE'
                              ? 'UPDATE_WORDPRESS_DRAFT'
                              : 'SAVE_WORDPRESS_DRAFT'
                        })
                      }
                      className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold disabled:opacity-50"
                    >
                      {job.mode === 'UPDATE' || job.mode === 'MERGE'
                        ? 'به‌روزرسانی پیش‌نویس وردپرس'
                        : 'پیش‌نویس وردپرس'}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busy) || job.stage !== 'approved'}
                      onClick={() =>
                        run('publish', {
                          operation:
                            job.mode === 'UPDATE' || job.mode === 'MERGE'
                              ? 'UPDATE_PUBLISHED_ARTICLE'
                              : 'PUBLISH'
                        })
                      }
                      className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      {job.mode === 'UPDATE' || job.mode === 'MERGE' ? 'انتشار به‌روزرسانی' : 'انتشار'}
                    </button>
                  </div>
                  {job.publishedUrl && (
                    <a href={job.publishedUrl} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 underline">
                      {job.publishedUrl}
                    </a>
                  )}
                </div>
              )}
            </section>
          )}

          {job.versions?.length > 0 && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-black text-stone-900">تاریخچهٔ نسخه‌ها</h3>
              <div className="space-y-2">
                {[...job.versions].reverse().map((version: any) => (
                  <div
                    key={version.version}
                    className="flex items-center justify-between rounded-lg border border-stone-100 px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-stone-800">
                        نسخه {version.version} · {version.action}
                      </div>
                      <div className="text-stone-400">
                        {new Date(version.timestamp).toLocaleString('fa-IR')} · {version.title}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(version.version)}
                      disabled={Boolean(busy)}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-600 disabled:opacity-50"
                    >
                      بازگردانی
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function StageButton({
  label,
  busy,
  stage,
  onClick
}: {
  label: string;
  busy: string | null;
  stage: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={onClick}
      className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:opacity-50"
    >
      {busy === stage ? '…' : label}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pass: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-amber-100 text-amber-800',
    fail: 'bg-rose-100 text-rose-800',
    unknown: 'bg-stone-100 text-stone-500'
  };
  return (
    <span className={`h-fit rounded-full px-2 py-0.5 text-[10px] font-black ${styles[status] || styles.unknown}`}>
      {status}
    </span>
  );
}

function ReportBlock({
  title,
  errors,
  warnings,
  extras = [],
  extrasLabel,
  recommendations = []
}: {
  title: string;
  errors: string[];
  warnings: string[];
  extras?: string[];
  extrasLabel?: string;
  recommendations?: string[];
}) {
  return (
    <div className="space-y-2 text-xs">
      <div className="text-sm font-black">{title}</div>
      {errors.map((line) => (
        <div key={line} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-rose-800">
          {line}
        </div>
      ))}
      {warnings.map((line) => (
        <div key={line} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-amber-800">
          {line}
        </div>
      ))}
      {extras.length > 0 && (
        <div className="rounded-lg border border-stone-100 px-3 py-2">
          <div className="font-bold text-stone-700">{extrasLabel}</div>
          {extras.slice(0, 8).map((line) => (
            <div key={line} className="text-stone-500">
              • {line}
            </div>
          ))}
        </div>
      )}
      {recommendations.map((line) => (
        <div key={line} className="text-cyan-800">
          → {line}
        </div>
      ))}
    </div>
  );
}
