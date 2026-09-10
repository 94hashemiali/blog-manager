import type { NormalizedArticle } from './types.js';
import { inferPrimaryKeyword, stripHtml } from './text.js';

function decode(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function normalizeWordpressHtml(
  title: string,
  html: string,
  extras?: { category?: string; tags?: string[]; siteBaseUrl?: string }
): NormalizedArticle {
  const raw = html || '';
  const withoutChrome = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');

  const headings: string[] = [];
  for (const match of withoutChrome.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const h = stripHtml(match[1]);
    if (h) headings.push(h);
  }
  for (const match of withoutChrome.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    headings.push(match[1].trim());
  }

  const paragraphs: string[] = [];
  for (const match of withoutChrome.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const p = stripHtml(match[1]);
    if (p.length > 40) paragraphs.push(p.slice(0, 600));
  }
  if (paragraphs.length === 0) {
    const plain = stripHtml(withoutChrome);
    const parts = plain.split(/(?<=[.!?؟])\s+/).filter((p) => p.length > 40);
    paragraphs.push(...parts.slice(0, 8).map((p) => p.slice(0, 600)));
  }

  const lists: string[] = [];
  for (const match of withoutChrome.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const item = stripHtml(match[1]);
    if (item) lists.push(item.slice(0, 240));
  }

  const tables: string[] = [];
  if (/<table/i.test(withoutChrome)) tables.push('table_present');

  const faq: { question: string; answer: string }[] = [];
  const faqBlock = withoutChrome.match(/سوالات متداول[\s\S]{0,4000}/i);
  if (faqBlock) {
    for (const match of faqBlock[0].matchAll(/<h[3-4][^>]*>([\s\S]*?)<\/h[3-4]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      faq.push({ question: stripHtml(match[1]), answer: stripHtml(match[2]).slice(0, 400) });
    }
  }

  const siteHost = hostnameOf(extras?.siteBaseUrl);
  const links: NormalizedArticle['links'] = [];
  for (const match of withoutChrome.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (!href || href.startsWith('#')) continue;
    links.push({
      href,
      text,
      internal: isInternalHref(href, siteHost)
    });
  }

  const productMentions: string[] = [];
  const catalog: Array<[RegExp, string]> = [
    [/چادر|tent/i, 'tent'],
    [/کوله|backpack/i, 'backpack'],
    [/باتوم|trekking pole/i, 'trekking_pole'],
    [/کفش|پوتین|boot/i, 'hiking_boot'],
    [/کیسه خواب|sleeping bag/i, 'sleeping_bag'],
    [/سرشعله|stove/i, 'camp_stove'],
    [/زیرانداز|sleeping pad/i, 'sleeping_pad'],
    [/وایبر|vibram/i, 'vibram'],
    [/گورتکس|gore-?tex/i, 'goretex']
  ];
  const blob = `${title} ${stripHtml(withoutChrome)}`;
  for (const [re, id] of catalog) {
    if (re.test(blob)) productMentions.push(id);
  }

  const entities = Array.from(
    new Set(
      [...headings, ...productMentions, ...(extras?.tags || [])]
        .map((e) => decode(String(e)))
        .filter((e) => e.length > 2)
    )
  ).slice(0, 24);

  const keywords = Array.from(
    new Set([inferPrimaryKeyword(title), ...(extras?.tags || []), ...productMentions.map((p) => p.replace(/_/g, ' '))])
  ).filter(Boolean);

  return {
    title: stripHtml(title),
    headings: Array.from(new Set(headings)).slice(0, 16),
    paragraphs: paragraphs.slice(0, 12),
    lists: lists.slice(0, 16),
    tables,
    faq: faq.slice(0, 8),
    links: links.slice(0, 30),
    productMentions,
    entities,
    keywords,
    category: extras?.category,
    tags: extras?.tags || [],
    plainText: stripHtml(withoutChrome).slice(0, 8000)
  };
}

function hostnameOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return undefined;
  }
}

/** Relative URLs and absolute URLs on the site's own host count as internal. */
function isInternalHref(href: string, siteHost?: string): boolean {
  if (!/^https?:\/\//i.test(href)) return true;
  if (!siteHost) return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '').toLowerCase();
    return host === siteHost || host.endsWith(`.${siteHost}`);
  } catch {
    return false;
  }
}

