import type { IndexedProduct, IndexedTerm, SyncProgress } from './types.js';

export interface WpAuth {
  username?: string;
  password?: string;
}

export interface PaginatedFetchOptions {
  baseUrl: string;
  resource: string;
  perPage?: number;
  timeoutMs?: number;
  retries?: number;
  auth?: WpAuth;
  query?: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (info: { done: number; total?: number }) => void;
}

function headers(auth?: WpAuth): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'Blog-Manager-Content-OS/1.0' };
  if (auth?.username && auth?.password) {
    h.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  }
  return h;
}

function joinUrl(baseUrl: string, path: string, query: Record<string, string> = {}): string {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchImpl(url, { ...init, signal: init.signal || AbortSignal.timeout(timeoutMs) });
      if (response.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('WordPress fetch failed');
}

export async function fetchWordpressCollection<T = any>(options: PaginatedFetchOptions): Promise<{
  items: T[];
  total: number;
  pages: number;
  partialFailure: boolean;
}> {
  const perPage = options.perPage || 50;
  const fetchImpl = options.fetchImpl || fetch;
  const items: T[] = [];
  let total = 0;
  let pages = 1;
  let partialFailure = false;

  for (let page = 1; page <= pages; page++) {
    const url = joinUrl(options.baseUrl, `wp-json/wp/v2/${options.resource}`, {
      per_page: String(perPage),
      page: String(page),
      ...(options.query || {})
    });
    try {
      const response = await fetchWithRetry(
        url,
        { headers: headers(options.auth), signal: options.signal },
        options.retries ?? 2,
        options.timeoutMs ?? 12000,
        fetchImpl
      );
      if (!response.ok) {
        if (page === 1) throw new Error(`WordPress ${options.resource} returned ${response.status}`);
        partialFailure = true;
        break;
      }
      const batch = (await response.json()) as T[];
      const headerTotal = Number(response.headers.get('X-WP-Total') || batch.length);
      const headerPages = Number(response.headers.get('X-WP-TotalPages') || 1);
      if (page === 1) {
        total = headerTotal;
        pages = Math.max(1, headerPages);
      }
      items.push(...batch);
      options.onProgress?.({ done: items.length, total: total || items.length });
      if (batch.length < perPage) break;
    } catch (err) {
      if (page === 1) throw err;
      partialFailure = true;
      break;
    }
  }

  return { items, total: total || items.length, pages, partialFailure };
}

export function mapWpPost(raw: any) {
  const embedded = raw._embedded || {};
  const terms = embedded['wp:term'] || [];
  const cats = (terms[0] || []).map((t: any) => t.name).filter(Boolean);
  const tags = (terms[1] || []).map((t: any) => t.name).filter(Boolean);
  const media = embedded['wp:featuredmedia']?.[0];
  const author = embedded.author?.[0];
  return {
    id: raw.id,
    title: raw.title?.rendered || raw.title || '',
    slug: raw.slug || '',
    url: raw.link,
    date: raw.date,
    modified: raw.modified,
    status: raw.status,
    excerpt: raw.excerpt?.rendered || '',
    content: raw.content?.rendered || '',
    featuredImage: media?.source_url,
    author: author?.name,
    categories: cats,
    tags,
    categoryIds: raw.categories || [],
    tagIds: raw.tags || []
  };
}

export function mapWpTerm(raw: any): IndexedTerm {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description,
    count: raw.count
  };
}

export async function detectWooCommerce(
  baseUrl: string,
  auth?: WpAuth,
  fetchImpl: typeof fetch = fetch
): Promise<{ available: boolean; products: IndexedProduct[] }> {
  const endpoints = ['wp-json/wc/store/v1/products', 'wp-json/wc/store/products'];
  for (const path of endpoints) {
    try {
      const url = joinUrl(baseUrl, path, { per_page: '50' });
      const response = await fetchWithRetry(url, { headers: headers(auth) }, 1, 8000, fetchImpl);
      if (!response.ok) continue;
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.products || [];
      return {
        available: true,
        products: list.slice(0, 100).map((p: any) => ({
          id: p.id,
          name: p.name,
          slug: p.slug || '',
          url: p.permalink,
          description: p.description,
          shortDescription: p.short_description,
          categories: (p.categories || []).map((c: any) => c.name || c),
          tags: (p.tags || []).map((t: any) => t.name || t),
          price: p.prices?.price || p.price,
          stockStatus: p.is_in_stock === false ? 'outofstock' : p.is_in_stock ? 'instock' : undefined,
          images: (p.images || []).map((img: any) => img.src || img).filter(Boolean),
          attributes: (p.attributes || []).map((a: any) => a.name || String(a)),
          sourceType: 'observed' as const
        }))
      };
    } catch {
      // try next endpoint
    }
  }
  return { available: false, products: [] };
}

export async function crawlWordpress(params: {
  baseUrl: string;
  auth?: WpAuth;
  perPage?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  onProgress?: (p: SyncProgress) => void;
}) {
  const common = {
    baseUrl: params.baseUrl,
    perPage: params.perPage || 50,
    auth: params.auth,
    fetchImpl: params.fetchImpl,
    signal: params.signal
  };

  params.onProgress?.({ stage: 'fetching_articles', done: 0 });
  const posts = await fetchWordpressCollection({
    ...common,
    resource: 'posts',
    query: { _embed: '1', status: 'publish' },
    onProgress: (info) => params.onProgress?.({ stage: 'fetching_articles', done: info.done, total: info.total })
  });

  params.onProgress?.({ stage: 'fetching_categories' });
  let categories = { items: [] as any[], total: 0, pages: 0, partialFailure: false };
  try {
    categories = await fetchWordpressCollection({ ...common, resource: 'categories' });
  } catch {
    categories.partialFailure = true;
  }

  params.onProgress?.({ stage: 'fetching_tags' });
  let tags = { items: [] as any[], total: 0, pages: 0, partialFailure: false };
  try {
    tags = await fetchWordpressCollection({ ...common, resource: 'tags' });
  } catch {
    tags.partialFailure = true;
  }

  params.onProgress?.({ stage: 'detecting_products' });
  const woo = await detectWooCommerce(params.baseUrl, params.auth, params.fetchImpl);

  return {
    posts: posts.items.map(mapWpPost),
    articleTotalFromWp: posts.total,
    postsPartial: posts.partialFailure,
    categories: categories.items.map(mapWpTerm),
    tags: tags.items.map(mapWpTerm),
    woocommerceAvailable: woo.available,
    products: woo.products
  };
}

export function diffIncremental(
  existing: Array<{ id: string | number; modified?: string; slug?: string }>,
  incoming: Array<{ id: string | number; modified?: string; slug?: string }>
): { newIds: Array<string | number>; changedIds: Array<string | number>; removedIds: Array<string | number> } {
  const prev = new Map(existing.map((a) => [String(a.id), a]));
  const next = new Map(incoming.map((a) => [String(a.id), a]));
  const newIds: Array<string | number> = [];
  const changedIds: Array<string | number> = [];
  for (const item of incoming) {
    const old = prev.get(String(item.id));
    if (!old) newIds.push(item.id);
    else if ((old.modified || '') !== (item.modified || '') || (old.slug || '') !== (item.slug || '')) {
      changedIds.push(item.id);
    }
  }
  const removedIds = existing.filter((a) => !next.has(String(a.id))).map((a) => a.id);
  return { newIds, changedIds, removedIds };
}
