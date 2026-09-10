import { db } from './db.js';
import { syncSiteIntelligence } from './intelligence/sync.js';
import { getContentIndex } from './intelligence/store.js';

export async function analyzeSiteIntelligence(siteId: string): Promise<any> {
  const site = db.getSiteById(siteId);
  if (!site) throw new Error('Site not found');
  try {
    const index = await syncSiteIntelligence({ siteId, mode: 'full' });
    return db.getSiteById(siteId)?.profile || profileFromIndex(index);
  } catch (err: any) {
    const existing = getContentIndex(siteId);
    if (existing.articles.length > 0) {
      return db.getSiteById(siteId)?.profile || profileFromIndex(existing);
    }
    throw new Error(err.message || 'Site intelligence sync failed');
  }
}

function profileFromIndex(index: ReturnType<typeof getContentIndex>) {
  return {
    niche: '',
    audience: [],
    mainTopics: index.categories.map((c) => c.name),
    subTopics: [],
    products: index.products.map((p) => p.name),
    categories: index.categories.map((c) => c.name),
    contentStyle: '',
    brandVoice: '',
    existingContentCount: index.articles.length,
    contentClusters: index.clusters,
    contentGaps: index.gaps,
    lastAnalyzedAt: index.indexedAt,
    sourceType: 'calculated',
    isSeed: false
  };
}
