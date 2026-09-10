import { db } from '../db.js';
import { RESEARCH_SCHEMA_VERSION, type ResearchSession, type ResearchSourceDocument, type ResearchStore } from './types.js';

function emptyStore(siteId: string): ResearchStore {
  return {
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    siteId,
    sourcesByUrl: {},
    sessions: []
  };
}

function migrateSession(raw: any, siteId: string): ResearchSession {
  return {
    ...raw,
    siteId: raw.siteId || siteId,
    status: raw.status || 'READY',
    sources: Array.isArray(raw.sources) ? raw.sources : [],
    extractedEvidence: Array.isArray(raw.extractedEvidence) ? raw.extractedEvidence : [],
    claims: Array.isArray(raw.claims) ? raw.claims : [],
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    unknownFacts: Array.isArray(raw.unknownFacts) ? raw.unknownFacts : [],
    providers: Array.isArray(raw.providers) ? raw.providers : [],
    packetEvidence: Array.isArray(raw.packetEvidence) ? raw.packetEvidence : []
  };
}

export function loadResearchStore(siteId: string): ResearchStore {
  const raw = db.getResearchStore(siteId);
  if (!raw || typeof raw !== 'object') return emptyStore(siteId);
  return {
    schemaVersion: Number(raw.schemaVersion) || RESEARCH_SCHEMA_VERSION,
    siteId,
    sourcesByUrl: raw.sourcesByUrl && typeof raw.sourcesByUrl === 'object' ? raw.sourcesByUrl : {},
    sessions: (Array.isArray(raw.sessions) ? raw.sessions : [])
      .filter((session: any) => !session.siteId || session.siteId === siteId)
      .map((session: any) => migrateSession(session, siteId))
  };
}

export function saveResearchStore(siteId: string, store: ResearchStore): ResearchStore {
  const next: ResearchStore = {
    ...store,
    siteId,
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    sessions: store.sessions.slice(0, 40)
  };
  db.saveResearchStore(siteId, next);
  return next;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function getCachedSource(siteId: string, url: string): ResearchSourceDocument | undefined {
  const store = loadResearchStore(siteId);
  const cached = store.sourcesByUrl[url];
  if (!cached) return undefined;
  if (cached.siteId !== siteId) return undefined;
  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  if (!Number.isFinite(age) || age > CACHE_TTL_MS) return undefined;
  if (cached.status !== 'ok' && cached.status !== 'cached') return undefined;
  return { ...cached, status: 'cached' };
}

export function putCachedSource(siteId: string, source: ResearchSourceDocument): { changed: boolean } {
  if (source.siteId !== siteId) return { changed: false };
  const store = loadResearchStore(siteId);
  const previous = store.sourcesByUrl[source.url];
  const changed = Boolean(previous && previous.contentHash && previous.contentHash !== source.contentHash);
  store.sourcesByUrl[source.url] = source;
  if (changed) {
    store.sessions = store.sessions.map((session) => {
      if (session.siteId !== siteId) return session;
      if (!session.sources.some((row) => row.url === source.url)) return session;
      return {
        ...session,
        status: 'STALE',
        updatedAt: new Date().toISOString()
      };
    });
  }
  // Cap cache size per site.
  const urls = Object.keys(store.sourcesByUrl);
  if (urls.length > 200) {
    const sorted = urls
      .map((url) => ({ url, at: store.sourcesByUrl[url]?.fetchedAt || '' }))
      .sort((a, b) => a.at.localeCompare(b.at));
    for (const row of sorted.slice(0, urls.length - 200)) {
      delete store.sourcesByUrl[row.url];
    }
  }
  saveResearchStore(siteId, store);
  return { changed };
}

export function saveResearchSession(session: ResearchSession): ResearchSession {
  const store = loadResearchStore(session.siteId);
  const idx = store.sessions.findIndex((row) => row.id === session.id);
  if (idx >= 0) store.sessions[idx] = session;
  else store.sessions.unshift(session);
  saveResearchStore(session.siteId, store);
  return session;
}

export function getResearchSession(siteId: string, researchId: string): ResearchSession | undefined {
  return loadResearchStore(siteId).sessions.find((row) => row.id === researchId && row.siteId === siteId);
}

export function listResearchSessions(siteId: string): ResearchSession[] {
  return loadResearchStore(siteId).sessions.filter((row) => row.siteId === siteId);
}
