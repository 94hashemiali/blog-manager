import { getContentIndex } from '../intelligence/store.js';
import { loadPerformanceStore } from '../performance/store.js';
import { listContentImpacts } from '../jobs/impact.js';
import { listResearchSessions } from '../research/store.js';
import { collectDecisionSignals, signalsForArticle } from './signals.js';
import {
  ACTION_EFFORT,
  confidenceLabel,
  priorityFromScore,
  qualitativeImpact,
  riskFromSignals,
  scoreDecision
} from './scoring.js';
import { checkActionFeasibility, mapActionToRecommendationType } from './actions.js';
import { buildExplanation } from './explain.js';
import { decisionKey, newDecisionId, persistEngineResult } from './store.js';
import {
  DECISION_ENGINE_VERSION,
  type ArticleDecisionContext,
  type Decision,
  type DecisionAction,
  type DecisionEngineResult,
  type DecisionSignal
} from './types.js';

interface Candidate {
  action: DecisionAction;
  entityId?: string;
  articleId?: string | number;
  title: string;
  signals: DecisionSignal[];
  topic?: string;
}

/**
 * Run Decision Engine for a site (read/analysis only — no external I/O).
 */
export function runDecisionEngine(
  siteId: string,
  opts: { persist?: boolean; topN?: number } = {}
): DecisionEngineResult {
  const topN = opts.topN ?? 5;
  const signals = collectDecisionSignals(siteId);
  const candidates = buildCandidates(siteId, signals);
  const decisions: Decision[] = [];
  const now = new Date().toISOString();

  // Stable id from key so re-runs update same logical decision.
  const seen = new Set<string>();

  for (const cand of candidates) {
    let action = cand.action;
    let feasibility = checkActionFeasibility(siteId, action, {
      articleId: cand.articleId,
      entityId: cand.entityId,
      signals: cand.signals,
      topic: cand.topic
    });
    let redirected = false;
    if (!feasibility.feasible && feasibility.redirectTo) {
      action = feasibility.redirectTo;
      redirected = true;
      feasibility = checkActionFeasibility(siteId, action, {
        articleId: cand.articleId,
        entityId: cand.entityId,
        signals: cand.signals,
        topic: cand.topic
      });
    }

    // Still infeasible with no redirect — keep as OPEN with blockers (not executable).
    const risk = riskFromSignals(cand.signals);
    const breakdown = scoreDecision({
      signals: cand.signals,
      effortHint: ACTION_EFFORT[action] ?? 0.5,
      risk
    });
    // Infeasible without redirect loses score weight.
    if (!feasibility.feasible && !redirected) {
      breakdown.final = Math.round(breakdown.final * 0.4 * 100) / 100;
    }

    const key = decisionKey({
      siteId,
      type: action,
      entityId: cand.entityId,
      articleId: cand.articleId
    });
    if (seen.has(key)) continue;
    seen.add(key);

    const id = `dec-${Buffer.from(key).toString('base64url').slice(0, 16)}`;
    const decision: Decision = {
      id: id.length >= 8 ? id : newDecisionId(),
      siteId,
      decisionEngineVersion: DECISION_ENGINE_VERSION,
      type: action,
      entityId: cand.entityId,
      articleId: cand.articleId,
      title: cand.title,
      priority: priorityFromScore(breakdown.final, cand.signals),
      score: breakdown.final,
      scoreBreakdown: breakdown,
      confidence: confidenceLabel(cand.signals),
      expectedImpact: qualitativeImpact(cand.signals),
      effort: breakdown.effort,
      risk,
      reasons: cand.signals.flatMap((s) => s.evidence).slice(0, 6),
      signals: cand.signals,
      recommendedAction: action,
      blockers: feasibility.blockers,
      createdAt: now,
      updatedAt: now,
      status: 'OPEN',
      explanation: buildExplanation({
        action,
        signals: cand.signals,
        blockers: feasibility.blockers,
        redirected
      })
    };
    decisions.push(decision);
  }

  // Wire simple prerequisites: UPDATE that redirected from research → link refresh decision.
  for (const d of decisions) {
    if (d.recommendedAction === 'UPDATE_ARTICLE' || d.type === 'UPDATE_ARTICLE') {
      const refresh = decisions.find(
        (x) =>
          x.recommendedAction === 'REFRESH_RESEARCH' &&
          (x.articleId != null && d.articleId != null
            ? String(x.articleId) === String(d.articleId)
            : false)
      );
      if (refresh) d.prerequisiteDecisionId = refresh.id;
    }
  }

  decisions.sort((a, b) => b.score - a.score || b.priority.localeCompare(a.priority));
  const topActions = decisions.slice(0, topN);
  if (topActions[0]) topActions[0].status = 'SELECTED';

  const result: DecisionEngineResult = {
    siteId,
    generatedAt: now,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    signals,
    decisions,
    topActions,
    nextBest: topActions[0] || null,
    articleContexts: buildArticleContexts(siteId, signals)
  };

  if (opts.persist !== false) {
    persistEngineResult(result);
  }
  return result;
}

function buildCandidates(siteId: string, signals: DecisionSignal[]): Candidate[] {
  const candidates: Candidate[] = [];
  const index = getContentIndex(siteId);
  const titleOf = (articleId?: string | number) => {
    if (articleId == null) return 'Unknown article';
    return index.articles.find((a) => String(a.id) === String(articleId))?.title || `Article ${articleId}`;
  };

  // Per-article update / SEO / review
  const articleIds = new Set<string>();
  for (const s of signals) {
    if (s.articleId != null) articleIds.add(String(s.articleId));
  }

  for (const aid of articleIds) {
    const articleSignals = signalsForArticle(signals, aid);
    const decay = articleSignals.some((s) => s.type === 'CONTENT_DECAY' || s.type === 'CONTENT_DECLINE' || s.type === 'PERFORMANCE_OPPORTUNITY');
    const seo = articleSignals.some((s) => s.type === 'SEO_ISSUE');
    const claim = articleSignals.some((s) => s.type === 'HIGH_RISK_CLAIM');
    const canni = articleSignals.some((s) => s.type === 'CANNIBALIZATION_RISK');

    if (claim || canni) {
      candidates.push({
        action: 'REVIEW_ARTICLE',
        articleId: aid,
        entityId: aid,
        title: `Review: ${titleOf(aid)}`,
        signals: articleSignals
      });
    } else if (seo && !decay) {
      candidates.push({
        action: 'FIX_SEO',
        articleId: aid,
        entityId: aid,
        title: `Fix SEO: ${titleOf(aid)}`,
        signals: articleSignals
      });
    } else if (decay || articleSignals.some((s) => s.type === 'STALE_CONTENT')) {
      candidates.push({
        action: 'UPDATE_ARTICLE',
        articleId: aid,
        entityId: aid,
        title: `Update: ${titleOf(aid)}`,
        signals: articleSignals
      });
    }
  }

  // Source changes
  for (const s of signals.filter((x) => x.type === 'SOURCE_CHANGED')) {
    candidates.push({
      action: 'REVIEW_SOURCE',
      entityId: s.entityId,
      title: 'Review source change impact',
      signals: [s, ...signals.filter((x) => x.type === 'STALE_RESEARCH')].slice(0, 6)
    });
  }

  // Stale research
  for (const s of signals.filter((x) => x.type === 'STALE_RESEARCH')) {
    const session = listResearchSessions(siteId).find((r) => r.id === s.entityId);
    candidates.push({
      action: 'REFRESH_RESEARCH',
      entityId: s.entityId,
      title: `Refresh research: ${session?.topic || s.entityId}`,
      signals: [s],
      topic: session?.topic
    });
  }

  // Research conflicts → review source
  for (const s of signals.filter((x) => x.type === 'RESEARCH_CONFLICT')) {
    candidates.push({
      action: 'REVIEW_SOURCE',
      entityId: s.entityId,
      title: 'Resolve research conflict',
      signals: [s]
    });
  }

  // Failed ops
  for (const s of signals.filter((x) => x.type === 'FAILED_OPERATION')) {
    candidates.push({
      action: 'RETRY_OPERATION',
      entityId: s.entityId,
      title: `Retry failed operation`,
      signals: [s]
    });
  }

  // Providers
  for (const s of signals.filter(
    (x) => x.type === 'PROVIDER_NOT_CONFIGURED' || x.type === 'PROVIDER_ERROR'
  )) {
    candidates.push({
      action: 'CONFIGURE_PROVIDER',
      entityId: s.entityId,
      title: `Configure provider: ${s.entityId}`,
      signals: [s]
    });
  }

  // Perf sync
  if (signals.some((s) => s.type === 'PERF_NEEDS_SYNC')) {
    candidates.push({
      action: 'SYNC_PERFORMANCE',
      title: 'Sync performance data',
      signals: signals.filter((s) => s.type === 'PERF_NEEDS_SYNC')
    });
  }

  // Content gaps → create recommend-only
  for (const s of signals.filter((x) => x.type === 'CONTENT_GAP')) {
    candidates.push({
      action: s.articleId != null ? 'UPDATE_ARTICLE' : 'CREATE_ARTICLE',
      articleId: s.articleId,
      entityId: s.entityId,
      title: s.articleId != null ? `Update outdated: ${titleOf(s.articleId)}` : `Content gap: ${s.entityId}`,
      signals: [s]
    });
  }

  // Publishing blockers → review
  for (const s of signals.filter((x) => x.type === 'PUBLISHING_BLOCKER')) {
    candidates.push({
      action: 'REVIEW_ARTICLE',
      entityId: s.entityId,
      articleId: s.articleId,
      title: 'Resolve publishing blocker',
      signals: [s]
    });
  }

  return candidates;
}

function buildArticleContexts(siteId: string, signals: DecisionSignal[]): ArticleDecisionContext[] {
  const index = getContentIndex(siteId);
  const perf = loadPerformanceStore(siteId);
  const impacts = listContentImpacts(siteId).filter((r) => r.status === 'OPEN');
  const sessions = listResearchSessions(siteId);
  const ids = new Set<string>();
  for (const s of signals) {
    if (s.articleId != null) ids.add(String(s.articleId));
  }
  for (const r of perf.records) ids.add(String(r.articleId));

  return Array.from(ids).map((aid) => {
    const article = index.articles.find((a) => String(a.id) === aid);
    const record = perf.records.find((r) => String(r.articleId) === aid);
    const articleSignals = signalsForArticle(signals, aid);
    const cluster = (index.clusters || []).find((c) =>
      (c.articleIds || []).some((id: any) => String(id) === aid)
    );
    return {
      articleId: record?.articleId ?? aid,
      title: article?.title || record?.baseline?.title || `Article ${aid}`,
      performance: record
        ? {
            decayStatus: record.decay.status,
            freshnessClass: record.baseline.freshnessClass,
            seoStatus: record.health?.dimensions?.seo?.status,
            opportunities: (record.opportunities || []).map((o) => o.type)
          }
        : undefined,
      research: {
        staleSessions: sessions.filter((s) => s.status === 'STALE' || s.status === 'INVALIDATED').length,
        conflicts: sessions.filter((s) =>
          (s.conflicts || []).some((c) => c.resolutionStatus === 'UNRESOLVED')
        ).length
      },
      sourceImpacts: impacts.filter((i) =>
        (i.affectedEntityIds || []).some(
          (id) => String(id) === aid || String(id).endsWith(`-wp-${aid}`)
        )
      ).length,
      seoIssues: (record?.health?.dimensions?.seo?.checks || []).filter(
        (c) => c.status === 'error' || c.status === 'warning'
      ).length,
      cannibalizationRisk: cluster?.health?.cannibalizationRisk,
      signals: articleSignals
    };
  });
}

/** Re-evaluate whether a recommendation/decision is still valid. */
export function reevaluateDecisionForRecommendation(
  siteId: string,
  recommendation: {
    id: string;
    type: string;
    articleId?: string | number;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): {
  stillNeeded: boolean;
  reason: string;
  decision: Decision | null;
  nextAction?: DecisionAction;
} {
  const result = runDecisionEngine(siteId, { persist: true, topN: 10 });
  const match = result.decisions.find((d) => {
    if (recommendation.articleId != null && d.articleId != null) {
      if (String(d.articleId) === String(recommendation.articleId)) {
        const mapped = mapActionToRecommendationType(d.recommendedAction);
        return mapped === recommendation.type || d.recommendedAction === recommendation.type;
      }
    }
    if (recommendation.entityId && d.entityId === recommendation.entityId) return true;
    return false;
  });

  if (!match) {
    return {
      stillNeeded: false,
      reason: 'No matching open decision — underlying signals cleared or resolved.',
      decision: null
    };
  }

  const feasibility = checkActionFeasibility(siteId, match.recommendedAction, {
    articleId: match.articleId,
    entityId: match.entityId,
    signals: match.signals
  });

  if (!feasibility.feasible && feasibility.blockers.some((b) => b.code === 'RESEARCH_NOT_STALE')) {
    return {
      stillNeeded: false,
      reason: 'Research no longer stale.',
      decision: match
    };
  }

  return {
    stillNeeded: true,
    reason: match.explanation.whyNow,
    decision: match,
    nextAction: match.recommendedAction
  };
}

export { mapActionToRecommendationType };
