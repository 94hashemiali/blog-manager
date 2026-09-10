import { db } from '../db.js';
import { CONTENT_INDEX_SCHEMA_VERSION, type SiteContentIndex } from './types.js';

function emptyIndex(siteId: string): SiteContentIndex {
  return {
    schemaVersion: CONTENT_INDEX_SCHEMA_VERSION,
    siteId,
    indexedAt: new Date().toISOString(),
    woocommerceAvailable: false,
    articles: [],
    categories: [],
    tags: [],
    products: [],
    internalLinks: [],
    clusters: [],
    gaps: [],
    opportunities: [],
    fingerprints: []
  };
}

export function getContentIndex(siteId: string): SiteContentIndex {
  const stored = db.getContentIndex(siteId);
  if (!stored || stored.siteId !== siteId) return emptyIndex(siteId);
  return {
    ...emptyIndex(siteId),
    ...stored,
    siteId,
    schemaVersion: stored.schemaVersion || CONTENT_INDEX_SCHEMA_VERSION,
    articles: (stored.articles || []).filter((a: any) => a.siteId === siteId),
    clusters: (stored.clusters || []).filter((c: any) => !c.siteId || c.siteId === siteId),
    gaps: (stored.gaps || []).filter((g: any) => !g.siteId || g.siteId === siteId),
    opportunities: (stored.opportunities || []).filter((o: any) => !o.siteId || o.siteId === siteId)
  };
}

export function saveContentIndex(index: SiteContentIndex): SiteContentIndex {
  const next = {
    ...index,
    schemaVersion: CONTENT_INDEX_SCHEMA_VERSION,
    indexedAt: new Date().toISOString()
  };
  db.saveContentIndex(next.siteId, next);
  return next;
}
