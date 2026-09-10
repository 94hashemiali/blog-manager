import { isIP } from 'net';
import dns from 'dns/promises';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal', 'metadata']);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80')
    ) {
      return true;
    }
    // IPv4-mapped forms: ::ffff:127.0.0.1 or ::ffff:7f00:1
    const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (dotted) return isPrivateIpv4(dotted[1]);
    const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIpv4(
        `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
      );
    }
    return false;
  }
  return true;
}

export interface UrlValidationResult {
  ok: boolean;
  url?: URL;
  reason?: string;
}

/**
 * Validates a research URL before any network I/O. Blocks non-http(s),
 * credentials-in-URL, and obvious local/metadata hosts. DNS resolution for
 * private IPs happens in assertSafeResolvedHost.
 */
export function validateResearchUrl(raw: string): UrlValidationResult {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: false, reason: 'URL خالی است.' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'URL نامعتبر است.' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: 'فقط http و https مجاز است.' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URL با نام کاربری/رمز مجاز نیست.' };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, reason: 'میزبان خالی است.' };
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { ok: false, reason: 'دسترسی به میزبان‌های محلی مسدود است.' };
  }
  if (isIP(host) && isPrivateOrLocalIp(host)) {
    return { ok: false, reason: 'آدرس IP خصوصی/محلی مسدود است.' };
  }

  return { ok: true, url: parsed };
}

export async function assertSafeResolvedHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isPrivateOrLocalIp(host)) throw new Error('آدرس IP خصوصی/محلی مسدود است.');
    return;
  }
  let records: string[] = [];
  try {
    const result = await dns.lookup(host, { all: true });
    records = result.map((row) => row.address);
  } catch {
    throw new Error('نام میزبان قابل resolve نیست.');
  }
  if (records.length === 0) throw new Error('نام میزبان قابل resolve نیست.');
  for (const address of records) {
    if (isPrivateOrLocalIp(address)) {
      throw new Error('میزبان به شبکهٔ خصوصی resolve می‌شود و مسدود است.');
    }
  }
}
