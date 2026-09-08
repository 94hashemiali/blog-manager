export interface WPPost {
  id: number | string;
  date: string;
  modified?: string;
  slug: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'local_draft';
  type?: string;
  link?: string;
  title: {
    rendered: string;
    raw?: string;
  };
  content: {
    rendered: string;
    raw?: string;
  };
  excerpt: {
    rendered: string;
    raw?: string;
  };
  featured_media_url?: string;
  categories: number[];
  category_names?: string[];
  tags: number[];
  tag_names?: string[];
  author_name?: string;
  is_local?: boolean;
  local_updated_at?: string;
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
  description?: string;
}

export interface WPTag {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface SiteSettings {
  siteUrl: string;
  username: string;
  appPassword?: string;
  autoSync: boolean;
}

export interface AIGenerateRequest {
  topic: string;
  tone?: 'educational' | 'practical' | 'engaging' | 'gear_review';
  targetAudience?: string;
  keywords?: string[];
  includeFaq?: boolean;
  outlineOnly?: boolean;
}

export interface AIOptimizeRequest {
  action: 'meta_description' | 'catchy_titles' | 'faq_generation' | 'improve_persian' | 'suggest_tags' | 'auto_seo_suite' | 'expand_section' | 'generate_intro' | 'generate_conclusion';
  title?: string;
  content?: string;
  focusKeyword?: string;
}

export interface AutoSeoSuggestions {
  titles: string[];
  metaDescription: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  suggestedSlug?: string;
  h2Headings: string[];
  readabilityFeedback?: string;
}
