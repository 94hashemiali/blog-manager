import type { Response } from 'express';

export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
}

export function apiSuccess<T extends Record<string, unknown>>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

export function apiFail(
  res: Response,
  status: number,
  error: { code: string; message: string; retryable?: boolean },
  extra: Record<string, unknown> = {}
) {
  const body: { success: false; error: ApiErrorBody; message: string } & Record<string, unknown> = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: Boolean(error.retryable)
    },
    message: error.message,
    ...extra
  };
  return res.status(status).json(body);
}

/** Strip secrets from ManagedSite-like objects before sending to clients. */
export function sanitizeSite(site: any) {
  if (!site) return site;
  return {
    ...site,
    wordpress: {
      baseUrl: site.wordpress?.baseUrl || site.url,
      username: site.wordpress?.username || '',
      hasPassword: Boolean(site.wordpress?.applicationPassword || site.wordpress?.hasPassword)
    }
  };
}
