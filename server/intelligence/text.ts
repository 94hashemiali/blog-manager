const STOP = new Set([
  'در', 'به', 'از', 'که', 'این', 'رو', 'با', 'برای', 'آن', 'یک', 'تا', 'بر', 'یا', 'را', 'است', 'های', 'ها',
  'the', 'a', 'an', 'in', 'on', 'at', 'of', 'for', 'with', 'and', 'or', 'is', 'to', 'vs'
]);

export function stripHtml(input: string): string {
  return (input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(text: string): string {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): Set<string> {
  return new Set(
    normalizeTitle(text)
      .split(' ')
      .filter((w) => w.length > 1 && !STOP.has(w))
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter++;
  return (inter / (a.size + b.size - inter)) * 100;
}

export function tokenOverlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const item of a) if (b.has(item)) n++;
  return n;
}

export function inferIntent(title: string, content = ''): 'informational' | 'commercial' | 'transactional' | 'navigational' {
  const text = `${title} ${content}`.toLowerCase();
  if (/قیمت|خرید|فروش|سفارش/.test(text)) return 'transactional';
  if (/بهترین|راهنمای خرید|مقایسه|بررسی|انتخاب/.test(text)) return 'commercial';
  if (/چطور|چگونه|آموزش|نحوه|روش/.test(text)) return 'informational';
  return 'informational';
}

export function inferArticleKind(title: string, content = ''): import('./types.js').ArticleKind {
  const text = `${title} ${content}`.toLowerCase();
  if (/تفاوت|مقایسه|\bvs\b|در برابر/.test(text)) return 'comparison';
  if (/چطور|چگونه|نحوه|گام به گام/.test(text)) return 'how_to';
  if (/آموزش|روش صحیح|tutorial/.test(text)) return 'tutorial';
  if (/بررسی|نقد|review/.test(text)) return 'product_review';
  if (/راهنما|خرید|بهترین/.test(text)) return 'buying_guide';
  if (/فنی|مشخصات/.test(text)) return 'technical';
  if (/\d+\s*(نکته|قلم|راه)|لیست/.test(text)) return 'list';
  return 'informational';
}

export function inferPrimaryKeyword(title: string): string {
  return stripHtml(title).replace(/راهنمای|جامع|بهترین|آموزش|نکات/g, '').replace(/\s+/g, ' ').trim() || stripHtml(title);
}
