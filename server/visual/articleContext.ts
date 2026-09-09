import type {
  ArticleRepresentation,
  ArticleVisualType,
  SiteVisualContext,
  StructuredArticleContext
} from './types.js';

export function stripHtml(input: string): string {
  return (input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferArticleType(title: string, content: string = ''): ArticleVisualType {
  const text = `${title} ${content}`.toLowerCase();
  if (/تفاوت|مقایسه|\bvs\b|یا \s|در برابر|versus|compared/i.test(text)) return 'comparison';
  if (/چطور|چگونه|نحوه|طرز|طریقه|گام به گام|how to|steps/i.test(text)) return 'how_to';
  if (/آموزش|روش صحیح|tutorial/i.test(text)) return 'tutorial';
  if (/بررسی|نقد|تست|review/i.test(text)) return 'product_review';
  if (/راهنما|خرید|بهترین|buying guide|\bbest\b/i.test(text)) return 'buying_guide';
  if (/تجهیزات|equipment guide|gear guide/i.test(text)) return 'equipment_guide';
  if (/مسیر|سفر|طبیعت‌گردی|travel|trek/i.test(text)) return 'travel';
  if (/فنی|ساختار|مشخصات فنی|technical/i.test(text)) return 'technical';
  if (/\d+\s*(نکته|قلم|راه|روش)|لیست|listicle/i.test(text)) return 'list';
  return 'informational';
}

function extractMarkdownHeadings(raw: string): string[] {
  const headings: string[] = [];
  for (const match of raw.matchAll(/^#{2,3}\s+(.+)$/gm)) {
    headings.push(match[1].trim());
  }
  return headings;
}

function extractHtmlHeadings(raw: string): string[] {
  const headings: string[] = [];
  for (const match of raw.matchAll(/<h[2-3][^>]*>([\s\S]*?)<\/h[2-3]>/gi)) {
    headings.push(stripHtml(match[1]));
  }
  return headings;
}

function firstParagraphs(text: string, count: number, maxChars = 1400): string {
  const parts = text
    .split(/(?<=[.!?؟。])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  return parts.slice(0, count).join(' ').slice(0, maxChars);
}

function lastParagraph(text: string, maxChars = 700): string {
  const parts = text
    .split(/(?<=[.!?؟。])\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  return (parts[parts.length - 1] || '').slice(0, maxChars);
}

function extractListItems(raw: string): string[] {
  const items: string[] = [];
  for (const match of raw.matchAll(/^\s*[-*]\s+(.+)$/gm)) {
    items.push(match[1].trim());
  }
  for (const match of raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = stripHtml(match[1]);
    if (text) items.push(text);
  }
  return items.slice(0, 16);
}

function inferEquipment(title: string, content: string): string[] {
  const text = `${title} ${content}`;
  const found: string[] = [];
  const catalog: Array<[RegExp, string]> = [
    [/چادر|tent/i, 'tent'],
    [/کوله|backpack|rucksack/i, 'backpack'],
    [/باتوم|عصا|trekking pole/i, 'trekking_pole'],
    [/کفش|پوتین|boot|footwear/i, 'hiking_boot'],
    [/کیسه خواب|sleeping bag/i, 'sleeping_bag'],
    [/سرشعله|اجاق|stove/i, 'camp_stove'],
    [/زیرانداز|sleeping pad/i, 'sleeping_pad']
  ];
  for (const [re, id] of catalog) {
    if (re.test(text)) found.push(id);
  }
  return found;
}

export function buildSiteVisualContext(site: any | null | undefined): SiteVisualContext {
  const id = site?.id || 'unknown-site';
  const isMadaniCamp = id === 'site-madanicamp' || /مدنی کمپ|madanicamp/i.test(`${site?.name || ''} ${site?.url || ''}`);
  return {
    id,
    siteId: id,
    name: site?.name || site?.brand?.name || 'Active website',
    websiteName: site?.name || site?.brand?.name || 'Active website',
    brand: site?.brand?.name || site?.name || 'Active website',
    language: site?.language || site?.seo?.targetLanguage || 'fa',
    audience: site?.seo?.targetAudience || site?.profile?.audience?.join('، ') || 'outdoor readers',
    niche: site?.profile?.niche || site?.description || 'outdoor content',
    categories: site?.profile?.categories || site?.content?.topics || [],
    products: site?.profile?.products || [],
    contentStyle: site?.profile?.contentStyle || site?.content?.tone || 'educational outdoor editorial',
    visualPreferences:
      site?.profile?.visualPreferences ||
      'Professional outdoor editorial photography, natural light, realistic equipment, no generic stock landscapes',
    isMadaniCamp
  };
}

export function buildArticleRepresentation(
  article: StructuredArticleContext,
  site?: SiteVisualContext
): ArticleRepresentation {
  const title = (article.title || '').trim();
  const rawContent = article.content || '';
  const plain = stripHtml(rawContent);
  const headings = Array.from(
    new Set([
      ...(article.sections || []).map((s) => s.heading).filter(Boolean),
      ...extractMarkdownHeadings(rawContent),
      ...extractHtmlHeadings(rawContent)
    ])
  ).slice(0, 12);

  const sectionExcerpts = (article.sections || [])
    .filter((s) => s.heading)
    .slice(0, 8)
    .map((s) => ({
      heading: s.heading,
      text: stripHtml(s.text || '').slice(0, 800)
    }));

  if (sectionExcerpts.length === 0 && headings.length > 0) {
    for (const heading of headings.slice(0, 6)) {
      const idx = rawContent.indexOf(heading);
      const slice = idx >= 0 ? stripHtml(rawContent.slice(idx, idx + 900)) : '';
      sectionExcerpts.push({ heading, text: slice.slice(0, 800) });
    }
  }

  const articleType = inferArticleType(title, plain);
  const equipment = inferEquipment(title, plain);
  const keywords = (article.keywords || []).filter(Boolean);

  return {
    title,
    primaryTopic: title,
    primaryKeyword: article.primaryKeyword || keywords[0] || title,
    searchIntent: article.searchIntent || (articleType === 'buying_guide' || articleType === 'product_review' ? 'commercial' : 'informational'),
    articleType,
    audience: article.targetReader || site?.audience || 'outdoor readers',
    products: Array.from(new Set([...(article.products || []), ...equipment])).filter(Boolean),
    equipment,
    importantEntities: Array.from(new Set([...keywords, ...equipment, article.category || ''].filter(Boolean))),
    headings,
    intro: firstParagraphs(plain, 2, 1400),
    conclusion: lastParagraph(plain, 700),
    sectionExcerpts,
    lists: extractListItems(rawContent),
    wordCount: plain.split(/\s+/).filter(Boolean).length
  };
}

export function serializeArticleForPrompt(rep: ArticleRepresentation): string {
  const sections = rep.sectionExcerpts
    .map((s) => `- ${s.heading}: ${s.text}`)
    .join('\n');
  const lists = rep.lists.length ? `Key lists:\n${rep.lists.slice(0, 12).map((i) => `- ${i}`).join('\n')}` : '';
  return `Title: ${rep.title}
Primary keyword: ${rep.primaryKeyword}
Search intent: ${rep.searchIntent}
Heuristic article type: ${rep.articleType}
Audience: ${rep.audience}
Category/products: ${rep.products.join(', ') || 'n/a'}
Headings: ${rep.headings.join(' | ') || 'n/a'}
Introduction:
${rep.intro || '(not provided)'}
${sections ? `Section excerpts:\n${sections}` : ''}
${lists}
Conclusion:
${rep.conclusion || '(not provided)'}`;
}

export function buildIntelligentArticleRepresentation(article: StructuredArticleContext): string {
  const rep = buildArticleRepresentation(article);
  const sections = rep.sectionExcerpts.map((s) => `### ${s.heading}\n${s.text}`).join('\n');
  return `TITLE: ${rep.title}
PRIMARY KEYWORD: ${rep.primaryKeyword}
SEARCH INTENT: ${rep.searchIntent}
ARTICLE TYPE (heuristic): ${rep.articleType}
AUDIENCE: ${rep.audience}
EQUIPMENT/PRODUCTS: ${rep.products.join(', ') || 'n/a'}
HEADINGS: ${rep.headings.join(' | ') || 'n/a'}
INTRO:
${rep.intro || '(not provided)'}
${sections ? `SECTIONS:\n${sections}` : ''}
${rep.lists.length ? `LISTS:\n${rep.lists.slice(0, 12).map((i) => `- ${i}`).join('\n')}` : ''}
CONCLUSION:
${rep.conclusion || '(not provided)'}`;
}
