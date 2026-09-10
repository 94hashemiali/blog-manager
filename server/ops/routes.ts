import { Router } from 'express';
import { db } from '../db.js';
import { listJobs } from '../content/store.js';
import { loadPerformanceStore } from '../performance/store.js';
import { listResearchSessions } from '../research/store.js';
import { buildHealthPayload } from '../providers/status.js';

export const opsRouter = Router();

opsRouter.get('/:siteId/overview', (req, res) => {
  const siteId = req.params.siteId;
  if (!db.getSiteById(siteId)) {
    return res.status(404).json({
      success: false,
      error: { code: 'site_not_found', message: 'سایت یافت نشد.', retryable: false },
      message: 'سایت یافت نشد.'
    });
  }

  // Read-only: recovery is POST /api/production/:siteId/jobs/recover
  const jobs = listJobs(siteId);
  const perf = loadPerformanceStore(siteId);
  const sessions = listResearchSessions(siteId);
  const health = buildHealthPayload(siteId);

  const failedJobs = jobs.filter((job) => job.status === 'FAILED' || job.status === 'INTERRUPTED');
  const reviewJobs = jobs.filter((job) => job.stage === 'review' || job.stage === 'needs_revision');
  const conflictSessions = sessions.filter((session) => (session.conflicts || []).length > 0);
  const staleSessions = sessions.filter((session) => session.status === 'STALE' || session.status === 'INVALIDATED');
  const updateOpps = perf.opportunities.filter((row) => row.type === 'UPDATE_ARTICLE').length;

  const attention: Array<{ id: string; severity: 'high' | 'medium' | 'low'; text: string }> = [];
  if (reviewJobs.length) {
    attention.push({
      id: 'jobs-review',
      severity: 'high',
      text: `${reviewJobs.length} کار تولید نیاز به بازبینی دارد`
    });
  }
  if (failedJobs.length) {
    attention.push({
      id: 'jobs-failed',
      severity: 'high',
      text: `${failedJobs.length} کار تولید ناموفق/قطع‌شده`
    });
  }
  if (staleSessions.length) {
    attention.push({
      id: 'research-stale',
      severity: 'high',
      text: `${staleSessions.length} جلسهٔ تحقیق کهنه یا نامعتبر`
    });
  }
  if (conflictSessions.length) {
    attention.push({
      id: 'research-conflicts',
      severity: 'medium',
      text: `${conflictSessions.length} جلسهٔ تحقیق دارای تعارض`
    });
  }
  if (updateOpps > 0) {
    attention.push({
      id: 'perf-updates',
      severity: 'medium',
      text: `${updateOpps} پیشنهاد به‌روزرسانی محتوا`
    });
  }
  const gsc = health.providers.search_console;
  if (gsc && (gsc as any).status === 'not_configured') {
    attention.push({
      id: 'gsc',
      severity: 'low',
      text: 'Search Console متصل نیست'
    });
  }
  if (perf.records.length === 0) {
    attention.push({
      id: 'perf-sync',
      severity: 'low',
      text: 'عملکرد هنوز همگام نشده — Sync لازم است'
    });
  }

  res.json({
    success: true,
    overview: {
      siteId,
      assessedAt: new Date().toISOString(),
      attention,
      counts: {
        productionJobs: jobs.length,
        needsReview: reviewJobs.length,
        failedJobs: failedJobs.length,
        researchSessions: sessions.length,
        researchConflicts: conflictSessions.length,
        performanceOpportunities: perf.opportunities.length,
        performanceNeedsSync: perf.records.length === 0
      },
      providers: health.providers,
      lastPerformanceSync: perf.lastSyncedAt
    }
  });
});
