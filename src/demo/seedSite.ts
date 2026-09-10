import type { ManagedSite } from '../types';

/** Explicit DEMO seed — never treat as live Search Console / analytics / research. */
export const DEMO_SITE_SEED: ManagedSite & { isDemo?: boolean } = {
  id: 'site-madanicamp',
  name: 'مدنی کمپ',
  url: 'https://madanicamp.com',
  description: 'مرجع تخصصی تجهیزات کوهنوردی، کمپینگ، صخره‌نوردی و سفرهای ماجراجویانه در ایران',
  language: 'fa',
  wordpress: {
    baseUrl: 'https://madanicamp.com',
    username: '',
    applicationPassword: '',
    hasPassword: false
  },
  brand: {
    name: 'مدنی کمپ',
    description: 'مرجع تجهیزات کوهنوردی و طبیعت‌گردی',
    primaryColor: '#059669',
    secondaryColor: '#0d9488'
  },
  seo: {
    domain: 'madanicamp.com',
    targetCountry: 'IR',
    targetLanguage: 'fa',
    targetAudience: 'طبیعت‌گردان و کوهنوردان'
  },
  content: {
    tone: 'practical',
    topics: ['چادر کوهنوردی', 'کیسه خواب', 'کوله پشتی', 'پوتین کوهنوردی', 'سرشعله و ظروف کمپ', 'کیت بقا'],
    excludedTopics: []
  },
  profile: {
    niche: 'تجهیزات و راهنماهای کاربردی کمپینگ و کوهنوردی',
    audience: ['کوهنوردان نیمه‌حرفه‌ای و حرفه‌ای', 'طبیعت‌گردان آخر هفته', 'آفرودرها و کمپرها'],
    mainTopics: ['چادر', 'کیسه خواب', 'کوله پشتی', 'پوتین'],
    subTopics: ['وزن کوله', 'دمای کامفورت', 'ضدآب سازی', 'کمپ زمستانه'],
    products: ['کیسه خواب پر', 'چادر ۲ نفره', 'پوتین لوفا', 'کوله ۶۵ لیتری'],
    categories: ['مقالات', 'راهنمای خرید', 'بررسی تجهیزات'],
    contentStyle: 'جامع، همراه با تصویر و نکات تجربی',
    brandVoice: 'فنی، تجربی، مورد اعتماد و صمیمی',
    existingContentCount: 3,
    contentClusters: [],
    contentGaps: [],
    lastAnalyzedAt: new Date().toISOString()
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDemo: true
};

export const STORAGE_KEY_ACTIVE_SITE_ID = 'madani_active_site_id';
export const STORAGE_KEY_UI_PREFS = 'madani_ui_prefs';
/** @deprecated Prefer server sites; settings must not store application passwords. */
export const STORAGE_KEY_SETTINGS = 'madani_blog_settings';
export const STORAGE_KEY_LOCAL_POSTS = 'madani_local_posts';
