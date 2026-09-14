import { getContentIndex } from '../intelligence/store.js';
import { evaluateCannibalization } from '../intelligence/duplication.js';
import { loadPerformanceStore } from '../performance/store.js';
import { listContentImpacts } from '../jobs/impact.js';
import { listResearchSessions } from '../research/store.js';
import {
  getRecommendation,
  updateRecommendationStatus
} from '../operations/recommendations.js';
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
import { buildExplanation, explainDecision } from './explain.js';
import { decisionKey, newDecisionId, persistEngineResult } from './store.js';
import { isRecommendationStillNeeded } from './reeval.js';
import {
  DECISION_ENGINE_VERSION,
  type ArticleDecisionContext,
  type Decision,
  type DecisionAction,
  type DecisionEngineResult,
  type DecisionEvalContext,
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
 * Evaluate one decision context into a scored, explainable Decision.
 * Pure over inputs except feasibility reads persisted site state.
 */
export function evaluateDecision(ctx: DecisionEvalContext): Decision {
  const now = ctx.now || new Date().toISOString();
  let action = ctx.action;
  let feasibility = checkActionFeasibility(ctx.siteId, action, {
    articleId: ctx.articleId,
    entityId: ctx.entityId,
    signals: ctx.signals,
    topic: ctx.topic
  });
  let redirected = Boolean(ctx.redirected);

  if (feasibility.redirectTo && feasibility.status !== 'AVAILABLE') {
    action = feasibility.redirectTo;
    redirected = true;
    feasibility = checkActionFeasibility(ctx.siteId, action, {
      articleId: ctx.articleId,
      entityId: ctx.entityId,
      signals: ctx.signals,
      topic: ctx.topic
    });
  }

  const risk = riskFromSignals(ctx.signals);
  const breakdown = scoreDecision({
    signals: ctx.signals,
    effortHint: ACTION_EFFORT[action] ?? 0.5,
    risk
  });
  if (!feasibility.feasible && !redirected) {
    breakdown.final = Math.round(breakdown.final * 0.4 * 100) / 100;
  }
  if (action === 'DEFER') {
    breakdown.final = Math.min(breakdown.final, 0.15);
  }

  const key = decisionKey({
    siteId: ctx.siteId,
    type: action,
    entityId: ctx.entityId,
    articleId: ctx.articleId
  });
  const id = `dec-${Buffer.from(key).toString('base64url').slice(0, 16)}`;

  const prerequisites: string[] = [];
  for (const b of feasibility.blockers) {
    if (b.resolvesWith) prerequisites.push(`Resolve ${b.code} via ${b.resolvesWith}`);
  }

  return {
    id: id.length >= 8 ? id : newDecisionId(),
    siteId: ctx.siteId,
    decisionEngineVersion: DECISION_ENGINE_VERSION,
    type: action,
    entityId: ctx.entityId,
    articleId: ctx.articleId,
    title: ctx.title,
    priority: priorityFromScore(breakdown.final, ctx.signals),
    score: breakdown.final,
    scoreBreakdown: breakdown,
    confidence: confidenceLabel(ctx.signals),
    expectedImpact: qualitativeImpact(ctx.signals),
    effort: breakdown.effort,
    risk,
    reasons: ctx.signals.flatMap((s) => s.evidence).slice(0, 6),
    signals: ctx.signals,
    recommendedAction: action,
    feasibilityStatus: feasibility.status,
    blockers: feasibility.blockers,
    createdAt: now,
    updatedAt: now,
    status: 'OPEN',
    explanation: buildExplanation({
      action,
      signals: ctx.signals,
      blockers: feasibility.blockers,
      redirected,
      feasibilityStatus: feasibility.status,
      alternatives: ctx.alternatives || [],
      prerequisites
    })
  };
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
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const decisions: Decision[] = [];

  for (const cand of candidates) {
    const decision = evaluateDecision({
      siteId,
      action: cand.action,
      signals: cand.signals,
      title: cand.title,
      entityId: cand.entityId,
      articleId: cand.articleId,
      topic: cand.topic,
      now
    });
    const key = decisionKey(decision);
    if (seen.has(key)) continue;
    seen.add(key);
    decisions.push(decision);
  }

  for (const d of decisions) {
    d.explanation.alternatives = decisions
      .filter((x) => x.id !== d.id)
      .filter(
        (x) =>
          (d.articleId != null &&
            x.articleId != null &&
            String(x.articleId) === String(d.articleId)) ||
          (d.articleId == null && x.articleId == null)
      )
      .slice(0, 3)
      .map((x) => ({
        action: x.recommendedAction,
        score: x.score,
        reason: x.explanation.summary || x.explanation.whyThis
      }));
  }

  for (const d of decisions) {
    if (d.recommendedAction === 'UPDATE_ARTICLE' || d.type === 'UPDATE_ARTICLE') {
      const refresh = decisions.find(
        (x) =>
          x.recommendedAction === 'REFRESH_RESEARCH' &&
          d.articleId != null &&
          x.articleId != null &&
          String(x.articleId) === String(d.articleId)
      );
      if (refresh) d.prerequisiteDecisionId = refresh.id;
    }
  }

  // Hard safety: HIGH/CRITICAL research conflict blocks any remaining UPDATE/FIX.
  const hasCriticalConflict = signals.some(
    (s) =>
      s.type === 'RESEARCH_CONFLICT' && (s.severity === 'HIGH' || s.severity === 'CRITICAL')
  );
  if (hasCriticalConflict) {
    for (const d of decisions) {
      if (
        d.recommendedAction === 'UPDATE_ARTICLE' ||
        d.recommendedAction === 'FIX_SEO' ||
        d.recommendedAction === 'ADD_INTERNAL_LINKS'
      ) {
        d.feasibilityStatus = 'BLOCKED';
        d.blockers = [
          ...d.blockers,
          {
            code: 'RESEARCH_CONFLICT',
            message: 'Update blocked because research evidence has unresolved conflicts',
            resolvesWith: 'REVIEW_SOURCE'
          }
        ];
        d.explanation = buildExplanation({
          action: d.recommendedAction,
          signals: d.signals,
          blockers: d.blockers,
          feasibilityStatus: 'BLOCKED',
          alternatives: d.explanation.alternatives
        });
      }
    }
  }

  decisions.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const topActions = decisions
    .filter(
      (d) =>
        d.recommendedAction !== 'DEFER' &&
        d.feasibilityStatus !== 'BLOCKED' &&
        d.feasibilityStatus !== 'INSUFFICIENT_DATA'
    )
    .slice(0, topN);
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

  if (opts.persist === true) {
    persistEngineResult(result);
  }
  return result;
}

function buildCandidates(siteId: string, signals: DecisionSignal[]): Candidate[] {
  const candidates: Candidate[] = [];
  const index = getContentIndex(siteId);
  const titleOf = (articleId?: string | number) => {
    if (articleId == null) return 'Unknown article';
    return (
      index.articles.find((a) => String(a.id) === String(articleId))?.title || `Article ${articleId}`
    );
  };

  const articleIds = new Set<string>();
  for (const s of signals) {
    if (s.articleId != null) articleIds.add(String(s.articleId));
  }

  for (const aid of articleIds) {
    const articleSignals = signalsForArticle(signals, aid);
    const siteConflicts = signals.filter(
      (s) =>
        s.type === 'RESEARCH_CONFLICT' &&
        (s.severity === 'HIGH' || s.severity === 'CRITICAL')
    );
    const mergedArticleSignals = [...articleSignals];
    for (const c of siteConflicts) {
      if (!mergedArticleSignals.some((s) => s.id === c.id)) mergedArticleSignals.push(c);
    }
    const decay = mergedArticleSignals.some(
      (s) =>
        s.type === 'CONTENT_DECAY' ||
        s.type === 'CONTENT_DECLINE' ||
        s.type === 'PERFORMANCE_OPPORTUNITY'
    );
    const seo = mergedArticleSignals.some((s) => s.type === 'SEO_ISSUE');
    const claim = mergedArticleSignals.some((s) => s.type === 'HIGH_RISK_CLAIM');
    const canni = mergedArticleSignals.some((s) => s.type === 'CANNIBALIZATION_RISK');
    const conflict = mergedArticleSignals.some(
      (s) => s.type === 'RESEARCH_CONFLICT' && (s.severity === 'HIGH' || s.severity === 'CRITICAL')
    );

    if (conflict) {
      candidates.push({
        action: 'REVIEW_SOURCE',
        articleId: aid,
        entityId: aid,
        title: `Review conflict: ${titleOf(aid)}`,
        signals: mergedArticleSignals
      });
    } else if (claim || canni) {
      candidates.push({
        action: 'REVIEW_ARTICLE',
        articleId: aid,
        entityId: aid,
        title: `Review: ${titleOf(aid)}`,
        signals: mergedArticleSignals
      });
    } else if (seo && !decay) {
      candidates.push({
        action: 'FIX_SEO',
        articleId: aid,
        entityId: aid,
        title: `Fix SEO: ${titleOf(aid)}`,
        signals: mergedArticleSignals
      });
    } else if (decay || mergedArticleSignals.some((s) => s.type === 'STALE_CONTENT')) {
      candidates.push({
        action: 'UPDATE_ARTICLE',
        articleId: aid,
        entityId: aid,
        title: `Update: ${titleOf(aid)}`,
        signals: mergedArticleSignals
      });
    }
  }

  for (const s of signals.filter((x) => x.type === 'SOURCE_CHANGED')) {
    candidates.push({
      action: 'REVIEW_SOURCE',
      entityId: s.entityId,
      title: 'Review source change impact',
      signals: [s, ...signals.filter((x) => x.type === 'STALE_RESEARCH')].slice(0, 6)
    });
  }

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

  for (const s of signals.filter((x) => x.type === 'RESEARCH_CONFLICT')) {
    candidates.push({
      action: 'REVIEW_SOURCE',
      entityId: s.entityId,
      articleId: s.articleId,
      title: 'Resolve research conflict',
      signals: [s]
    });
  }

  for (const s of signals.filter((x) => x.type === 'FAILED_OPERATION')) {
    candidates.push({
      action: 'RETRY_OPERATION',
      entityId: s.entityId,
      title: 'Retry failed operation',
      signals: [s]
    });
  }

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

  if (signals.some((s) => s.type === 'PERF_NEEDS_SYNC')) {
    candidates.push({
      action: 'SYNC_PERFORMANCE',
      title: 'Sync performance data',
      signals: signals.filter((s) => s.type === 'PERF_NEEDS_SYNC')
    });
  }

  for (const s of signals.filter((x) => x.type === 'CONTENT_GAP')) {
    candidates.push(resolveCreateVsUpdate(siteId, s, signals, titleOf));
  }

  for (const s of signals.filter((x) => x.type === 'PUBLISHING_BLOCKER')) {
    candidates.push({
      action: 'REVIEW_CONTENT',
      entityId: s.entityId,
      articleId: s.articleId,
      title: 'Resolve publishing blocker',
      signals: [s]
    });
  }

  // Explicit DEFER when nothing actionable beyond weak/insufficient signals.
  const actionable = candidates.filter((c) => c.action !== 'DEFER');
  if (!actionable.length) {
    candidates.push({
      action: 'DEFER',
      title: 'Defer — insufficient actionable evidence',
      signals: signals.slice(0, 4)
    });
  }

  return candidates;
}

/**
 * CREATE_ARTICLE vs UPDATE_ARTICLE using existing content intelligence (no embeddings).
 * Always merge article-scoped signals so conflict/canni/stale guards still run.
 */
function resolveCreateVsUpdate(
  siteId: string,
  gapSignal: DecisionSignal,
  allSignals: DecisionSignal[],
  titleOf: (id?: string | number) => string
): Candidate {
  const index = getContentIndex(siteId);
  const gap = (index.gaps || []).find((g) => g.id === gapSignal.entityId);
  const topic = String(
    gap?.topic || gapSignal.metadata?.topic || gapSignal.evidence[1] || gapSignal.evidence[0] || ''
  ).trim();
  const articleId = gap?.articleId ?? gapSignal.articleId;

  const withArticleSignals = (aid: string | number, extra: DecisionSignal[] = []): DecisionSignal[] => {
    const articleSignals = signalsForArticle(allSignals, aid);
    // Site-level research conflicts have no articleId — still must block updates.
    const siteConflicts = allSignals.filter(
      (s) =>
        s.type === 'RESEARCH_CONFLICT' &&
        (s.severity === 'HIGH' || s.severity === 'CRITICAL')
    );
    const byId = new Map<string, DecisionSignal>();
    for (const s of [...extra, gapSignal, ...articleSignals, ...siteConflicts]) {
      byId.set(s.id || `${s.type}:${s.entityId}:${s.articleId}`, s);
    }
    return Array.from(byId.values());
  };

  const blockedByConflict = (aid: string | number, merged: DecisionSignal[]): Candidate | null => {
    const conflict = merged.find(
      (s) =>
        s.type === 'RESEARCH_CONFLICT' && (s.severity === 'HIGH' || s.severity === 'CRITICAL')
    );
    if (!conflict) return null;
    return {
      action: 'REVIEW_SOURCE',
      // Same article key as article-loop so seen/key dedupes UPDATE vs REVIEW.
      articleId: aid,
      entityId: String(aid),
      title: `Review conflict before update: ${titleOf(aid)}`,
      signals: merged,
      topic
    };
  };

  if (articleId != null) {
    const merged = withArticleSignals(articleId);
    const blocked = blockedByConflict(articleId, merged);
    if (blocked) return blocked;
    return {
      action: 'UPDATE_ARTICLE',
      articleId,
      entityId: String(articleId),
      title: `Update outdated: ${titleOf(articleId)}`,
      signals: merged,
      topic
    };
  }

  if (!topic) {
    return {
      action: 'DEFER',
      entityId: gapSignal.entityId,
      title: 'Defer content gap — topic unknown',
      signals: [gapSignal]
    };
  }

  if (!index.articles?.length) {
    return {
      action: 'CREATE_ARTICLE',
      entityId: gapSignal.entityId,
      title: `Content gap: ${topic}`,
      signals: [gapSignal],
      topic
    };
  }

  const canni = evaluateCannibalization({
    siteId,
    title: topic,
    articles: index.articles
  });

  if (
    canni.decision === 'update_existing' ||
    canni.decision === 'merge_with_existing' ||
    canni.decision === 'do_not_create'
  ) {
    const matchId = canni.matchedArticles[0]?.id;
    if (matchId != null) {
      const canniSignal: DecisionSignal = {
        ...gapSignal,
        id: `${gapSignal.id}-canni`,
        type: 'CANNIBALIZATION_RISK',
        entityType: 'cluster',
        articleId: matchId,
        severity: canni.cannibalizationRisk === 'severe' ? 'HIGH' : 'MEDIUM',
        strength: Math.max(0.1, Math.min(1, canni.similarityScore / 100)),
        confidence: gapSignal.confidence,
        evidence: [canni.decisionReason, canni.verdictMessage].filter(Boolean),
        source: 'intelligence.duplication'
      };
      const merged = withArticleSignals(matchId, [canniSignal]);
      const blocked = blockedByConflict(matchId, merged);
      if (blocked) return blocked;
      return {
        action: 'UPDATE_ARTICLE',
        articleId: matchId,
        entityId: String(matchId),
        title: `Update existing coverage: ${titleOf(matchId)}`,
        signals: merged,
        topic
      };
    }
    return {
      action: 'REVIEW_CONTENT',
      entityId: gapSignal.entityId,
      title: `Review overlap before create: ${topic}`,
      signals: [gapSignal],
      topic
    };
  }

  if (canni.cannibalizationRisk === 'severe') {
    return {
      action: 'REVIEW_CONTENT',
      entityId: gapSignal.entityId,
      title: `Review severe overlap: ${topic}`,
      signals: [gapSignal],
      topic
    };
  }

  return {
    action: 'CREATE_ARTICLE',
    entityId: gapSignal.entityId,
    title: `Content gap: ${topic}`,
    signals: [gapSignal],
    topic
  };
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
        staleSessions: sessions.filter((s) => s.status === 'STALE' || s.status === 'INVALIDATED')
          .length,
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

/** @deprecated Prefer reEvaluateRecommendation */
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
    reason: match.explanation.whyNow || match.explanation.summary,
    decision: match,
    nextAction: match.recommendedAction
  };
}

/**
 * Spec API: re-evaluate a canonical recommendation against current signals.
 */
export function reEvaluateRecommendation(
  siteId: string,
  recommendationId: string
): {
  recommendationId: string;
  stillNeeded: boolean;
  reason: string;
  decision: Decision | null;
  status?: string;
  explanation?: ReturnType<typeof explainDecision>;
} {
  const rec = getRecommendation(siteId, recommendationId);
  if (!rec || rec.siteId !== siteId) {
    throw new Error('Recommendation not found');
  }

  const still = isRecommendationStillNeeded(siteId, rec);
  if (!still.stillNeeded) {
    const updated =
      updateRecommendationStatus(siteId, rec.id, 'EXPIRED', {
        metadata: {
          expiredReason: still.reason,
          expiredAt: new Date().toISOString(),
          lastEvaluatedAt: new Date().toISOString()
        }
      }) || rec;
    return {
      recommendationId: updated.id,
      stillNeeded: false,
      reason: still.reason,
      decision: null,
      status: updated.status
    };
  }

  const evalResult = reevaluateDecisionForRecommendation(siteId, rec);
  if (!evalResult.stillNeeded) {
    const updated =
      updateRecommendationStatus(siteId, rec.id, 'EXPIRED', {
        metadata: {
          expiredReason: evalResult.reason,
          expiredAt: new Date().toISOString(),
          lastEvaluatedAt: new Date().toISOString()
        }
      }) || rec;
    return {
      recommendationId: updated.id,
      stillNeeded: false,
      reason: evalResult.reason,
      decision: evalResult.decision,
      status: updated.status
    };
  }

  if (evalResult.decision) {
    updateRecommendationStatus(siteId, rec.id, rec.status, {
      metadata: {
        decisionId: evalResult.decision.id,
        decisionType: evalResult.decision.recommendedAction,
        score: evalResult.decision.score,
        confidence: evalResult.decision.confidence,
        expectedImpact: evalResult.decision.expectedImpact,
        effort: evalResult.decision.effort,
        blockers: evalResult.decision.blockers,
        evidence: evalResult.decision.reasons,
        lastEvaluatedAt: new Date().toISOString(),
        decisionVersion: evalResult.decision.decisionEngineVersion
      }
    });
  }

  return {
    recommendationId: rec.id,
    stillNeeded: true,
    reason: evalResult.reason,
    decision: evalResult.decision,
    status: rec.status,
    explanation: evalResult.decision ? explainDecision(evalResult.decision) : undefined
  };
}

export { mapActionToRecommendationType };

/** Canonical next-best-actions API for Ops UI and future AI Content Agent. */
export function getNextBestActions(
  siteId: string,
  limitOrOpts: number | { persist?: boolean; topN?: number; limit?: number } = 5
): {
  siteId: string;
  generatedAt: string;
  nextBest: Decision | null;
  actions: Decision[];
  decisionEngineVersion: number;
} {
  const opts =
    typeof limitOrOpts === 'number'
      ? { persist: false, topN: limitOrOpts }
      : {
          persist: limitOrOpts.persist === true,
          topN: limitOrOpts.limit ?? limitOrOpts.topN ?? 5
        };
  const result = runDecisionEngine(siteId, opts);
  return {
    siteId,
    generatedAt: result.generatedAt,
    nextBest: result.nextBest,
    actions: result.topActions,
    decisionEngineVersion: result.decisionEngineVersion
  };
}
