import { GeminiCallError } from '../geminiClient.js';

/**
 * Deterministic validators for structured Gemini output. Gemini is asked for
 * JSON, but nothing it returns is trusted: every field is coerced or rejected
 * here so malformed AI responses produce a controlled error instead of leaking
 * `undefined` into the pipeline.
 */

export class AiSchemaError extends Error {
  field: string;
  received: unknown;

  constructor(message: string, field: string, received?: unknown) {
    super(message);
    this.name = 'AiSchemaError';
    this.field = field;
    this.received = received;
  }
}

export function schemaFailure(stage: string, err: unknown): GeminiCallError {
  const field = err instanceof AiSchemaError ? ` (field: ${err.field})` : '';
  const message = err instanceof Error ? err.message : String(err);
  return new GeminiCallError(`Gemini returned data that failed validation${field}: ${message}`, {
    stage,
    errorCode: 'invalid_ai_schema',
    retryable: true
  });
}

export function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiSchemaError(`Expected an object`, field, value);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, field: string, opts: { minLength?: number } = {}): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AiSchemaError(`Expected a non-empty string`, field, value);
  }
  const trimmed = value.trim();
  if (opts.minLength && trimmed.length < opts.minLength) {
    throw new AiSchemaError(`Expected at least ${opts.minLength} characters`, field, trimmed.length);
  }
  return trimmed;
}

export function optionalString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim() || fallback;
}

export function stringArray(
  value: unknown,
  opts: { max?: number; minItems?: number; field?: string } = {}
): string[] {
  if (value == null) {
    if (opts.minItems) throw new AiSchemaError(`Expected at least ${opts.minItems} items`, opts.field || 'array', value);
    return [];
  }
  if (!Array.isArray(value)) {
    throw new AiSchemaError(`Expected an array of strings`, opts.field || 'array', value);
  }
  const cleaned = value
    .filter((item) => typeof item === 'string')
    .map((item) => (item as string).trim())
    .filter(Boolean);
  if (opts.minItems && cleaned.length < opts.minItems) {
    throw new AiSchemaError(`Expected at least ${opts.minItems} items`, opts.field || 'array', cleaned.length);
  }
  return opts.max ? cleaned.slice(0, opts.max) : cleaned;
}

export function objectArray(
  value: unknown,
  field: string,
  opts: { max?: number } = {}
): Record<string, unknown>[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new AiSchemaError(`Expected an array of objects`, field, value);
  }
  const rows = value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<
    string,
    unknown
  >[];
  return opts.max ? rows.slice(0, opts.max) : rows;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const hit = allowed.find((option) => option.toLowerCase() === normalized);
    if (hit) return hit;
  }
  return fallback;
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const hit = allowed.find((option) => option.toLowerCase() === normalized);
    if (hit) return hit;
  }
  throw new AiSchemaError(`Expected one of: ${allowed.join(', ')}`, field, value);
}

export function boundedNumber(
  value: unknown,
  opts: { min: number; max: number; fallback: number }
): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return opts.fallback;
  return Math.min(opts.max, Math.max(opts.min, Math.round(num)));
}
