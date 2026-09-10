/**
 * Canonical WordPress HTTP client used by routes and publishing.
 * Wraps intelligence/wordpress pagination primitives — no second crawl stack.
 */

import {
  crawlWordpress,
  fetchWordpressCollection,
  type WpAuth
} from '../../intelligence/wordpress.js';
import { logger } from '../../logger.js';

export class WordpressClientError extends Error {
  code: string;
  retryable: boolean;
  status?: number;

  constructor(message: string, options: { code: string; retryable?: boolean; status?: number } = { code: 'wp_error' }) {
    super(message);
    this.name = 'WordpressClientError';
    this.code = options.code;
    this.retryable = Boolean(options.retryable);
    this.status = options.status;
  }
}

export interface WordpressClientOptions {
  baseUrl: string;
  auth?: WpAuth;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function authHeader(auth?: WpAuth): Record<string, string> {
  if (!auth?.username || !auth.password) return {};
  return {
    Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
  };
}

export class WordpressClient {
  private baseUrl: string;
  private auth?: WpAuth;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(options: WordpressClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.auth = options.auth;
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  static fromSite(site: any, fetchImpl?: typeof fetch): WordpressClient {
    const baseUrl = site?.wordpress?.baseUrl || site?.url;
    if (!baseUrl) throw new WordpressClientError('Site WordPress URL missing', { code: 'wp_misconfigured' });
    return new WordpressClient({
      baseUrl,
      auth:
        site.wordpress?.username && site.wordpress?.applicationPassword
          ? { username: site.wordpress.username, password: site.wordpress.applicationPassword }
          : undefined,
      fetchImpl
    });
  }

  getCapabilities(): string[] {
    const caps = ['read_posts', 'categories', 'tags'];
    if (this.auth?.username && this.auth.password) {
      caps.push('write_posts', 'publish_posts');
    }
    return caps;
  }

  async getStatus(): Promise<{
    connected: boolean;
    siteUrl: string;
    responseTimeMs: number;
    totalPosts?: number;
    message: string;
  }> {
    const started = Date.now();
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/posts?per_page=1&status=publish`;
      const response = await this.fetchImpl(url, {
        headers: {
          'User-Agent': 'Blog-Manager-Content-OS/1.0',
          ...authHeader(this.auth)
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!response.ok) {
        throw new WordpressClientError(`WordPress status ${response.status}`, {
          code: 'wp_status_http',
          retryable: response.status >= 500,
          status: response.status
        });
      }
      const totalPosts = Number(response.headers.get('X-WP-Total') || 0);
      return {
        connected: true,
        siteUrl: this.baseUrl,
        responseTimeMs: Date.now() - started,
        totalPosts,
        message: 'WordPress reachable'
      };
    } catch (err: any) {
      if (err instanceof WordpressClientError) throw err;
      logger.warn('wordpress.status_failed', { operation: 'getStatus', errorCode: err?.code || 'wp_unreachable' });
      throw new WordpressClientError(err?.message || 'WordPress unreachable', {
        code: 'wp_unreachable',
        retryable: true
      });
    }
  }

  async getPosts(params: { page?: number; perPage?: number; search?: string; status?: string } = {}) {
    const result = await fetchWordpressCollection({
      baseUrl: this.baseUrl,
      resource: 'posts',
      perPage: params.perPage || 20,
      auth: this.auth,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      query: {
        status: params.status || 'publish',
        ...(params.search ? { search: params.search } : {}),
        ...(params.page ? { page: String(params.page) } : {})
      }
    });
    return {
      posts: result.items,
      total: result.total,
      pages: result.pages,
      partial: result.partialFailure,
      syncStatus: result.partialFailure ? 'PARTIAL' : 'COMPLETED'
    };
  }

  async getCategories() {
    const result = await fetchWordpressCollection({
      baseUrl: this.baseUrl,
      resource: 'categories',
      perPage: 100,
      auth: this.auth,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs
    });
    return { categories: result.items, partial: result.partialFailure };
  }

  async getTags() {
    const result = await fetchWordpressCollection({
      baseUrl: this.baseUrl,
      resource: 'tags',
      perPage: 100,
      auth: this.auth,
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs
    });
    return { tags: result.items, partial: result.partialFailure };
  }

  async crawlSite(onProgress?: Parameters<typeof crawlWordpress>[0]['onProgress']) {
    return crawlWordpress({
      baseUrl: this.baseUrl,
      auth: this.auth,
      fetchImpl: this.fetchImpl,
      onProgress
    });
  }

  async createOrUpdatePost(params: {
    postId?: number;
    title: string;
    content: string;
    excerpt?: string;
    slug?: string;
    status: 'draft' | 'publish';
    categories?: number[];
    featuredMediaId?: number;
  }): Promise<{ id: number; link?: string; status: string }> {
    if (!this.auth?.username || !this.auth.password) {
      throw new WordpressClientError('WordPress credentials missing', {
        code: 'wp_credentials_missing',
        retryable: false
      });
    }
    const endpoint = params.postId
      ? `${this.baseUrl}/wp-json/wp/v2/posts/${params.postId}`
      : `${this.baseUrl}/wp-json/wp/v2/posts`;
    const payload: Record<string, unknown> = {
      title: params.title,
      content: params.content,
      excerpt: params.excerpt,
      slug: params.slug,
      status: params.status
    };
    if (params.categories?.length) payload.categories = params.categories;
    if (params.featuredMediaId) payload.featured_media = params.featuredMediaId;

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(this.auth)
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.timeoutMs)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new WordpressClientError(`WordPress write failed (${response.status})`, {
        code: response.status >= 500 ? 'wp_write_server_error' : 'wp_write_rejected',
        retryable: response.status >= 500,
        status: response.status
      });
    }
    const data = (await response.json()) as { id: number; link?: string; status?: string };
    if (!data?.id) {
      throw new WordpressClientError('WordPress response missing post id', {
        code: 'wp_invalid_response',
        retryable: false
      });
    }
    return { id: data.id, link: data.link, status: data.status || params.status };
  }
}
