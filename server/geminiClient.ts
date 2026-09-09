import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

export function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }
  return aiClient;
}

export const TEXT_MODEL_CANDIDATES = [
  process.env.GEMINI_TEXT_MODEL,
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash'
].filter(Boolean) as string[];

export const IMAGE_MODEL_CANDIDATES = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image'
].filter(Boolean) as string[];

export function extractJson(raw: string): unknown {
  if (!raw) return null;
  const attempts = [
    raw.trim(),
    raw.replace(/^```json\s*/gi, '').replace(/^```\s*/gi, '').replace(/\s*```$/gi, '').trim()
  ];
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    attempts.push(raw.substring(first, last + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      // JSON.parse is expected to fail on partial Gemini output; try the next candidate.
      if (!(err instanceof SyntaxError)) {
        throw err;
      }
    }
  }
  return null;
}

export class GeminiCallError extends Error {
  stage: string;
  errorCode: string;
  retryable: boolean;
  model?: string;

  constructor(message: string, options: { stage: string; errorCode: string; retryable?: boolean; model?: string }) {
    super(message);
    this.name = 'GeminiCallError';
    this.stage = options.stage;
    this.errorCode = options.errorCode;
    this.retryable = options.retryable !== false;
    this.model = options.model;
  }
}

export function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const msg = parsed?.error?.message;
      if (typeof msg === 'string' && msg.trim()) {
        if (/location is not supported/i.test(msg)) {
          return 'Gemini API is not available from this server location.';
        }
        if (/exceeded your current quota|RESOURCE_EXHAUSTED/i.test(msg)) {
          return 'Gemini image quota exceeded. Retry later or check billing.';
        }
        return msg.split('\n')[0];
      }
    } catch (parseErr) {
      if (!(parseErr instanceof SyntaxError)) throw parseErr;
    }
  }
  return raw;
}

function isRetryableGeminiError(err: unknown): boolean {
  const message = formatGeminiError(err);
  return /429|RESOURCE_EXHAUSTED|unavailable|503|500|timeout|ECONNRESET|quota exceeded/i.test(message);
}

export async function generateGeminiText(params: {
  prompt: string;
  systemInstruction?: string;
  responseMimeType?: string;
  models?: string[];
  stage: string;
}): Promise<{ text: string; modelUsed: string }> {
  const ai = getAI();
  if (!ai) {
    throw new GeminiCallError('GEMINI_API_KEY is not configured on the server.', {
      stage: params.stage,
      errorCode: 'missing_api_key',
      retryable: false
    });
  }

  const models = params.models?.length ? params.models : TEXT_MODEL_CANDIDATES;
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const config: Record<string, unknown> = {};
      if (params.systemInstruction) config.systemInstruction = params.systemInstruction;
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;

      const result = await ai.models.generateContent({
        model,
        contents: params.prompt,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      const text = (result.text || '').trim();
      if (text) {
        return { text, modelUsed: model };
      }
      lastError = new Error(`Model ${model} returned empty text.`);
    } catch (err) {
      lastError = err;
      console.warn(`[gemini:${params.stage}] model ${model} failed:`, err instanceof Error ? err.message : err);
      if (!isRetryableGeminiError(err)) {
        break;
      }
    }
  }

  const message = formatGeminiError(lastError) || 'Gemini text generation failed.';
  throw new GeminiCallError(message, {
    stage: params.stage,
    errorCode: 'text_generation_failed',
    retryable: isRetryableGeminiError(lastError)
  });
}

export async function generateGeminiJson<T>(params: {
  prompt: string;
  systemInstruction?: string;
  models?: string[];
  stage: string;
  contents?: unknown;
}): Promise<{ data: T; modelUsed: string; raw: string }> {
  const ai = getAI();
  if (!ai) {
    throw new GeminiCallError('GEMINI_API_KEY is not configured on the server.', {
      stage: params.stage,
      errorCode: 'missing_api_key',
      retryable: false
    });
  }

  const models = params.models?.length ? params.models : TEXT_MODEL_CANDIDATES;
  let lastError: unknown = null;

  for (const model of models) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: (params.contents as never) || params.prompt,
        config: {
          responseMimeType: 'application/json',
          ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {})
        }
      });

      const raw = (result.text || '').trim();
      const parsed = extractJson(raw) as T | null;
      if (parsed && typeof parsed === 'object') {
        return { data: parsed, modelUsed: model, raw };
      }
      lastError = new Error(`Model ${model} returned JSON that could not be parsed.`);
    } catch (err) {
      lastError = err;
      console.warn(`[gemini:${params.stage}] model ${model} failed:`, err instanceof Error ? err.message : err);
      if (!isRetryableGeminiError(err)) {
        break;
      }
    }
  }

  const message = formatGeminiError(lastError) || 'Gemini JSON generation failed.';
  throw new GeminiCallError(message, {
    stage: params.stage,
    errorCode: 'json_generation_failed',
    retryable: isRetryableGeminiError(lastError)
  });
}
