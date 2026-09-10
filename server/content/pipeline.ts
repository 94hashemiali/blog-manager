import { db } from '../db.js';
import { getContentIndex } from '../intelligence/store.js';
import { inferIntent, inferPrimaryKeyword } from '../intelligence/text.js';
import { generateContentBrief, validateContentBrief } from './brief.js';
import { blocksDrafting, decideDifferentiation } from './differentiation.js';
import { generateArticleDraft } from './draft.js';
import { factCheckDraft } from './factcheck.js';
import { runSeoPreflight } from './seoPreflight.js';
import { generateResearchPacket } from './research.js';
import { buildPublishingChecklist } from './publishing.js';
import { validateArticleDraft } from './validation.js';
import { appendVersion } from './versions.js';
import { newJobId, saveJob } from './store.js';
import type {
  ContentProductionJob,
  ProductionStage,
  SearchIntent,
  StageFailure
} from './types.js';

/** Allowed forward moves. needs_revision can re-enter the pipeline anywhere. */
const TRANSITIONS: Record<ProductionStage, ProductionStage[]> = {
  idea: ['researched', 'needs_revision'],
  researched: ['brief_ready', 'needs_revision'],
  brief_ready: ['drafting', 'needs_revision'],
  drafting: ['draft_ready', 'needs_revision'],
  draft_ready: ['fact_checked', 'needs_revision'],
  fact_checked: ['seo_ready', 'needs_revision'],
  seo_ready: ['review', 'needs_revision'],
  review: ['approved', 'needs_revision'],
  approved: ['publishing', 'review', 'needs_revision'],
  publishing: ['published', 'needs_revision'],
  published: ['needs_revision'],
  needs_revision: ['researched', 'brief_ready', 'drafting', 'draft_ready', 'fact_checked', 'seo_ready', 'review']
};

export function canTransition(from: ProductionStage, to: ProductionStage): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] || []).includes(to);
}

function advance(job: ContentProductionJob, stage: ProductionStage, note?: string): ContentProductionJob {
  if (!canTransition(job.stage, stage)) {
    throw new Error(`انتقال از مرحلهٔ ${job.stage} به ${stage} مجاز نیست.`);
  }
  return {
    ...job,
    stage,
    stageHistory: [...job.stageHistory, { stage, at: new Date().toISOString(), note }]
  };
}

function recordFailure(job: ContentProductionJob, failure: StageFailure): ContentProductionJob {
  return { ...job, failures: [failure, ...job.failures].slice(0, 20) };
}

export function createProductionJob(params: {
  siteId: string;
  topic: string;
  primaryKeyword?: string;
  searchIntent?: SearchIntent;
  targetAudience?: string;
  opportunityId?: string;
}): ContentProductionJob {
  const site = db.getSiteById(params.siteId);
  if (!site) throw new Error('Site not found');

  const topic = params.topic.trim();
  if (!topic) throw new Error('موضوع مقاله الزامی است.');

  const now = new Date().toISOString();
  const job: ContentProductionJob = {
    id: newJobId(),
    siteId: params.siteId,
    stage: 'idea',
    mode: 'CREATE',
    topic,
    primaryKeyword: params.primaryKeyword?.trim() || inferPrimaryKeyword(topic),
    searchIntent: params.searchIntent || inferIntent(topic),
    opportunityId: params.opportunityId,
    targetAudience: params.targetAudience || site.seo?.targetAudience,
    internalLinks: [],
    visualAssetIds: [],
    versions: [],
    publishingHistory: [],
    stageHistory: [{ stage: 'idea', at: now }],
    failures: [],
    createdAt: now,
    updatedAt: now
  };

  // The differentiation decision is computed up front so the studio can warn
  // before any AI call is spent on a duplicate topic.
  const index = getContentIndex(params.siteId);
  job.decision = decideDifferentiation({
    siteId: params.siteId,
    topic: job.topic,
    primaryKeyword: job.primaryKeyword,
    searchIntent: job.searchIntent,
    articles: index.articles
  });

  return saveJob(job);
}

/**
 * Opens an UPDATE production job grounded in an existing indexed article and
 * optional performance update plan. Preserves WordPress identity.
 */
export function createUpdateProductionJob(params: {
  siteId: string;
  articleId: string | number;
  updateReason?: string;
  updatePlan?: ContentProductionJob['updatePlan'];
  performanceSignals?: string[];
  mode?: 'UPDATE' | 'MERGE';
}): ContentProductionJob {
  const site = db.getSiteById(params.siteId);
  if (!site) throw new Error('Site not found');
  const index = getContentIndex(params.siteId);
  const article = index.articles.find((row) => String(row.id) === String(params.articleId));
  if (!article || article.siteId !== params.siteId) {
    throw new Error('مقاله در ایندکس این سایت پیدا نشد.');
  }

  const now = new Date().toISOString();
  const job: ContentProductionJob = {
    id: newJobId(),
    siteId: params.siteId,
    stage: 'idea',
    mode: params.mode || 'UPDATE',
    topic: article.title,
    primaryKeyword: article.fingerprint.primaryKeyword || inferPrimaryKeyword(article.title),
    searchIntent: article.fingerprint.searchIntent || inferIntent(article.title),
    targetAudience: site.seo?.targetAudience,
    sourceArticleId: article.id,
    originalWordpressPostId: article.wpId,
    originalContentHash: article.fingerprint.contentHash,
    updateReason: params.updateReason || 'Performance / freshness recommendation',
    updatePlan: params.updatePlan,
    performanceSignals: params.performanceSignals || [],
    wordpressPostId: article.wpId,
    publishedUrl: article.url,
    internalLinks: [],
    visualAssetIds: [],
    versions: [
      {
        version: 1,
        timestamp: now,
        action: 'USER_EDITED',
        source: 'system',
        contentHash: article.fingerprint.contentHash,
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        userNotes: 'نسخهٔ پایه قبل از به‌روزرسانی (از ایندکس محتوا)'
      }
    ],
    publishingHistory: [],
    stageHistory: [{ stage: 'idea', at: now, note: 'update job created from existing article' }],
    failures: [],
    createdAt: now,
    updatedAt: now
  };

  job.decision = decideDifferentiation({
    siteId: params.siteId,
    topic: job.topic,
    primaryKeyword: job.primaryKeyword,
    searchIntent: job.searchIntent,
    articles: index.articles.filter((row) => String(row.id) !== String(article.id))
  });

  return saveJob(job);
}

export async function runResearchStage(
  job: ContentProductionJob,
  params: { userProvidedFacts?: string[] } = {}
): Promise<ContentProductionJob> {
  try {
    const research = await generateResearchPacket({
      siteId: job.siteId,
      topic: job.topic,
      primaryKeyword: job.primaryKeyword,
      searchIntent: job.searchIntent,
      targetAudience: job.targetAudience,
      userProvidedFacts: params.userProvidedFacts
    });
    const next = advance({ ...job, research, searchIntent: research.searchIntent }, 'researched');
    return saveJob(next);
  } catch (err: any) {
    saveJob(
      recordFailure(job, {
        stage: 'research',
        reason: err?.message || 'research failed',
        retryable: err?.retryable !== false,
        at: new Date().toISOString()
      })
    );
    throw err;
  }
}

export async function runBriefStage(job: ContentProductionJob): Promise<ContentProductionJob> {
  if (!job.research) throw new Error('پیش از ساخت بریف باید مرحلهٔ تحقیق اجرا شود.');
  try {
    const brief = await generateContentBrief({ research: job.research, decision: job.decision });
    const check = validateContentBrief(brief);
    if (!check.valid) {
      throw new Error(`بریف معتبر نیست: ${check.problems.join(' | ')}`);
    }
    const next = advance({ ...job, brief, internalLinks: brief.internalLinks, visualBrief: brief.visualRequirements }, 'brief_ready');
    return saveJob(next);
  } catch (err: any) {
    saveJob(
      recordFailure(job, {
        stage: 'brief',
        reason: err?.message || 'brief failed',
        retryable: err?.retryable !== false,
        at: new Date().toISOString()
      })
    );
    throw err;
  }
}

export async function runDraftStage(
  job: ContentProductionJob,
  params: { regenerationNote?: string } = {}
): Promise<ContentProductionJob> {
  if (!job.brief || !job.research) throw new Error('پیش از نگارش باید بریف آماده باشد.');
  if (job.decision && blocksDrafting(job.decision)) {
    throw new Error('موتور تمایز این موضوع را تکراری تشخیص داده است؛ ابتدا تصمیم را بازبینی کنید.');
  }

  const drafting = saveJob(advance(job, 'drafting'));
  try {
    const version = drafting.versions.reduce((max, row) => Math.max(max, row.version), 0) + 1;
    const draft = await generateArticleDraft({
      brief: drafting.brief!,
      research: drafting.research!,
      jobId: drafting.id,
      version,
      regenerationNote: params.regenerationNote,
      previousContent: drafting.draft?.content
    });

    const validation = validateArticleDraft({
      draft,
      brief: drafting.brief!,
      research: drafting.research,
      decision: drafting.decision
    });

    const next = advance({ ...drafting, draft, validation }, 'draft_ready');
    appendVersion(next, {
      action: 'AI_GENERATED',
      source: 'gemini',
      title: draft.title,
      content: draft.content,
      excerpt: draft.excerpt,
      metaDescription: draft.metaDescription,
      briefVersion: drafting.brief!.version,
      validation
    });
    return saveJob(next);
  } catch (err: any) {
    // Stage rolls back to brief_ready so the studio does not sit in "drafting".
    saveJob(
      recordFailure({ ...drafting, stage: 'brief_ready' }, {
        stage: 'draft',
        reason: err?.message || 'draft failed',
        retryable: err?.retryable !== false,
        at: new Date().toISOString()
      })
    );
    throw err;
  }
}

export async function runFactCheckStage(job: ContentProductionJob): Promise<ContentProductionJob> {
  if (!job.draft || !job.research) throw new Error('پیش از بررسی صحت باید پیش‌نویس آماده باشد.');
  const factCheck = await factCheckDraft({ draft: job.draft, research: job.research });
  return saveJob(advance({ ...job, factCheck }, 'fact_checked'));
}

export function runSeoStage(
  job: ContentProductionJob,
  params: { featuredImageUrl?: string; featuredImageAlt?: string } = {}
): ContentProductionJob {
  if (!job.draft || !job.brief) throw new Error('پیش از پیش‌پرواز سئو باید پیش‌نویس آماده باشد.');
  const seoPreflight = runSeoPreflight({
    draft: job.draft,
    brief: job.brief,
    decision: job.decision,
    featuredImageUrl: params.featuredImageUrl,
    featuredImageAlt: params.featuredImageAlt
  });
  return saveJob(advance({ ...job, seoPreflight }, 'seo_ready'));
}

export function moveToReview(job: ContentProductionJob): ContentProductionJob {
  const checklist = buildPublishingChecklist({ job });
  return saveJob(advance({ ...job, publishingChecklist: checklist }, 'review'));
}

export function approveJob(job: ContentProductionJob, userNotes?: string): ContentProductionJob {
  if (!job.draft) throw new Error('پیش‌نویسی برای تأیید وجود ندارد.');
  const checklist = buildPublishingChecklist({ job });
  if (!checklist.canPublish) {
    throw new Error(`تأیید ممکن نیست: ${checklist.blocking.map((item) => item.detail).join(' | ')}`);
  }
  const next = advance({ ...job, publishingChecklist: checklist }, 'approved');
  appendVersion(next, {
    action: 'APPROVED',
    source: 'user',
    title: job.draft.title,
    content: job.draft.content,
    excerpt: job.draft.excerpt,
    metaDescription: job.draft.metaDescription,
    briefVersion: job.brief?.version,
    validation: job.validation,
    userNotes
  });
  return saveJob(next);
}

export function markNeedsRevision(job: ContentProductionJob, reason: string): ContentProductionJob {
  return saveJob(advance({ ...job, stage: job.stage }, 'needs_revision', reason));
}

/** Stage progress for the studio's pipeline strip. */
export function describeProgress(job: ContentProductionJob): Array<{
  key: string;
  label: string;
  status: 'done' | 'warn' | 'current' | 'todo';
}> {
  const done = (stage: ProductionStage) => job.stageHistory.some((row) => row.stage === stage);
  const factWarn = Boolean(
    job.factCheck && (job.factCheck.summary.CONTRADICTED > 0 || job.factCheck.riskLevel !== 'low')
  );
  const seoWarn = Boolean(job.seoPreflight && !job.seoPreflight.passed);

  const rows: Array<{ key: string; label: string; status: 'done' | 'warn' | 'current' | 'todo' }> = [
    { key: 'research', label: 'تحقیق', status: job.research ? 'done' : job.stage === 'idea' ? 'current' : 'todo' },
    { key: 'brief', label: 'بریف', status: job.brief ? 'done' : done('researched') ? 'current' : 'todo' },
    { key: 'draft', label: 'پیش‌نویس', status: job.draft ? 'done' : done('brief_ready') ? 'current' : 'todo' },
    {
      key: 'fact_check',
      label: 'بررسی صحت',
      status: job.factCheck ? (factWarn ? 'warn' : 'done') : done('draft_ready') ? 'current' : 'todo'
    },
    {
      key: 'seo',
      label: 'سئو',
      status: job.seoPreflight ? (seoWarn ? 'warn' : 'done') : done('fact_checked') ? 'current' : 'todo'
    },
    { key: 'visual', label: 'تصویر', status: job.visualAssetIds.length > 0 ? 'done' : job.visualBrief ? 'current' : 'todo' },
    {
      key: 'review',
      label: 'بازبینی',
      status: done('approved') ? 'done' : job.stage === 'review' ? 'current' : 'todo'
    },
    {
      key: 'publish',
      label: 'انتشار',
      status: job.stage === 'published' ? 'done' : job.stage === 'approved' || job.stage === 'publishing' ? 'current' : 'todo'
    }
  ];
  return rows;
}
