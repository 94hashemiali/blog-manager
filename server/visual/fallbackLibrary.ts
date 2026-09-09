import type { ImageType } from './types.js';

export const FALLBACK_OUTDOOR_LIBRARY: Record<string, Array<{
  id: string;
  title: string;
  perspective: string;
  url: string;
  description: string;
}>> = {
  HERO: [
    {
      id: 'fb-hero-1',
      title: 'چادر فنی در خط‌الرأس',
      perspective: 'مستند میدانی',
      url: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ],
  ARTICLE: [
    {
      id: 'fb-art-1',
      title: 'پیمایش سنگلاخ',
      perspective: 'مستند میدانی',
      url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ],
  PRODUCT: [
    {
      id: 'fb-prod-1',
      title: 'جزئیات تجهیزات روی سنگ',
      perspective: 'کلوزآپ',
      url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ],
  COMPARISON: [
    {
      id: 'fb-comp-1',
      title: 'مقایسه تجهیزات',
      perspective: 'کنار هم',
      url: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ],
  TUTORIAL: [
    {
      id: 'fb-tut-1',
      title: 'نمایش کار با دست',
      perspective: 'آموزشی',
      url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ],
  DETAIL: [
    {
      id: 'fb-detail-1',
      title: 'جزئیات فنی تجهیزات',
      perspective: 'ماکرو',
      url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ],
  ENVIRONMENTAL: [
    {
      id: 'fb-env-1',
      title: 'محیط کوهستانی مستند',
      perspective: 'عکاسی محیطی',
      url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1600&q=85',
      description: 'آرشیو مستند — تصویر هوش مصنوعی نیست'
    }
  ]
};

export function fallbackOptionsFor(imageType: ImageType) {
  const pool = FALLBACK_OUTDOOR_LIBRARY[imageType] || FALLBACK_OUTDOOR_LIBRARY.HERO;
  return pool.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    source: 'unsplash_fallback' as const,
    isAiGenerated: false as const
  }));
}
