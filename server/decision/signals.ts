import { loadPerformanceStore } from '../performance/store.js';
import { listResearchSessions } from '../research/store.js';
import { listContentImpacts } from '../jobs/impact.js';
import { listOpsJobs } from '../jobs/store.js';
import { listJobs as listProductionJobs } from '../content/store.js';
import { getContentIndex } from '../intelligence/store.js';
import { buildHealthPayload } from '../providers/status.js';
import { assessClaimRisk, isAttentionWorthyClaimRisk } from '../operations/claimRisk.js';
import type { DecisionSignal, DecisionSignalType, SignalSeverity } from './types.js';

function signal(params: Omit<DecisionSignal, 'strength'> & { strength?: number }): DecisionSignal {
  return {
    ...params,
    strength: Math.max(0, Math.min(1, params.strength ?? severityStrength(params.severity)))
  };
}

function severityStrength(severity: SignalSeverity): number {
  switch (severity) {
    case 'CRITICAL':
      return 1;
    case 'HIGH':
      return 0.85;
    case 'MEDIUM':
      return 0.55;
    case 'LOW':
      return 0.3;
    default:
      return 0.15;
  }
}

/**
 * Collect normalized decision signals from persisted stores only.
 * No Gemini / WordPress / web fetch.
 */
export function collectDecisionSignals(siteId: string): DecisionSignal[] {
  const out: DecisionSignal[] = [];
  const now = new Date().toISOString();

  const perf = loadPerformanceStore(siteId);
  if (perf.records.length === 0) {
    out.push(
      signal({
        type: 'PERF_NEEDS_SYNC',
        siteId,
        severity: 'LOW',
        evidence: ['performance store empty'],
        detectedAt: perf.lastSyncedAt || now,
        source: 'performance.store'
      })
    );
  }

  for (const record of perf.records) {
    if (record.decay.status === 'DECAYED') {
      out.push(
        signal({
          type: 'CONTENT_DECAY',
          siteId,
          articleId: record.articleId,
          entityId: String(record.articleId),
          severity: 'HIGH',
          strength: 0.9,
          evidence: record.decay.reasons.slice(0, 4),
          detectedAt: (record as any).assessedAt || perf.lastSyncedAt || now,
          source: 'performance.decay'
        })
      );
    } else if (record.decay.status === 'DECLINING') {
      out.push(
        signal({
          type: 'CONTENT_DECLINE',
          siteId,
          articleId: record.articleId,
          entityId: String(record.articleId),
          severity: 'MEDIUM',
          strength: 0.65,
          evidence: record.decay.reasons.slice(0, 3),
          detectedAt: (record as any).assessedAt || perf.lastSyncedAt || now,
          source: 'performance.decay'
        })
      );
    }

    const age = record.baseline.contentAgeDays;
    if (typeof age === 'number' && age > 180) {
      out.push(
        signal({
          type: 'STALE_CONTENT',
          siteId,
          articleId: record.articleId,
          entityId: String(record.articleId),
          severity: age > 365 ? 'MEDIUM' : 'LOW',
          strength: Math.min(1, age / 400),
          evidence: [`content age ${age} days`],
          detectedAt: now,
          source: 'performance.baseline'
        })
      );
    }

    const seoFails = (record.health?.dimensions?.seo?.checks || []).filter(
      (c) => c.status === 'error' || c.status === 'warning'
    );
    if (seoFails.length) {
      out.push(
        signal({
          type: 'SEO_ISSUE',
          siteId,
          articleId: record.articleId,
          entityId: String(record.articleId),
          severity: seoFails.some((c) => c.status === 'error') ? 'MEDIUM' : 'LOW',
          strength: Math.min(1, seoFails.length * 0.25),
          evidence: seoFails.slice(0, 3).map((c) => c.detail || c.label),
          detectedAt: now,
          source: 'performance.seo'
        })
      );
    }

    for (const opp of record.opportunities || []) {
      if (opp.type === 'UPDATE_ARTICLE') {
        out.push(
          signal({
            type: 'PERFORMANCE_OPPORTUNITY',
            siteId,
            articleId: record.articleId,
            entityId: String(record.articleId),
            severity: opp.severity === 'high' ? 'HIGH' : opp.severity === 'medium' ? 'MEDIUM' : 'LOW',
            evidence: [opp.reason, ...(opp.evidence || []).slice(0, 2)],
            detectedAt: now,
            source: 'performance.opportunities'
          })
        );
      }
    }
  }

  for (const opp of perf.opportunities.filter((o) => o.type === 'UPDATE_ARTICLE')) {
    // Site-level list may duplicate per-record — normalize later by article+type.
    out.push(
      signal({
        type: 'PERFORMANCE_OPPORTUNITY',
        siteId,
        articleId: opp.articleId,
        entityId: String(opp.articleId),
        severity: opp.severity === 'high' ? 'HIGH' : opp.severity === 'medium' ? 'MEDIUM' : 'LOW',
        evidence: [opp.reason, ...(opp.evidence || []).slice(0, 2)],
        detectedAt: now,
        source: 'performance.opportunities.site'
      })
    );
  }

  const sessions = listResearchSessions(siteId);
  for (const session of sessions) {
    if (session.status === 'STALE' || session.status === 'INVALIDATED') {
      out.push(
        signal({
          type: 'STALE_RESEARCH',
          siteId,
          entityId: session.id,
          severity: 'MEDIUM',
          evidence: [`status=${session.status}`, `topic=${session.topic}`],
          detectedAt: session.updatedAt || now,
          source: 'research.session'
        })
      );
    }
    const unresolved = (session.conflicts || []).filter((c) => c.resolutionStatus === 'UNRESOLVED');
    if (unresolved.length) {
      out.push(
        signal({
          type: 'RESEARCH_CONFLICT',
          siteId,
          entityId: session.id,
          severity: unresolved.some((c) => c.severity === 'high') ? 'HIGH' : 'MEDIUM',
          evidence: unresolved.slice(0, 3).map((c) => c.difference || c.claim || c.id),
          detectedAt: session.updatedAt || now,
          source: 'research.conflicts'
        })
      );
    }
  }

  for (const impact of listContentImpacts(siteId).filter((r) => r.status === 'OPEN')) {
    out.push(
      signal({
        type: 'SOURCE_CHANGED',
        siteId,
        entityId: impact.id,
        severity: impact.affectedProductionJobIds.length ? 'HIGH' : 'MEDIUM',
        strength: Math.min(1, 0.5 + impact.affectedSessionIds.length * 0.1),
        evidence: [
          impact.note || 'SOURCE_CHANGED',
          impact.sourceUrl,
          `${impact.affectedSessionIds.length} session(s)`,
          `${impact.affectedProductionJobIds.length} production job(s)`
        ],
        detectedAt: impact.detectedAt,
        source: 'content.impact'
      })
    );
  }

  for (const job of listOpsJobs({ siteId })) {
    if (job.status === 'FAILED' || job.status === 'INTERRUPTED' || job.status === 'RECOVERY_REQUIRED') {
      out.push(
        signal({
          type: 'FAILED_OPERATION',
          siteId,
          entityId: job.id,
          severity: job.status === 'RECOVERY_REQUIRED' ? 'CRITICAL' : 'HIGH',
          evidence: [job.type, job.status, job.lastError?.message || 'failed'].filter(Boolean),
          detectedAt: job.updatedAt || now,
          source: 'jobs.ops'
        })
      );
    }
  }

  for (const job of listProductionJobs(siteId)) {
    if (job.publishingChecklist && !job.publishingChecklist.canPublish && (job.stage === 'review' || job.stage === 'approved')) {
      out.push(
        signal({
          type: 'PUBLISHING_BLOCKER',
          siteId,
          entityId: job.id,
          articleId: job.wordpressPostId || job.sourceArticleId,
          severity: 'CRITICAL',
          evidence: job.publishingChecklist.blocking.map((b) => b.detail || b.id),
          detectedAt: job.publishingChecklist.checkedAt || job.updatedAt,
          source: 'production.checklist'
        })
      );
    }
    for (const claim of job.research?.claims || []) {
      const assessed = assessClaimRisk({
        claim,
        sources: job.research?.sources as any,
        hasConflict: Boolean((job.research as any)?.conflicts?.length)
      });
      if (isAttentionWorthyClaimRisk(assessed.level)) {
        out.push(
          signal({
            type: 'HIGH_RISK_CLAIM',
            siteId,
            entityId: job.id,
            articleId: job.wordpressPostId || job.sourceArticleId,
            severity: assessed.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            evidence: [claim.text || claim.status, ...assessed.reasons.slice(0, 2)],
            detectedAt: job.updatedAt,
            source: 'production.claims'
          })
        );
      }
    }
  }

  const index = getContentIndex(siteId);
  for (const gap of index?.gaps || []) {
    out.push(
      signal({
        type: 'CONTENT_GAP',
        siteId,
        entityId: gap.id || gap.kind,
        articleId: gap.articleId,
        severity: gap.kind === 'outdated_article' ? 'MEDIUM' : 'LOW',
        evidence: [gap.reason || gap.kind].filter(Boolean),
        detectedAt: index.lastSyncedAt || now,
        source: 'intelligence.gaps'
      })
    );
  }

  for (const cluster of index?.clusters || []) {
    const risk = cluster.health?.cannibalizationRisk;
    if (risk && risk !== 'none') {
      const articleIds = cluster.articleIds?.length ? cluster.articleIds : [undefined];
      for (const articleId of articleIds) {
        out.push(
          signal({
            type: 'CANNIBALIZATION_RISK',
            siteId,
            entityId: cluster.id,
            articleId,
            severity: risk === 'severe' ? 'HIGH' : 'MEDIUM',
            strength: risk === 'severe' ? 0.9 : risk === 'moderate' ? 0.6 : 0.35,
            evidence: [`cluster=${cluster.name || cluster.id}`, `risk=${risk}`],
            detectedAt: index.lastSyncedAt || now,
            source: 'intelligence.clusters'
          })
        );
      }
    }
  }

  const providers = buildHealthPayload(siteId).providers as Record<string, any>;
  for (const [id, row] of Object.entries(providers)) {
    const status = row.status;
    if (status === 'error' || status === 'misconfigured') {
      out.push(
        signal({
          type: 'PROVIDER_ERROR',
          siteId,
          entityId: id,
          severity: id === 'gemini' || id === 'wordpress' ? 'CRITICAL' : 'HIGH',
          evidence: [status, row.detail || ''].filter(Boolean),
          detectedAt: now,
          source: 'providers.health'
        })
      );
    } else if (status === 'not_configured' && (id === 'gemini' || id === 'wordpress' || id === 'web_search')) {
      out.push(
        signal({
          type: 'PROVIDER_NOT_CONFIGURED',
          siteId,
          entityId: id,
          severity: id === 'gemini' ? 'HIGH' : 'MEDIUM',
          evidence: [row.detail || 'not_configured'],
          detectedAt: now,
          source: 'providers.health'
        })
      );
    }
  }

  return normalizeSignals(out);
}

/**
 * Collapse duplicate signal types for the same entity into one stronger signal.
 */
export function normalizeSignals(signals: DecisionSignal[]): DecisionSignal[] {
  const map = new Map<string, DecisionSignal>();
  for (const s of signals) {
    const key = [
      s.siteId,
      s.type,
      s.articleId != null ? String(s.articleId) : '-',
      s.entityId || '-'
    ].join('::');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, s);
      continue;
    }
    map.set(key, {
      ...existing,
      severity: higherSeverity(existing.severity, s.severity),
      strength: Math.max(existing.strength, s.strength),
      evidence: Array.from(new Set([...existing.evidence, ...s.evidence])).slice(0, 8),
      detectedAt: existing.detectedAt > s.detectedAt ? existing.detectedAt : s.detectedAt
    });
  }
  return Array.from(map.values());
}

function higherSeverity(a: SignalSeverity, b: SignalSeverity): SignalSeverity {
  const order: SignalSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

export function signalsForArticle(
  signals: DecisionSignal[],
  articleId: string | number
): DecisionSignal[] {
  const aid = String(articleId);
  return signals.filter((s) => s.articleId != null && String(s.articleId) === aid);
}

export function hasSignalType(signals: DecisionSignal[], type: DecisionSignalType): boolean {
  return signals.some((s) => s.type === type);
}
