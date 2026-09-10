import type { JobError } from './types.js';

export class OpsJobError extends Error {
  code: string;
  retryable: boolean;
  stage?: string;
  provider?: string;

  constructor(params: { code: string; message: string; retryable?: boolean; stage?: string; provider?: string }) {
    super(params.message);
    this.name = 'OpsJobError';
    this.code = params.code;
    this.retryable = params.retryable !== false;
    this.stage = params.stage;
    this.provider = params.provider;
  }

  toJobError(): JobError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      stage: this.stage,
      provider: this.provider
    };
  }
}

export function toJobError(err: unknown, fallbackCode = 'job_failed'): JobError {
  if (err instanceof OpsJobError) return err.toJobError();
  const anyErr = err as any;
  const message = String(anyErr?.message || 'unknown error');
  const retryable =
    anyErr?.retryable === true ||
    /timeout|ECONNRESET|ETIMEDOUT|5\d\d|temporar|network|rate.?limit/i.test(message);
  const nonRetryable =
    /credential|invalid|validation|unsupported|blocked|SSRF|لغو|gate|مسدود/i.test(message) ||
    anyErr?.retryable === false;
  return {
    code: anyErr?.errorCode || anyErr?.code || fallbackCode,
    message,
    retryable: nonRetryable ? false : retryable,
    stage: anyErr?.stage,
    provider: anyErr?.provider
  };
}

/** Strip secrets from payloads before persistence. */
export function sanitizeJobPayload(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const blocked = new Set([
    'password',
    'applicationPassword',
    'apiKey',
    'api_key',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'GEMINI_API_KEY'
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (blocked.has(key) || /password|secret|token|apikey/i.test(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeJobPayload(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}
