import { generateJsonContent } from '../aiClient.js';
import { db } from '../db.js';
import type { CompetitorRecord } from './types.js';
import { fetchWordpressCollection, mapWpPost } from './wordpress.js';

function hostOf(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();
}

export function listCompetitors(siteId: string): CompetitorRecord[] {
  return db.getCompetitors(siteId).filter((c: any) => c.siteId === siteId);
}

export async function upsertCompetitorDomain(params: {
  siteId: string;
  domain: string;
  name?: string;
}): Promise<CompetitorRecord> {
  const domain = hostOf(params.domain);
  const existing = listCompetitors(params.siteId);
  const crawled = await tryCrawlCompetitor(domain);
  const record: CompetitorRecord = {
    id: existing.find((c) => c.domain === domain)?.id || `comp-${params.siteId}-${domain}`,
    siteId: params.siteId,
    name: params.name || crawled.name || domain,
    domain,
    verified: crawled.verified,
    pagesAnalyzed: crawled.titles.length,
    articleCount: crawled.titles.length,
    topicCoverage: crawled.titles,
    categories: crawled.categories,
    contentPatterns: crawled.verified ? ['wordpress_rest_observed'] : [],
    strengths: crawled.verified ? [`${crawled.titles.length} public posts observed`] : [],
    weaknesses: crawled.verified ? [] : ['Could not verify WordPress REST on this domain'],
    contentGaps: [],
    overlapWithOurSite: [],
    lastScannedAt: new Date().toISOString(),
    sourceType: crawled.verified ? 'observed' : 'unknown',
    confidence: crawled.verified ? 'medium' : 'low',
    notes: crawled.verified ? undefined : 'Add a reachable WordPress REST API or paste observed titles. Nothing was fabricated.'
  };

  const all = db.getCompetitors();
  const others = all.filter((c: any) => !(c.siteId === params.siteId && c.domain === domain));
  db.saveCompetitors([record, ...others]);
  return record;
}

async function tryCrawlCompetitor(domain: string): Promise<{
  verified: boolean;
  name?: string;
  titles: string[];
  categories: string[];
}> {
  const baseUrl = `https://${domain}`;
  try {
    const posts = await fetchWordpressCollection({
      baseUrl,
      resource: 'posts',
      perPage: 50,
      retries: 1,
      timeoutMs: 8000,
      query: { _embed: '1' }
    });
    const mapped = posts.items.map(mapWpPost);
    let categories: string[] = [];
    try {
      const cats = await fetchWordpressCollection({ baseUrl, resource: 'categories', perPage: 50, retries: 0, timeoutMs: 6000 });
      categories = cats.items.map((c: any) => c.name).filter(Boolean);
    } catch {
      categories = [];
    }
    return {
      verified: true,
      titles: mapped.map((p) => p.title).filter(Boolean),
      categories
    };
  } catch {
    return { verified: false, titles: [], categories: [] };
  }
}

export async function interpretCompetitorGaps(siteId: string, competitor: CompetitorRecord, ourTitles: string[]): Promise<CompetitorRecord> {
  if (!competitor.verified || competitor.topicCoverage.length === 0) return competitor;
  try {
    const result = await generateJsonContent({
      stage: 'competitor_interpret',
      systemInstruction: 'Compare observed competitor titles with our titles. Do not invent traffic, rankings, or unobserved pages. JSON only.',
      prompt: `Our titles:\n${ourTitles.slice(0, 40).join('\n')}\n\nCompetitor ${competitor.domain} titles:\n${competitor.topicCoverage.slice(0, 40).join('\n')}\nReturn {"overlap":[],"gaps":[],"differentiation":[]}`
    });
    const data = result.data || {};
    return {
      ...competitor,
      overlapWithOurSite: Array.isArray(data.overlap) ? data.overlap.map(String) : competitor.overlapWithOurSite,
      contentGaps: Array.isArray(data.gaps) ? data.gaps.map(String) : competitor.contentGaps,
      weaknesses: Array.isArray(data.differentiation) ? data.differentiation.map(String) : competitor.weaknesses
    };
  } catch {
    return competitor;
  }
}
