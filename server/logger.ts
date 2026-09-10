type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  siteId?: string;
  operation?: string;
  durationMs?: number;
  result?: string;
  errorCode?: string;
  [key: string]: unknown;
}

const SECRET_KEYS = /password|applicationPassword|api[_-]?key|authorization|token|secret/i;

function redact(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.length > 8 && SECRET_KEYS.test(value)) return '[REDACTED]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.test(key) ? '[REDACTED]' : redact(entry);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, context: LogContext = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...((redact(context) as LogContext) || {})
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context)
};

export function newRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
