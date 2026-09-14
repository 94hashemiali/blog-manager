/** Frontend Decision Engine API — aligned with /api/decision(s). */

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data?.error?.message || data?.message || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

const base = (siteId: string) => `/api/decision/${encodeURIComponent(siteId)}`;

export async function getNextBestActions(siteId: string) {
  return parse(await fetch(`${base(siteId)}/next`));
}

export async function getDecision(siteId: string, decisionId: string) {
  return parse(await fetch(`${base(siteId)}/${encodeURIComponent(decisionId)}`));
}

export async function getDecisionHistory(siteId: string) {
  return parse(await fetch(`${base(siteId)}/history`));
}

export async function executeDecision(siteId: string, decisionId: string) {
  return parse(
    await fetch(`${base(siteId)}/${encodeURIComponent(decisionId)}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  );
}

export async function reevaluateDecision(siteId: string) {
  return parse(
    await fetch(`${base(siteId)}/re-evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
  );
}

/** @deprecated Prefer getNextBestActions / reevaluateDecision */
export async function getDecisions(siteId: string) {
  return parse(await fetch(`/api/decisions/${encodeURIComponent(siteId)}`));
}
