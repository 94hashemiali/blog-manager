async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || data.message || `خطای سرور ${response.status}`;
    const err: any = new Error(message);
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export function getResearchProviders(siteId: string) {
  return request<{ success: boolean; providers: any[]; webSearch: any }>(`/api/research/${siteId}/providers`);
}

export function fetchResearchUrl(siteId: string, url: string, forceRefresh = false) {
  return request<{ success: boolean; source: any; evidence: any[]; fromCache: boolean }>(
    `/api/research/${siteId}/fetch`,
    { method: 'POST', body: JSON.stringify({ url, forceRefresh }) }
  );
}

export function getResearchSession(siteId: string, researchId: string) {
  return request<{ success: boolean; session: any }>(`/api/research/${siteId}/${researchId}`);
}

export function addResearchSource(siteId: string, researchId: string, url: string) {
  return request<{ success: boolean; session: any }>(`/api/research/${siteId}/${researchId}/add-source`, {
    method: 'POST',
    body: JSON.stringify({ url })
  });
}

export function refreshResearchSession(siteId: string, researchId: string) {
  return request<{ success: boolean; session: any; packet: any }>(
    `/api/research/${siteId}/${researchId}/refresh`,
    { method: 'POST', body: '{}' }
  );
}
