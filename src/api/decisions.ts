/** Re-export + legacy paths for callers still importing decisions.ts */
export {
  getNextBestActions,
  getDecision,
  getDecisionHistory,
  executeDecision,
  reevaluateDecision,
  getDecisions
} from './decision';

export async function getDecisionDetail(siteId: string, decisionId: string) {
  const { getDecision } = await import('./decision');
  return getDecision(siteId, decisionId);
}

export async function getArticleDecisions(siteId: string, articleId: string | number) {
  const data = await fetch(
    `/api/decisions/${encodeURIComponent(siteId)}/article/${encodeURIComponent(String(articleId))}`
  );
  const json = await data.json().catch(() => ({}));
  if (!data.ok || json.success === false) {
    throw new Error(json?.error?.message || json?.message || `HTTP ${data.status}`);
  }
  return json;
}

export async function batchExecuteRecommendations(siteId: string, recommendationIds: string[]) {
  const data = await fetch(`/api/decisions/${encodeURIComponent(siteId)}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recommendationIds })
  });
  const json = await data.json().catch(() => ({}));
  if (!data.ok || json.success === false) {
    throw new Error(json?.error?.message || json?.message || `HTTP ${data.status}`);
  }
  return json;
}
