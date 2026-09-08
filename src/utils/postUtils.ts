import { WPPost } from '../types';

/**
 * Extracts a plain string from any value that might be a string, a number,
 * a WordPress rendered object ({ rendered: string }), or a nested object ({ rendered: { rendered: string } }).
 * Prevents React child rendering errors: "Objects are not valid as a React child (found: object with keys {rendered})".
 */
export function extractString(val: any, fallback = ''): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return '';
  
  if (typeof val === 'object') {
    if (val.rendered !== undefined) {
      return extractString(val.rendered, fallback);
    }
    if (val.raw !== undefined) {
      return extractString(val.raw, fallback);
    }
    if (val.title !== undefined) {
      return extractString(val.title, fallback);
    }
    if (val.content !== undefined) {
      return extractString(val.content, fallback);
    }
    if (val.excerpt !== undefined) {
      return extractString(val.excerpt, fallback);
    }
    const keys = Object.keys(val);
    if (keys.length === 1 && typeof val[keys[0]] === 'string') {
      return val[keys[0]];
    }
  }

  return fallback;
}

/**
 * Normalizes a post object to ensure title.rendered, content.rendered,
 * and excerpt.rendered are always pure strings, never nested objects.
 */
export function normalizePost(post: any): WPPost {
  if (!post || typeof post !== 'object') {
    return {
      id: `draft-${Date.now()}`,
      date: new Date().toISOString(),
      slug: '',
      status: 'local_draft',
      title: { rendered: '' },
      content: { rendered: '' },
      excerpt: { rendered: '' },
      categories: [1],
      category_names: ['مقالات'],
      tags: [],
      tag_names: []
    };
  }

  const cleanTitle = extractString(post.title, 'بدون عنوان');
  const cleanContent = extractString(post.content, '');
  const cleanExcerpt = extractString(post.excerpt, '') || cleanContent.replace(/<[^>]+>/g, ' ').slice(0, 160);

  return {
    ...post,
    title: {
      rendered: cleanTitle,
      raw: typeof post.title === 'object' && post.title?.raw ? extractString(post.title.raw) : cleanTitle
    },
    content: {
      rendered: cleanContent,
      raw: typeof post.content === 'object' && post.content?.raw ? extractString(post.content.raw) : cleanContent
    },
    excerpt: {
      rendered: cleanExcerpt,
      raw: typeof post.excerpt === 'object' && post.excerpt?.raw ? extractString(post.excerpt.raw) : cleanExcerpt
    }
  };
}
