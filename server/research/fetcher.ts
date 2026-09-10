import crypto from 'crypto';
import { assertSafeResolvedHost, validateResearchUrl } from './urlSafety.js';
import type { ResearchSourceDocument, ResearchSourceKind, SourceFreshness } from './types.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 1_500_000; // ~1.5MB

function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function sourceId(siteId: string, url: string): string {
  return `src-${crypto.createHash('sha1').update(`${siteId}::${url}`).digest('hex').slice(0, 12)}`;
}

export function stripHtmlToText(html: string): { title: string; text: string } {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const titleMatch = withoutScripts.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities((titleMatch?.[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 300);
  const text = decodeEntities(
    withoutScripts
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).slice(0, 80_000);
  return { title: title || 'بدون عنوان', text };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function classifyFreshness(params: {
  publishedAt?: string;
  modifiedAt?: string;
  fetchedAt: string;
  freshnessRequirement: 'high' | 'medium' | 'low';
}): SourceFreshness {
  const anchor = params.modifiedAt || params.publishedAt;
  if (!anchor) return 'UNKNOWN';
  const ageDays = (new Date(params.fetchedAt).getTime() - new Date(anchor).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 'UNKNOWN';
  if (params.freshnessRequirement === 'high') {
    if (ageDays <= 30) return 'CURRENT';
    if (ageDays <= 180) return 'RECENT';
    return 'STALE';
  }
  if (params.freshnessRequirement === 'medium') {
    if (ageDays <= 180) return 'CURRENT';
    if (ageDays <= 730) return 'RECENT';
    return 'STALE';
  }
  if (ageDays <= 3650) return 'CURRENT';
  return 'RECENT';
}

export function inferSourceType(url: string, contentType?: string): ResearchSourceKind {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (/\.(gov|gob|gouv)\./.test(host) || host.endsWith('.gov')) return 'GOVERNMENT';
  if (/\.edu$|\.ac\./.test(host)) return 'ACADEMIC';
  if (/wikipedia\.|reddit\.|forum|community/.test(host)) return 'COMMUNITY';
  if (/manufacturer|official|brand/.test(host)) return 'PRODUCT_MANUFACTURER';
  if (contentType && !/html|text|xml/i.test(contentType)) return 'UNKNOWN';
  return 'UNKNOWN';
}

export async function fetchResearchUrl(params: {
  siteId: string;
  url: string;
  freshnessRequirement?: 'high' | 'medium' | 'low';
  fetchImpl?: typeof fetch;
}): Promise<ResearchSourceDocument> {
  const fetchedAt = new Date().toISOString();
  const validation = validateResearchUrl(params.url);
  if (!validation.ok || !validation.url) {
    return {
      id: sourceId(params.siteId, params.url),
      siteId: params.siteId,
      url: params.url,
      title: '',
      domain: '',
      sourceType: 'UNKNOWN',
      fetchedAt,
      content: '',
      contentHash: contentHash(''),
      status: 'blocked',
      freshness: 'UNKNOWN',
      error: validation.reason || 'URL نامعتبر'
    };
  }

  const target = validation.url;
  try {
    await assertSafeResolvedHost(target.hostname);
  } catch (err: any) {
    return {
      id: sourceId(params.siteId, target.toString()),
      siteId: params.siteId,
      url: target.toString(),
      title: '',
      domain: target.hostname,
      sourceType: 'UNKNOWN',
      fetchedAt,
      content: '',
      contentHash: contentHash(''),
      status: 'blocked',
      freshness: 'UNKNOWN',
      error: err?.message || 'میزبان مسدود است'
    };
  }

  const fetchImpl = params.fetchImpl || fetch;
  let current = target;
  let response: Response | null = null;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'User-Agent': 'BlogManagerResearchBot/1.0 (+local; evidence fetch)'
        }
      });
    } catch (err: any) {
      clearTimeout(timer);
      return {
        id: sourceId(params.siteId, target.toString()),
        siteId: params.siteId,
        url: target.toString(),
        title: '',
        domain: target.hostname,
        sourceType: 'UNKNOWN',
        fetchedAt,
        content: '',
        contentHash: contentHash(''),
        status: 'failed',
        freshness: 'UNKNOWN',
        error: err?.name === 'AbortError' ? 'مهلت دریافت به پایان رسید.' : err?.message || 'دریافت ناموفق'
      };
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) {
        return {
          id: sourceId(params.siteId, target.toString()),
          siteId: params.siteId,
          url: target.toString(),
          title: '',
          domain: target.hostname,
          sourceType: 'UNKNOWN',
          fetchedAt,
          content: '',
          contentHash: contentHash(''),
          status: 'failed',
          freshness: 'UNKNOWN',
          error: 'هدایت بیش از حد یا بدون location'
        };
      }
      const next = new URL(location, current);
      const nextValidation = validateResearchUrl(next.toString());
      if (!nextValidation.ok || !nextValidation.url) {
        return {
          id: sourceId(params.siteId, target.toString()),
          siteId: params.siteId,
          url: target.toString(),
          title: '',
          domain: target.hostname,
          sourceType: 'UNKNOWN',
          fetchedAt,
          content: '',
          contentHash: contentHash(''),
          status: 'blocked',
          freshness: 'UNKNOWN',
          error: nextValidation.reason || 'هدایت به URL نامعتبر'
        };
      }
      await assertSafeResolvedHost(nextValidation.url.hostname);
      current = nextValidation.url;
      continue;
    }
    break;
  }

  if (!response) {
    return {
      id: sourceId(params.siteId, target.toString()),
      siteId: params.siteId,
      url: target.toString(),
      title: '',
      domain: target.hostname,
      sourceType: 'UNKNOWN',
      fetchedAt,
      content: '',
      contentHash: contentHash(''),
      status: 'failed',
      freshness: 'UNKNOWN',
      error: 'پاسخی دریافت نشد'
    };
  }

  if (!response.ok) {
    return {
      id: sourceId(params.siteId, target.toString()),
      siteId: params.siteId,
      url: current.toString(),
      title: '',
      domain: current.hostname,
      sourceType: 'UNKNOWN',
      fetchedAt,
      content: '',
      contentHash: contentHash(''),
      status: 'failed',
      freshness: 'UNKNOWN',
      error: `HTTP ${response.status}`,
      rawContentType: response.headers.get('content-type') || undefined
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml\+xml|text\/plain|application\/xml|text\/xml/i.test(contentType)) {
    return {
      id: sourceId(params.siteId, current.toString()),
      siteId: params.siteId,
      url: current.toString(),
      title: '',
      domain: current.hostname,
      sourceType: 'UNKNOWN',
      fetchedAt,
      content: '',
      contentHash: contentHash(''),
      status: 'unsupported_type',
      freshness: 'UNKNOWN',
      error: `نوع محتوا پشتیبانی نمی‌شود: ${contentType || 'نامشخص'}`,
      rawContentType: contentType
    };
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_BYTES) {
    return {
      id: sourceId(params.siteId, current.toString()),
      siteId: params.siteId,
      url: current.toString(),
      title: '',
      domain: current.hostname,
      sourceType: 'UNKNOWN',
      fetchedAt,
      content: '',
      contentHash: contentHash(''),
      status: 'failed',
      freshness: 'UNKNOWN',
      error: 'حجم پاسخ بیش از حد مجاز است.',
      byteLength: contentLength
    };
  }

  const reader = response.body?.getReader?.();
  let raw = '';
  if (reader) {
    const decoder = new TextDecoder();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return {
          id: sourceId(params.siteId, current.toString()),
          siteId: params.siteId,
          url: current.toString(),
          title: '',
          domain: current.hostname,
          sourceType: 'UNKNOWN',
          fetchedAt,
          content: '',
          contentHash: contentHash(''),
          status: 'failed',
          freshness: 'UNKNOWN',
          error: 'حجم پاسخ بیش از حد مجاز است.',
          byteLength: size
        };
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } else {
    raw = await response.text();
    if (raw.length > MAX_BYTES) {
      return {
        id: sourceId(params.siteId, current.toString()),
        siteId: params.siteId,
        url: current.toString(),
        title: '',
        domain: current.hostname,
        sourceType: 'UNKNOWN',
        fetchedAt,
        content: '',
        contentHash: contentHash(''),
        status: 'failed',
        freshness: 'UNKNOWN',
        error: 'حجم پاسخ بیش از حد مجاز است.',
        byteLength: raw.length
      };
    }
  }

  const { title, text } = /html|xml/i.test(contentType) ? stripHtmlToText(raw) : { title: current.hostname, text: raw.slice(0, 80_000) };
  const sourceType = inferSourceType(current.toString(), contentType);

  return {
    id: sourceId(params.siteId, current.toString()),
    siteId: params.siteId,
    url: current.toString(),
    title,
    domain: current.hostname,
    sourceType,
    publisher: current.hostname,
    fetchedAt,
    language: undefined,
    content: text,
    contentHash: contentHash(text),
    status: 'ok',
    freshness: classifyFreshness({
      fetchedAt,
      freshnessRequirement: params.freshnessRequirement || 'medium'
    }),
    rawContentType: contentType,
    byteLength: Buffer.byteLength(raw, 'utf8')
  };
}
