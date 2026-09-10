/**
 * Web research provider abstraction.
 * No third-party search API is configured in this project — providers stay NOT_CONFIGURED.
 */

import type { ResearchProviderStatus, ResearchSourceCandidate } from './types.js';

export interface ResearchSourceProvider {
  id: string;
  label: string;
  configured: boolean;
  search(query: string): Promise<ResearchSourceCandidate[]>;
  getStatus(): ResearchProviderStatus;
}

class NotConfiguredWebSearchProvider implements ResearchSourceProvider {
  id = 'web_search';
  label = 'Web Search';
  configured = false;

  async search(_query: string): Promise<ResearchSourceCandidate[]> {
    return [];
  }

  getStatus(): ResearchProviderStatus {
    return {
      provider: 'web_search',
      status: 'not_configured',
      label: 'جستجوی وب',
      detail: 'WEB RESEARCH PROVIDER NOT CONFIGURED — هیچ API جستجویی تنظیم نشده است. Gemini جستجوی وب انجام نمی‌دهد.',
      configured: false
    };
  }
}

export function getWebSearchProvider(): ResearchSourceProvider {
  // Future: read SERPER_API_KEY / GOOGLE_CSE_* and return a real provider.
  return new NotConfiguredWebSearchProvider();
}

export function defaultResearchProviders(): ResearchProviderStatus[] {
  return [
    getWebSearchProvider().getStatus(),
    {
      provider: 'manual_url',
      status: 'available',
      label: 'URL دستی',
      detail: 'کاربر می‌تواند URL معتبر http(s) اضافه کند.',
      configured: true
    },
    {
      provider: 'wordpress',
      status: 'available',
      label: 'ایندکس وردپرس',
      detail: 'مقالات ایندکس‌شدهٔ همین سایت به‌عنوان منبع استفاده می‌شوند.',
      configured: true
    },
    {
      provider: 'product_catalog',
      status: 'available',
      label: 'کاتالوگ محصول',
      detail: 'ویژگی‌های ووکامرس در صورت وجود به‌عنوان منبع تأییدشده استفاده می‌شوند.',
      configured: true
    }
  ];
}
