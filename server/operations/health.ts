import { loadPerformanceStore } from '../performance/store.js';
import { listContentImpacts } from '../jobs/impact.js';
import { listResearchSessions } from '../research/store.js';
import type { ArticleHealthView, ContentHealthStatus, ContentHealthSummary } from './types.js';

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function statusFromScore(score: number | null, hasData: boolean): ContentHealthStatus {
  if (!hasData || score == null) return 'insufficient_data';
  if (score < 40) return 'critical';
  if (score < 70) return 'needs_attention';
  return 'healthy';
}

/** Explainable article health from performance + impact + research signals only. */
export function buildArticleHealthViews(siteId: string): ArticleHealthView[] {
  const perf = loadPerformanceStore(siteId);
  const impacts = listContentImpacts(siteId).filter((r) => r.status === 'OPEN');
  const staleSessions = listResearchSessions(siteId).filter(
    (s) => s.status === 'STALE' || s.status === 'INVALIDATED'
  );

  return perf.records.map((record) => {
    const reasons: string[] = [];
    const signals: string[] = [];
    let score = 80;

    if (record.decay.status === 'DECAYED') {
      score -= 30;
      reasons.push(...record.decay.reasons.slice(0, 2));
      signals.push('decay:DECAYED');
    } else if (record.decay.status === 'DECLINING') {
      score -= 15;
      reasons.push(...record.decay.reasons.slice(0, 2));
      signals.push('decay:DECLINING');
    }

    const age = record.baseline.contentAgeDays;
    if (typeof age === 'number' && age > 180) {
      score -= 10;
      reasons.push(`content is ${age} days old`);
      signals.push('freshness:old');
    }

    const freshnessIssues = record.freshnessIssues || [];
    if (freshnessIssues.length) {
      score -= Math.min(15, freshnessIssues.length * 5);
      reasons.push(...freshnessIssues.slice(0, 2).map((i) => i.reason));
      signals.push('freshness:issues');
    }

    const seoDim = record.health?.dimensions?.seo;
    if (seoDim?.status === 'error' || seoDim?.status === 'warning') {
      score -= seoDim.status === 'error' ? 15 : 8;
      reasons.push(...(seoDim.reasons || []).slice(0, 2));
      signals.push(`seo:${seoDim.status}`);
    }

    const aid = String(record.articleId);
    const impacted = impacts.filter((impact) =>
      (impact.affectedEntityIds || []).some((id) => {
        const s = String(id);
        return s === aid || s === `entity-${siteId}-wp-${aid}` || s.endsWith(`-wp-${aid}`);
      })
    );
    if (impacted.length) {
      score -= 12;
      reasons.push(`${impacted.length} open source-change impact(s)`);
      signals.push('source:changed');
    }

    if (staleSessions.length && record.opportunities.some((o) => o.type === 'REFRESH_FACTS')) {
      score -= 8;
      reasons.push('facts refresh opportunity present');
      signals.push('research:refresh');
    }

    if (record.baseline.quality === 'DEMO_DATA') {
      reasons.push('DEMO_DATA — not live measured performance');
      signals.push('quality:DEMO_DATA');
    }

    const finalScore = clampScore(score);
    return {
      articleId: record.articleId,
      title: record.baseline.title,
      score: finalScore,
      status: statusFromScore(finalScore, true),
      reasons: reasons.length ? reasons : ['No negative signals in stored performance data'],
      signals,
      lastUpdated: record.health?.assessedAt || (record as any).assessedAt || perf.lastSyncedAt
    };
  });
}

export function buildContentHealthSummary(siteId: string): ContentHealthSummary {
  const articles = buildArticleHealthViews(siteId);
  const perf = loadPerformanceStore(siteId);
  const impacts = listContentImpacts(siteId).filter((r) => r.status === 'OPEN');
  const staleSessions = listResearchSessions(siteId).filter(
    (s) => s.status === 'STALE' || s.status === 'INVALIDATED'
  );

  if (!articles.length) {
    return {
      status: 'insufficient_data',
      score: null,
      reasons: ['No performance records — run PERFORMANCE_SYNC'],
      counts: {
        total: 0,
        decaying: 0,
        stale: 0,
        seoIssues: 0,
        researchIssues: staleSessions.length,
        sourceImpacts: impacts.length
      },
      lastUpdated: perf.lastSyncedAt
    };
  }

  const decaying = articles.filter((a) => a.signals.some((s) => s.startsWith('decay:'))).length;
  const stale = articles.filter((a) => a.signals.includes('freshness:old') || a.signals.includes('freshness:issues')).length;
  const seoIssues = articles.filter((a) => a.signals.some((s) => s.startsWith('seo:'))).length;
  const avg = articles.reduce((sum, a) => sum + (a.score || 0), 0) / articles.length;
  const score = clampScore(avg);
  const reasons: string[] = [];
  if (decaying) reasons.push(`${decaying} decaying/declining articles`);
  if (stale) reasons.push(`${stale} freshness concerns`);
  if (seoIssues) reasons.push(`${seoIssues} SEO issue sets`);
  if (impacts.length) reasons.push(`${impacts.length} open source impacts`);
  if (staleSessions.length) reasons.push(`${staleSessions.length} stale research sessions`);

  return {
    status: statusFromScore(score, true),
    score,
    reasons: reasons.length ? reasons : ['Stored signals look stable'],
    counts: {
      total: articles.length,
      decaying,
      stale,
      seoIssues,
      researchIssues: staleSessions.length,
      sourceImpacts: impacts.length
    },
    lastUpdated: perf.lastSyncedAt
  };
}
