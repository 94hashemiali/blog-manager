async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function getDecisions(siteId: string) {
  return parse(await fetch(`/api/decisions/${encodeURIComponent(siteId)}`));
}

export async function getDecisionDetail(siteId: string, decisionId: string) {
  return parse(
    await fetch(
      `/api/decisions/${encodeURIComponent(siteId)}/detail/${encodeURIComponent(decisionId)}`
    )
  );
}

export async function getArticleDecisions(siteId: string, articleId: string | number) {
  return parse(
    await fetch(
      `/api/decisions/${encodeURIComponent(siteId)}/article/${encodeURIComponent(String(articleId))}`
    )
  );
}

export async function batchExecuteRecommendations(siteId: string, recommendationIds: string[]) {
  return parse(
    await fetch(`/api/decisions/${encodeURIComponent(siteId)}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendationIds })
    })
  );
}
