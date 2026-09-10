import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db.js';
import { getContentIndex } from '../intelligence/store.js';
import { suggestInternalLinks } from './linking.js';
import { validateContentBrief } from './brief.js';
import { decideDifferentiation } from './differentiation.js';
import { validateArticleDraft } from './validation.js';
import { buildPublishingChecklist, runPublishOperation } from './publishing.js';
import { recommendNextArticles } from './recommendations.js';
import { editDraftSection, SECTION_EDIT_ACTIONS, type SectionEditAction } from './sectionEdit.js';
import { toVisualEngineRequest } from './visualBrief.js';
import { appendVersion, invalidateChecksAfterDraftChange, restoreVersion } from './versions.js';
import { parseMarkdownSections, contentHash } from './draft.js';
import {
  approveJob,
  createProductionJob,
  describeProgress,
  markNeedsRevision,
  moveToReview,
  runBriefStage,
  runDraftStage,
  runFactCheckStage,
  runResearchStage,
  runSeoStage
} from './pipeline.js';
import { deleteJob, getJob, listJobs, listPublishingHistory, saveJob } from './store.js';
import {
  assertJobNotCancelled,
  requestCancelJob,
  recoverStaleRunningJobs,
  resumeInterruptedJob
} from './jobOps.js';
import type { ContentProductionJob, PublishOperation, SearchIntent } from './types.js';

const PUBLISH_OPERATIONS: PublishOperation[] = [
  'SAVE_LOCAL_DRAFT',
  'SAVE_WORDPRESS_DRAFT',
  'UPDATE_WORDPRESS_DRAFT',
  'PUBLISH',
  'UPDATE_PUBLISHED_ARTICLE'
];

export const productionRouter = Router();

function fail(res: Response, status: number, message: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ success: false, error: message, message, ...extra });
}

/** Turns a thrown GeminiCallError or plain Error into the structured failure shape. */
function sendStageFailure(res: Response, stage: string, err: any) {
  return res.status(422).json({
    success: false,
    status: 'failed',
    stage: err?.stage || stage,
    errorCode: err?.errorCode || `${stage}_failed`,
    reason: err?.message || 'unknown error',
    error: err?.message || 'unknown error',
    message: err?.message || 'unknown error',
    retryable: err?.retryable !== false,
    partialData: err?.partialData ?? null
  });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

/** Resolves :siteId and :jobId, enforcing that the job belongs to that site. */
function resolveJob(req: Request, res: Response): ContentProductionJob | null {
  const { siteId, jobId } = req.params;
  if (!db.getSiteById(siteId)) {
    fail(res, 404, 'سایت یافت نشد.');
    return null;
  }
  const job = getJob(siteId, jobId);
  if (!job) {
    fail(res, 404, 'کار تولید محتوا یافت نشد.');
    return null;
  }
  return job;
}

/** Like resolveJob, but rejects cancelled / interrupted jobs before mutating stages. */
function resolveRunnableJob(req: Request, res: Response): ContentProductionJob | null {
  const job = resolveJob(req, res);
  if (!job) return null;
  try {
    assertJobNotCancelled(job);
  } catch (err: any) {
    fail(res, 409, err?.message || 'این کار لغو شده است.');
    return null;
  }
  if (job.status === 'INTERRUPTED' || job.status === 'RECOVERY_REQUIRED') {
    fail(res, 409, 'این کار قطع شده است؛ ابتدا Resume یا Recover را اجرا کنید.');
    return null;
  }
  return job;
}

function jobResponse(job: ContentProductionJob) {
  return { success: true, job, progress: describeProgress(job) };
}

// --- jobs ---------------------------------------------------------------

productionRouter.get('/:siteId/jobs', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'سایت یافت نشد.');
  const jobs = listJobs(req.params.siteId).map((job) => ({
    id: job.id,
    stage: job.stage,
    status: job.status,
    topic: job.topic,
    primaryKeyword: job.primaryKeyword,
    searchIntent: job.searchIntent,
    mode: job.mode,
    decision: job.decision?.recommendation,
    validationScore: job.validation?.score,
    factCheckRisk: job.factCheck?.riskLevel,
    seoScore: job.seoPreflight?.score,
    versionCount: job.versions.length,
    wordpressPostId: job.wordpressPostId,
    publishedUrl: job.publishedUrl,
    retryCount: job.retryCount,
    lastError: job.lastError,
    updatedAt: job.updatedAt
  }));
  res.json({ success: true, jobs });
});

productionRouter.post('/:siteId/jobs', (req, res) => {
  const topic = String(req.body?.topic || '').trim();
  if (!topic) return fail(res, 400, 'موضوع مقاله الزامی است.');
  try {
    const job = createProductionJob({
      siteId: req.params.siteId,
      topic,
      primaryKeyword: req.body?.primaryKeyword,
      searchIntent: req.body?.searchIntent as SearchIntent | undefined,
      targetAudience: req.body?.targetAudience,
      opportunityId: req.body?.opportunityId
    });
    res.status(201).json(jobResponse(job));
  } catch (err: any) {
    fail(res, 400, err?.message || 'ساخت کار تولید محتوا ناموفق بود.');
  }
});

productionRouter.get('/:siteId/jobs/:jobId', (req, res) => {
  const job = resolveJob(req, res);
  if (job) res.json(jobResponse(job));
});

productionRouter.post('/:siteId/jobs/:jobId/cancel', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  res.json(jobResponse(requestCancelJob(job)));
});

productionRouter.post('/:siteId/jobs/:jobId/resume', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  try {
    res.json(jobResponse(resumeInterruptedJob(job)));
  } catch (err: any) {
    fail(res, 409, err?.message || 'ازسرگیری ناموفق بود.');
  }
});

productionRouter.post('/:siteId/jobs/recover', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'سایت یافت نشد.');
  const recovered = recoverStaleRunningJobs(req.params.siteId);
  res.json({ success: true, recovered: recovered.length, jobs: recovered.map((job) => job.id) });
});

productionRouter.delete('/:siteId/jobs/:jobId', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  deleteJob(job.siteId, job.id);
  res.json({ success: true });
});

// --- pipeline stages ----------------------------------------------------

productionRouter.post(
  '/:siteId/jobs/:jobId/research',
  asyncRoute(async (req, res) => {
    const job = resolveRunnableJob(req, res);
    if (!job) return;
    try {
      const next = await runResearchStage(job, {
        userProvidedFacts: Array.isArray(req.body?.userProvidedFacts) ? req.body.userProvidedFacts.map(String) : [],
        urls: Array.isArray(req.body?.urls) ? req.body.urls.map(String) : undefined,
        forceRefreshUrls: Boolean(req.body?.forceRefreshUrls)
      });
      res.json(jobResponse(next));
    } catch (err) {
      sendStageFailure(res, 'research', err);
    }
  })
);

productionRouter.post(
  '/:siteId/jobs/:jobId/brief',
  asyncRoute(async (req, res) => {
    const job = resolveRunnableJob(req, res);
    if (!job) return;
    try {
      const next = await runBriefStage(job);
      res.json({ ...jobResponse(next), briefValidation: validateContentBrief(next.brief) });
    } catch (err) {
      sendStageFailure(res, 'brief', err);
    }
  })
);

productionRouter.post(
  '/:siteId/jobs/:jobId/draft',
  asyncRoute(async (req, res) => {
    const job = resolveRunnableJob(req, res);
    if (!job) return;
    try {
      const next = await runDraftStage(job, { regenerationNote: req.body?.regenerationNote });
      res.json(jobResponse(next));
    } catch (err) {
      sendStageFailure(res, 'draft', err);
    }
  })
);

productionRouter.post('/:siteId/jobs/:jobId/validate', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  if (!job.draft || !job.brief) return fail(res, 409, 'پیش‌نویس یا بریف موجود نیست.');
  const validation = validateArticleDraft({
    draft: job.draft,
    brief: job.brief,
    research: job.research,
    decision: job.decision
  });
  res.json(jobResponse(saveJob({ ...job, validation })));
});

productionRouter.post(
  '/:siteId/jobs/:jobId/fact-check',
  asyncRoute(async (req, res) => {
    const job = resolveRunnableJob(req, res);
    if (!job) return;
    if (!job.draft || !job.research) return fail(res, 409, 'برای بررسی صحت، پیش‌نویس و بستهٔ تحقیق لازم است.');
    try {
      const next = await runFactCheckStage(job);
      res.json(jobResponse(next));
    } catch (err) {
      sendStageFailure(res, 'fact_check', err);
    }
  })
);

productionRouter.post('/:siteId/jobs/:jobId/seo-preflight', (req, res) => {
  const job = resolveRunnableJob(req, res);
  if (!job) return;
  if (!job.draft || !job.brief) return fail(res, 409, 'پیش‌نویس یا بریف موجود نیست.');
  try {
    const next = runSeoStage(job, {
      featuredImageUrl: req.body?.featuredImageUrl,
      featuredImageAlt: req.body?.featuredImageAlt
    });
    res.json(jobResponse(next));
  } catch (err: any) {
    fail(res, 409, err?.message || 'اجرای پیش‌پرواز سئو ناموفق بود.');
  }
});

productionRouter.post('/:siteId/jobs/:jobId/internal-links', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  const index = getContentIndex(job.siteId);
  const internalLinks = suggestInternalLinks({
    topic: job.topic,
    primaryKeyword: job.primaryKeyword,
    articles: index.articles,
    clusters: index.clusters,
    products: index.products,
    max: req.body?.max ? Number(req.body.max) : undefined
  });
  res.json(jobResponse(saveJob({ ...job, internalLinks })));
});

productionRouter.get('/:siteId/jobs/:jobId/visual-request', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  if (!job.brief || !job.visualBrief) return fail(res, 409, 'بریف تصویری هنوز ساخته نشده است.');
  res.json({
    success: true,
    visualBrief: job.visualBrief,
    // Payload the client posts to the existing /api/ai/visual-assets endpoint.
    visualEngineRequest: toVisualEngineRequest({
      brief: job.brief,
      visualBrief: job.visualBrief,
      draft: job.draft,
      siteId: job.siteId
    })
  });
});

productionRouter.post('/:siteId/jobs/:jobId/attach-visual', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  const assetId = String(req.body?.assetId || '').trim();
  if (!assetId) return fail(res, 400, 'شناسهٔ تصویر الزامی است.');
  const visualAssetIds = [...new Set([...job.visualAssetIds, assetId])];
  res.json(jobResponse(saveJob({ ...job, visualAssetIds })));
});

// --- editing ------------------------------------------------------------

productionRouter.post(
  '/:siteId/jobs/:jobId/section-edit',
  asyncRoute(async (req, res) => {
    const job = resolveJob(req, res);
    if (!job) return;
    if (!job.draft || !job.brief) return fail(res, 409, 'پیش‌نویس یا بریف موجود نیست.');

    const action = String(req.body?.action || '');
    if (!SECTION_EDIT_ACTIONS.includes(action as SectionEditAction)) {
      return fail(res, 400, `عملیات نامعتبر است. مقادیر مجاز: ${SECTION_EDIT_ACTIONS.join(', ')}`);
    }
    const sectionHeading = String(req.body?.sectionHeading || '').trim();
    if (!sectionHeading) return fail(res, 400, 'عنوان بخش الزامی است.');

    try {
      const edited = await editDraftSection({
        draft: job.draft,
        brief: job.brief,
        research: job.research,
        sectionHeading,
        action: action as SectionEditAction,
        userInstruction: req.body?.userInstruction
      });

      const validation = validateArticleDraft({
        draft: edited.draft,
        brief: job.brief,
        research: job.research,
        decision: job.decision
      });

      const next: ContentProductionJob = { ...job, draft: edited.draft, validation };
      invalidateChecksAfterDraftChange(next);
      appendVersion(next, {
        action: 'SECTION_REGENERATED',
        source: 'gemini',
        title: edited.draft.title,
        content: edited.draft.content,
        excerpt: edited.draft.excerpt,
        metaDescription: edited.draft.metaDescription,
        briefVersion: job.brief.version,
        validation,
        userNotes: `بازنویسی بخش «${sectionHeading}» با عملیات ${action}`
      });
      res.json({ ...jobResponse(saveJob(next)), previousContent: edited.previousContent });
    } catch (err) {
      sendStageFailure(res, 'section_edit', err);
    }
  })
);

productionRouter.put('/:siteId/jobs/:jobId/draft', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  if (!job.draft || !job.brief) return fail(res, 409, 'پیش‌نویس یا بریف موجود نیست.');

  const content = typeof req.body?.content === 'string' ? req.body.content : job.draft.content;
  const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : job.draft.title;
  const draft = {
    ...job.draft,
    title,
    content,
    metaDescription:
      typeof req.body?.metaDescription === 'string' ? req.body.metaDescription : job.draft.metaDescription,
    excerpt: typeof req.body?.excerpt === 'string' ? req.body.excerpt : job.draft.excerpt,
    slug: typeof req.body?.slug === 'string' && req.body.slug.trim() ? req.body.slug.trim() : job.draft.slug,
    sections: parseMarkdownSections(content),
    contentHash: contentHash(content),
    source: 'user_edited' as const
  };

  const validation = validateArticleDraft({ draft, brief: job.brief, research: job.research, decision: job.decision });
  const next: ContentProductionJob = { ...job, draft, validation };
  invalidateChecksAfterDraftChange(next);
  appendVersion(next, {
    action: 'USER_EDITED',
    source: 'user',
    title: draft.title,
    content: draft.content,
    excerpt: draft.excerpt,
    metaDescription: draft.metaDescription,
    briefVersion: job.brief.version,
    validation,
    userNotes: req.body?.userNotes
  });
  res.json(jobResponse(saveJob(next)));
});

// --- review / approval --------------------------------------------------

productionRouter.post('/:siteId/jobs/:jobId/review', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  try {
    res.json(jobResponse(moveToReview(job)));
  } catch (err: any) {
    fail(res, 409, err?.message || 'انتقال به بازبینی ناموفق بود.');
  }
});

productionRouter.post('/:siteId/jobs/:jobId/approve', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  try {
    res.json(jobResponse(approveJob(job, req.body?.userNotes)));
  } catch (err: any) {
    fail(res, 409, err?.message || 'تأیید مقاله ناموفق بود.');
  }
});

productionRouter.post('/:siteId/jobs/:jobId/needs-revision', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  const reason = String(req.body?.reason || 'بازبینی دستی');
  try {
    res.json(jobResponse(markNeedsRevision(job, reason)));
  } catch (err: any) {
    fail(res, 409, err?.message || 'تغییر وضعیت ناموفق بود.');
  }
});

// --- versions -----------------------------------------------------------

productionRouter.get('/:siteId/jobs/:jobId/versions', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  res.json({
    success: true,
    versions: job.versions.map((version) => ({
      version: version.version,
      timestamp: version.timestamp,
      action: version.action,
      source: version.source,
      contentHash: version.contentHash,
      title: version.title,
      briefVersion: version.briefVersion,
      validationScore: version.validation?.score,
      userNotes: version.userNotes
    }))
  });
});

productionRouter.get('/:siteId/jobs/:jobId/versions/:version', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  const version = job.versions.find((row) => row.version === Number(req.params.version));
  if (!version) return fail(res, 404, 'نسخهٔ درخواستی یافت نشد.');
  res.json({ success: true, version });
});

productionRouter.post('/:siteId/jobs/:jobId/versions/:version/restore', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  const restored = restoreVersion({ ...job }, Number(req.params.version), req.body?.userNotes);
  if (!restored) return fail(res, 404, 'نسخهٔ درخواستی قابل بازگردانی نیست.');
  res.json({ ...jobResponse(saveJob(restored.job)), restoredVersion: restored.restored.version });
});

// --- publishing ---------------------------------------------------------

productionRouter.post('/:siteId/jobs/:jobId/publishing-checklist', (req, res) => {
  const job = resolveJob(req, res);
  if (!job) return;
  const checklist = buildPublishingChecklist({
    job,
    categories: Array.isArray(req.body?.categories) ? req.body.categories.map(String) : [],
    featuredImageUrl: req.body?.featuredImageUrl,
    featuredImageAlt: req.body?.featuredImageAlt
  });
  res.json({ ...jobResponse(saveJob({ ...job, publishingChecklist: checklist })), checklist });
});

productionRouter.post(
  '/:siteId/jobs/:jobId/publish',
  asyncRoute(async (req, res) => {
    const job = resolveRunnableJob(req, res);
    if (!job) return;

    const operation = String(req.body?.operation || 'SAVE_LOCAL_DRAFT') as PublishOperation;
    if (!PUBLISH_OPERATIONS.includes(operation)) {
      return fail(res, 400, `عملیات نامعتبر است. مقادیر مجاز: ${PUBLISH_OPERATIONS.join(', ')}`);
    }

    const checklist = buildPublishingChecklist({
      job,
      categories: Array.isArray(req.body?.categories) ? req.body.categories.map(String) : [],
      featuredImageUrl: req.body?.featuredImageUrl,
      featuredImageAlt: req.body?.featuredImageAlt
    });

    // Local drafts are always allowed; anything that reaches WordPress must
    // pass the blocking checklist items.
    if (operation !== 'SAVE_LOCAL_DRAFT' && !checklist.canPublish) {
      return res.status(409).json({
        success: false,
        error: 'انتشار مسدود است؛ ابتدا خطاهای مسدودکننده را برطرف کنید.',
        message: 'انتشار مسدود است؛ ابتدا خطاهای مسدودکننده را برطرف کنید.',
        checklist
      });
    }

    const { result, job: nextJob } = await runPublishOperation({
      job: { ...job, publishingChecklist: checklist },
      operation,
      categories: Array.isArray(req.body?.wordpressCategoryIds)
        ? req.body.wordpressCategoryIds.map(Number).filter(Number.isFinite)
        : undefined,
      featuredMediaId: Number.isFinite(Number(req.body?.featuredMediaId))
        ? Number(req.body.featuredMediaId)
        : undefined
    });

    const saved = saveJob(nextJob);
    if (result.status === 'failed') {
      return res.status(502).json({ success: false, result, ...jobResponse(saved), checklist });
    }
    res.json({ success: true, result, ...jobResponse(saved), checklist });
  })
);

productionRouter.get('/:siteId/publishing-history', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'سایت یافت نشد.');
  res.json({ success: true, history: listPublishingHistory(req.params.siteId) });
});

// --- what should I write next ------------------------------------------

productionRouter.get('/:siteId/next-articles', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'سایت یافت نشد.');
  const result = recommendNextArticles({
    siteId: req.params.siteId,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    currentMonth: new Date().getMonth()
  });
  res.json({ success: true, ...result });
});

productionRouter.post('/:siteId/differentiation', (req, res) => {
  if (!db.getSiteById(req.params.siteId)) return fail(res, 404, 'سایت یافت نشد.');
  const topic = String(req.body?.topic || '').trim();
  if (!topic) return fail(res, 400, 'موضوع الزامی است.');
  const index = getContentIndex(req.params.siteId);
  res.json({
    success: true,
    decision: decideDifferentiation({
      siteId: req.params.siteId,
      topic,
      primaryKeyword: req.body?.primaryKeyword,
      searchIntent: req.body?.searchIntent,
      articles: index.articles
    })
  });
});
