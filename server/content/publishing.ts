import crypto from 'crypto';
import { db } from '../db.js';
import { appendPublishingHistory } from './store.js';
import type {
  ChecklistItem,
  ContentProductionJob,
  PublishOperation,
  PublishingChecklist,
  PublishingHistoryEntry,
  PublishingResult
} from './types.js';

function item(
  id: string,
  label: string,
  status: ChecklistItem['status'],
  detail: string,
  blocking: boolean
): ChecklistItem {
  return { id, label, status, detail, blocking };
}

/**
 * Publishing gate. Blocking items are hard errors the user cannot override;
 * warnings can be overridden deliberately.
 */
export function buildPublishingChecklist(params: {
  job: ContentProductionJob;
  categories?: string[];
  featuredImageUrl?: string;
  featuredImageAlt?: string;
}): PublishingChecklist {
  const { job } = params;
  const draft = job.draft;
  const items: ChecklistItem[] = [];

  if (!draft) {
    items.push(item('draft', 'پیش‌نویس مقاله', 'fail', 'هیچ پیش‌نویسی برای انتشار وجود ندارد.', true));
  } else {
    items.push(
      item('title', 'عنوان', draft.title.trim() ? 'pass' : 'fail', draft.title.trim() || 'عنوان خالی است.', true)
    );
    items.push(
      item('slug', 'نامک', draft.slug.trim() ? 'pass' : 'fail', draft.slug.trim() || 'نامک خالی است.', true)
    );
    items.push(
      item(
        'excerpt',
        'چکیده',
        draft.excerpt.trim() ? 'pass' : 'warn',
        draft.excerpt.trim() ? 'چکیده نوشته شده است.' : 'چکیده خالی است؛ وردپرس خودش از ابتدای متن می‌سازد.',
        false
      )
    );
    items.push(
      item(
        'meta_description',
        'توضیحات متا',
        draft.metaDescription.trim() ? 'pass' : 'warn',
        draft.metaDescription.trim() ? 'توضیحات متا آماده است.' : 'توضیحات متا خالی است.',
        false
      )
    );
    items.push(
      item(
        'content',
        'متن مقاله',
        draft.content.trim().length > 400 ? 'pass' : 'fail',
        `${draft.content.split(/\s+/).filter(Boolean).length} کلمه`,
        true
      )
    );
    items.push(
      item(
        'tags',
        'برچسب‌ها',
        draft.tags.length > 0 ? 'pass' : 'warn',
        draft.tags.length > 0 ? draft.tags.join('، ') : 'برچسبی تعیین نشده است.',
        false
      )
    );
    items.push(
      item(
        'internal_links',
        'لینک‌های داخلی',
        job.internalLinks.length > 0 ? 'pass' : 'warn',
        `${job.internalLinks.length} لینک داخلی پیشنهاد شده است.`,
        false
      )
    );
  }

  items.push(
    item(
      'categories',
      'دسته‌بندی',
      (params.categories || []).length > 0 ? 'pass' : 'warn',
      (params.categories || []).join('، ') || 'دسته‌بندی انتخاب نشده است.',
      false
    )
  );
  items.push(
    item(
      'featured_image',
      'تصویر شاخص',
      params.featuredImageUrl ? 'pass' : 'warn',
      params.featuredImageUrl ? 'تصویر شاخص انتخاب شده است.' : 'تصویر شاخص انتخاب نشده است.',
      false
    )
  );
  items.push(
    item(
      'image_alt',
      'متن جایگزین تصویر',
      params.featuredImageAlt ? 'pass' : params.featuredImageUrl ? 'warn' : 'unknown',
      params.featuredImageAlt || 'متن جایگزین تعیین نشده است.',
      false
    )
  );

  // Validation
  if (!job.validation) {
    items.push(item('validation', 'اعتبارسنجی مقاله', 'unknown', 'اعتبارسنجی اجرا نشده است.', true));
  } else {
    items.push(
      item(
        'validation',
        'اعتبارسنجی مقاله',
        job.validation.passed ? 'pass' : 'fail',
        job.validation.passed
          ? `امتیاز ${job.validation.score} بدون خطای مسدودکننده.`
          : `${job.validation.errors.length} خطا: ${job.validation.errors.map((error) => error.message).join(' | ')}`,
        true
      )
    );
  }

  // Fact check
  if (!job.factCheck) {
    items.push(item('fact_check', 'بررسی صحت ادعاها', 'unknown', 'بررسی صحت اجرا نشده است.', true));
  } else {
    const contradicted = job.factCheck.summary.CONTRADICTED;
    const needsWork = job.factCheck.summary.UNSUPPORTED + job.factCheck.summary.NEEDS_VERIFICATION;
    items.push(
      item(
        'fact_check',
        'بررسی صحت ادعاها',
        contradicted > 0 ? 'fail' : needsWork > 0 ? 'warn' : 'pass',
        contradicted > 0
          ? `${contradicted} ادعا با فکت‌های تأییدشده در تناقض است.`
          : needsWork > 0
            ? `${needsWork} ادعا منبع تأییدشده ندارد.`
            : 'همهٔ ادعاها پشتیبانی شده‌اند.',
        contradicted > 0
      )
    );
  }

  // SEO preflight
  if (!job.seoPreflight) {
    items.push(item('seo', 'پیش‌پرواز سئو', 'unknown', 'پیش‌پرواز سئو اجرا نشده است.', false));
  } else {
    const failed = job.seoPreflight.checks.filter((check) => check.status === 'fail');
    items.push(
      item(
        'seo',
        'پیش‌پرواز سئو',
        failed.length === 0 ? 'pass' : 'warn',
        failed.length === 0
          ? `امتیاز سئو ${job.seoPreflight.score}.`
          : `${failed.length} بررسی ناموفق: ${failed.map((check) => check.label).join('، ')}`,
        false
      )
    );
  }

  // Duplicate risk
  if (!job.decision) {
    items.push(item('duplicate_risk', 'ریسک تکرار محتوا', 'unknown', 'بررسی تمایز اجرا نشده است.', true));
  } else {
    items.push(
      item(
        'duplicate_risk',
        'ریسک تکرار محتوا',
        job.decision.recommendation === 'REJECT_DUPLICATE'
          ? 'fail'
          : job.decision.recommendation === 'CREATE_NEW'
            ? 'pass'
            : 'warn',
        `${job.decision.recommendation} — شباهت ${job.decision.similarityScore}٪`,
        job.decision.recommendation === 'REJECT_DUPLICATE'
      )
    );
  }

  items.push(
    item(
      'stage',
      'وضعیت چرخهٔ تولید',
      job.stage === 'approved' || job.stage === 'published' || job.stage === 'publishing' ? 'pass' : 'warn',
      `مرحلهٔ فعلی: ${job.stage}`,
      false
    )
  );

  const blocking = items.filter((row) => row.blocking && (row.status === 'fail' || row.status === 'unknown'));
  const warnings = items.filter((row) => !row.blocking && row.status === 'warn');

  return {
    id: `chk-${crypto.createHash('sha1').update(`${job.id}:${job.draft?.contentHash || 'none'}`).digest('hex').slice(0, 10)}`,
    siteId: job.siteId,
    checkedAt: new Date().toISOString(),
    canPublish: blocking.length === 0,
    items,
    blocking,
    warnings
  };
}

function wpStatusFor(operation: PublishOperation): 'draft' | 'publish' {
  return operation === 'PUBLISH' || operation === 'UPDATE_PUBLISHED_ARTICLE' ? 'publish' : 'draft';
}

/**
 * UPDATE/MERGE jobs must hit the existing WordPress post — never create a duplicate
 * when the studio still sends CREATE-style PUBLISH / SAVE_WORDPRESS_DRAFT.
 */
export function resolvePublishOperation(
  job: ContentProductionJob,
  operation: PublishOperation
): PublishOperation {
  const postId = job.wordpressPostId || job.originalWordpressPostId;
  const isUpdateJob = (job.mode === 'UPDATE' || job.mode === 'MERGE') && Boolean(postId);
  if (!isUpdateJob) return operation;
  if (operation === 'PUBLISH') return 'UPDATE_PUBLISHED_ARTICLE';
  if (operation === 'SAVE_WORDPRESS_DRAFT') return 'UPDATE_WORDPRESS_DRAFT';
  return operation;
}

/**
 * Runs one publishing operation. Local state is only advanced after WordPress
 * confirms the write, so a failed publish never leaves the job marked
 * published.
 */
export async function runPublishOperation(params: {
  job: ContentProductionJob;
  operation: PublishOperation;
  categories?: number[];
  featuredMediaId?: number;
}): Promise<{ result: PublishingResult; job: ContentProductionJob }> {
  const operation = resolvePublishOperation(params.job, params.operation);
  const job = {
    ...params.job,
    wordpressPostId: params.job.wordpressPostId || params.job.originalWordpressPostId
  };
  const timestamp = new Date().toISOString();
  const previousStatus = job.stage;

  if (!job.draft) {
    const result: PublishingResult = {
      operation,
      status: 'failed',
      siteId: job.siteId,
      articleId: job.id,
      timestamp,
      previousStatus,
      error: 'هیچ پیش‌نویسی برای انتشار وجود ندارد.'
    };
    return { result, job: recordFailure(job, result) };
  }

  if (operation === 'SAVE_LOCAL_DRAFT') {
    const localId = job.localArticleId || `prod-${job.id}`;
    const articles = db.getArticles();
    const record = {
      id: localId,
      site_id: job.siteId,
      date: timestamp,
      slug: job.draft.slug,
      status: 'local_draft',
      title: { rendered: job.draft.title },
      content: { rendered: job.draft.content },
      excerpt: { rendered: job.draft.excerpt },
      meta_description: job.draft.metaDescription,
      tag_names: job.draft.tags,
      faq: job.draft.faq,
      production_job_id: job.id,
      is_local: true,
      local_updated_at: timestamp
    };
    const index = articles.findIndex((row: any) => String(row.id) === String(localId));
    if (index >= 0) articles[index] = record;
    else articles.unshift(record);
    db.saveArticles(articles);

    const result: PublishingResult = {
      operation,
      status: 'success',
      siteId: job.siteId,
      articleId: job.id,
      timestamp,
      previousStatus,
      resultingStatus: 'local_draft'
    };
    return { result, job: recordSuccess({ ...job, localArticleId: localId }, result) };
  }

  const site = db.getSiteById(job.siteId);
  const baseUrl = site?.wordpress?.baseUrl || site?.url;
  const username = site?.wordpress?.username;
  const appPassword = site?.wordpress?.applicationPassword;

  if (!baseUrl || !username || !appPassword) {
    const result: PublishingResult = {
      operation,
      status: 'failed',
      siteId: job.siteId,
      articleId: job.id,
      timestamp,
      previousStatus,
      error: 'اعتبارنامهٔ وردپرس (نام کاربری و Application Password) برای این سایت ثبت نشده است.'
    };
    return { result, job: recordFailure(job, result) };
  }

  const isUpdate =
    operation === 'UPDATE_WORDPRESS_DRAFT' || operation === 'UPDATE_PUBLISHED_ARTICLE';
  if (isUpdate && !job.wordpressPostId) {
    const result: PublishingResult = {
      operation,
      status: 'failed',
      siteId: job.siteId,
      articleId: job.id,
      timestamp,
      previousStatus,
      error: 'شناسهٔ پست وردپرس برای به‌روزرسانی موجود نیست.'
    };
    return { result, job: recordFailure(job, result) };
  }

  const endpoint = isUpdate
    ? `${baseUrl}/wp-json/wp/v2/posts/${job.wordpressPostId}`
    : `${baseUrl}/wp-json/wp/v2/posts`;

  const payload: Record<string, unknown> = {
    title: job.draft.title,
    content: job.draft.content,
    excerpt: job.draft.excerpt,
    slug: job.draft.slug,
    status: wpStatusFor(operation)
  };
  if (params.categories?.length) payload.categories = params.categories;
  if (params.featuredMediaId) payload.featured_media = params.featuredMediaId;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      const detail = await response.text();
      const result: PublishingResult = {
        operation,
        status: 'failed',
        siteId: job.siteId,
        articleId: job.id,
        timestamp,
        previousStatus,
        error: `وردپرس پاسخ ${response.status} داد: ${detail.slice(0, 300)}`
      };
      return { result, job: recordFailure(job, result) };
    }

    const created: any = await response.json();
    const result: PublishingResult = {
      operation,
      status: 'success',
      siteId: job.siteId,
      articleId: job.id,
      wordpressPostId: created.id,
      url: created.link,
      timestamp,
      previousStatus,
      resultingStatus: created.status
    };

    const nextJob: ContentProductionJob = {
      ...job,
      wordpressPostId: created.id,
      publishedUrl: created.link,
      stage: created.status === 'publish' ? 'published' : job.stage
    };
    return { result, job: recordSuccess(nextJob, result) };
  } catch (err: any) {
    const result: PublishingResult = {
      operation,
      status: 'failed',
      siteId: job.siteId,
      articleId: job.id,
      timestamp,
      previousStatus,
      error: err?.message || 'ارتباط با وردپرس برقرار نشد.'
    };
    return { result, job: recordFailure(job, result) };
  }
}

function toHistory(result: PublishingResult): PublishingHistoryEntry {
  return {
    id: `ph-${crypto.randomBytes(6).toString('hex')}`,
    articleId: result.articleId,
    siteId: result.siteId,
    wordpressPostId: result.wordpressPostId,
    operation: result.operation,
    status: result.status,
    timestamp: result.timestamp,
    previousStatus: result.previousStatus,
    resultingUrl: result.url,
    error: result.error
  };
}

function recordSuccess(job: ContentProductionJob, result: PublishingResult): ContentProductionJob {
  const entry = appendPublishingHistory(toHistory(result));
  return { ...job, publishingHistory: [entry, ...job.publishingHistory].slice(0, 50) };
}

function recordFailure(job: ContentProductionJob, result: PublishingResult): ContentProductionJob {
  const entry = appendPublishingHistory(toHistory(result));
  return {
    ...job,
    // Stage is deliberately left untouched on failure.
    publishingHistory: [entry, ...job.publishingHistory].slice(0, 50),
    failures: [
      { stage: `publishing:${result.operation}`, reason: result.error || 'unknown', retryable: true, at: result.timestamp },
      ...job.failures
    ].slice(0, 20)
  };
}
