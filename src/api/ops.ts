export async function getHealth(siteId?: string) {
  const qs = siteId ? `?siteId=${encodeURIComponent(siteId)}` : '';
  const response = await fetch(`/api/health${qs}`);
  return response.json();
}

export async function getOpsOverview(siteId: string) {
  const response = await fetch(`/api/ops/${siteId}/overview`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error?.message || 'overview failed');
  return data as { success: boolean; overview: any };
}
