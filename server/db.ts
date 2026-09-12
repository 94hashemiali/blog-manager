import fs from 'fs';
import path from 'path';

// BLOG_MANAGER_DATA_DIR lets the test runners persist into a scratch directory
// instead of the working data/ folder.
const DATA_DIR = process.env.BLOG_MANAGER_DATA_DIR
  ? path.resolve(process.env.BLOG_MANAGER_DATA_DIR)
  : path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(filename: string): string {
  return path.join(DATA_DIR, filename);
}

function safeSiteId(siteId: string): string {
  return String(siteId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function readJsonFile<T>(filename: string, defaultValue: T): T {
  const filePath = getFilePath(filename);
  const bakPath = `${filePath}.bak`;
  try {
    if (!fs.existsSync(filePath)) {
      if (defaultValue == null) return defaultValue;
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    try {
      if (fs.existsSync(bakPath)) {
        return JSON.parse(fs.readFileSync(bakPath, 'utf-8')) as T;
      }
    } catch (bakErr) {
      console.error(`Backup also unreadable for ${filename}:`, bakErr);
    }
    return defaultValue;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  const filePath = getFilePath(filename);
  try {
    const tempPath = `${filePath}.tmp`;
    const bakPath = `${filePath}.bak`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, bakPath);
    }
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error writing ${filename}:`, err);
  }
}

// Initial default seed site (Madani Camp) for 100% backward compatibility
export const DEFAULT_SITE_ID = 'site-madanicamp';

const INITIAL_SITES = [
  {
    id: DEFAULT_SITE_ID,
    name: 'مدنی کمپ',
    url: 'https://madanicamp.com',
    description: 'فروشگاه و مرجع تخصصی تجهیزات کمپینگ، کوهنوردی، طبیعت‌گردی و بقا در کوهستان',
    language: 'fa',
    wordpress: {
      baseUrl: 'https://madanicamp.com',
      username: '',
      applicationPassword: '',
      hasPassword: false
    },
    brand: {
      name: 'مدنی کمپ',
      description: 'مرجع تخصصی کوهنوردی و طبیعت‌گردی ایران',
      primaryColor: '#059669', // Emerald 600
      secondaryColor: '#0f766e'  // Teal 700
    },
    seo: {
      domain: 'madanicamp.com',
      targetCountry: 'ایران',
      targetLanguage: 'فارسی',
      targetAudience: 'کوهنوردان، طبیعت‌گردان، علاقه‌مندان به کمپینگ، کوهپیمایی و آفرود'
    },
    content: {
      tone: 'educational',
      topics: [
        'راهنمای خرید چادر کوهنوردی',
        'سیستم خواب و کیسه خواب',
        'پوتین و کفش ترکینگ گورتکس',
        'کوله پشتی فنی و ارگونومی',
        'سرشعله و پخت و پز در طبیعت',
        'ابزارهای بقا و ناوبری در کوهستان',
        'پوشاک کوهنوردی و لایه‌بندی'
      ],
      excludedTopics: ['مطالب حاشیه‌ای و زرد', 'تبلیغات غیرمرتبط با طبیعت‌گردی']
    },
    profile: {
      niche: 'تجهیزات تخصصی کوهنوردی و کمپینگ',
      audience: ['کوهنوردان مبتدی تا پیشرفته', 'طبیعت‌گردان آخر هفته', 'علاقه‌مندان به بقا در طبیعت'],
      mainTopics: ['کوهنوردی', 'کمپینگ', 'کفش و پوتین', 'کیسه خواب', 'چادر', 'کوله پشتی', 'تجهیزات بقا'],
      subTopics: ['گورتکس و ویبرام', 'دمای کامفورت کیسه خواب', 'چادرهای ژئودزیک', 'سرشعله کوهستان'],
      products: ['چادر ۴ فصل', 'کیسه خواب پر', 'پوتین گورتکس', 'کوله پشتی ۶۵ لیتری', 'سرشعله پیچی'],
      categories: ['مقالات و راهنما', 'تجهیزات کمپینگ', 'کوهنوردی و کفش', 'کیسه خواب و چادر'],
      contentStyle: 'تخصصی، مستند، کاربردی و الهام‌بخش با تکیه بر استانداردهای بین‌المللی تجهیزات',
      brandVoice: 'حرفه‌ای، امین، با تجربه کوهستان، حمایتگر و قابل اعتماد',
      existingContentCount: 6,
      contentClusters: [
        {
          id: 'cluster-tents',
          name: 'چادر و سرپناه کوهستان',
          pillarTopic: 'راهنمای جامع خرید و نگهداری چادر کوهنوردی',
          existingArticlesCount: 1,
          missingArticlesCount: 3,
          topics: [
            { title: 'راهنمای جامع خرید چادر کوهنوردی ۴ فصل و ۲ پوش', keyword: 'چادر کوهنوردی ۴ فصل', status: 'existing' },
            { title: 'تفاوت چادر گنبدی ژئودزیک با چادر تونلی', keyword: 'چادر ژئودزیک', status: 'missing' },
            { title: 'نحوه تمیز کردن و عایق‌کاری مجدد درزهای چادر', keyword: 'نگهداری چادر', status: 'missing' },
            { title: 'بهترین میخ‌ها و طناب‌های مهار چادر در باد شدید', keyword: 'مهار چادر در باد', status: 'missing' }
          ]
        },
        {
          id: 'cluster-footwear',
          name: 'کفش و پوتین کوهنوردی',
          pillarTopic: 'راهنمای انتخاب و خرید کفش کوهنوردی بر اساس نوع برنامه',
          existingArticlesCount: 3,
          missingArticlesCount: 2,
          topics: [
            { title: 'آیا کتونی برای کوهنوردی مناسب است؟', keyword: 'کتونی کوهنوردی', status: 'existing' },
            { title: 'راهنمای سایز کفش ورزشی و کوهنوردی', keyword: 'سایز کفش کوهنوردی', status: 'existing' },
            { title: '۱۰ نکته حیاتی شستشو و نگهداری پوتین کوهنوردی گورتکس', keyword: 'نگهداری پوتین گورتکس', status: 'existing' },
            { title: 'مقایسه زیره ویبرام (Vibram) با کفی‌های معمولی', keyword: 'زیره ویبرام', status: 'missing' },
            { title: 'نحوه بستن بند پوتین در سرازیری برای جلوگیری از تاول', keyword: 'بستن بند پوتین', status: 'missing' }
          ]
        },
        {
          id: 'cluster-sleep',
          name: 'سیستم خواب و شب‌مانی',
          pillarTopic: 'راهنمای جامع سیستم خواب در کوهستان و شرایط سخت',
          existingArticlesCount: 2,
          missingArticlesCount: 2,
          topics: [
            { title: '12 نکته مهم انتخاب تجهیزات خواب کمپ', keyword: 'تجهیزات خواب کمپ', status: 'existing' },
            { title: 'چک‌لیست بقا و تجهیزات شب‌مانی زمستانه در کوهستان', keyword: 'شب‌مانی در کوهستان', status: 'existing' },
            { title: 'راهنمای درک ضریب عایق (R-Value) در زیراندازهای کوهنوردی', keyword: 'ضریب عایق R-Value', status: 'missing' },
            { title: 'کیسه خواب پر در برابر الیاف مصنوعی: کدام مناسب شماست؟', keyword: 'کیسه خواب پر یا الیاف', status: 'missing' }
          ]
        }
      ],
      contentGaps: [
        {
          id: 'gap-1',
          topic: 'راهنمای جامع خرید کیسه آب (CamelBak) و فیلترهای تصفیه آب کوهستان',
          competitorsCovering: 4,
          siteCoverage: 0,
          businessValue: 9,
          trafficPotential: 8,
          gapScore: 88,
          reason: 'تقاضای بالا در تابستان و بهار توسط کوهنوردان، حاشیه سود خوب در فروشگاه و نبود محتوای جامع در سایت'
        },
        {
          id: 'gap-2',
          topic: 'آموزش تنظیم علمی کوله پشتی کوهنوردی (توزیع وزن و تسمه‌های ارگونومیک)',
          competitorsCovering: 5,
          siteCoverage: 1,
          businessValue: 9,
          trafficPotential: 9,
          gapScore: 92,
          reason: 'کلمه کلیدی با حجم سرچ بالا و نرخ تبدیل مستقیم به خرید کوله پشتی تخصصی'
        },
        {
          id: 'gap-3',
          topic: 'مقایسه بهترین سرشعله‌های ضدباد کوهنوردی (Kovea, Fire-Maple, MSR)',
          competitorsCovering: 3,
          siteCoverage: 0,
          businessValue: 8,
          trafficPotential: 7,
          gapScore: 82,
          reason: 'جستجوی با نیت خرید بالا (Commercial Intent) برای کسانی که قصد خرید تجهیزات پخت و پز دارند'
        }
      ],
      lastAnalyzedAt: new Date().toISOString(),
      sourceType: 'seed',
      isSeed: true,
      confidence: 'low'
    },
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: new Date().toISOString()
  }
];

export const db = {
  // Sites
  getSites: () => readJsonFile<any[]>('sites.json', INITIAL_SITES),
  saveSites: (sites: any[]) => writeJsonFile('sites.json', sites),
  getSiteById: (siteId: string) => {
    const sites = readJsonFile<any[]>('sites.json', INITIAL_SITES);
    return sites.find((s) => s.id === siteId);
  },

  getArticles: (siteId?: string) => {
    const all = readJsonFile<any[]>('articles.json', []);
    if (!siteId) return all;
    return all.filter((a) => a.site_id === siteId || a.siteId === siteId);
  },
  saveArticles: (articles: any[]) => writeJsonFile('articles.json', articles),

  getTopics: (siteId?: string) => {
    const all = readJsonFile<any[]>('topics.json', []);
    if (!siteId) return all;
    return all.filter((t) => t.siteId === siteId);
  },
  saveTopics: (topics: any[]) => writeJsonFile('topics.json', topics),

  getCompetitors: (siteId?: string) => {
    const all = readJsonFile<any[]>('competitors.json', []);
    if (!siteId) return all;
    return all.filter((c) => c.siteId === siteId);
  },
  saveCompetitors: (competitors: any[]) => writeJsonFile('competitors.json', competitors),

  getImages: (siteId?: string) => {
    const all = readJsonFile<any[]>('images.json', []);
    if (!siteId) return all;
    return all.filter((img) => img.siteId === siteId);
  },
  saveImages: (images: any[]) => writeJsonFile('images.json', images),

  getJobs: () => readJsonFile<any[]>('jobs.json', []),
  saveJobs: (jobs: any[]) => writeJsonFile('jobs.json', jobs),

  getOpsJobStore: () => readJsonFile<any>('ops-jobs.json', null),
  saveOpsJobStore: (store: any) => writeJsonFile('ops-jobs.json', store),

  getOpsEventStore: (siteId: string) => {
    return readJsonFile<any>(`ops-events-${safeSiteId(siteId)}.json`, null);
  },
  saveOpsEventStore: (siteId: string, store: any) => {
    writeJsonFile(`ops-events-${safeSiteId(siteId)}.json`, store);
  },

  getScheduleStore: () => readJsonFile<any>('ops-schedules.json', null),
  saveScheduleStore: (store: any) => writeJsonFile('ops-schedules.json', store),

  getAutomationStore: (siteId: string) => {
    return readJsonFile<any>(`automation-${safeSiteId(siteId)}.json`, null);
  },
  saveAutomationStore: (siteId: string, store: any) => {
    writeJsonFile(`automation-${safeSiteId(siteId)}.json`, store);
  },

  getImpactStore: (siteId: string) => {
    return readJsonFile<any>(`content-impact-${safeSiteId(siteId)}.json`, null);
  },
  saveImpactStore: (siteId: string, store: any) => {
    writeJsonFile(`content-impact-${safeSiteId(siteId)}.json`, store);
  },

  getRecommendationStore: (siteId: string) => {
    return readJsonFile<any>(`recommendations-${safeSiteId(siteId)}.json`, null);
  },
  saveRecommendationStore: (siteId: string, store: any) => {
    writeJsonFile(`recommendations-${safeSiteId(siteId)}.json`, store);
  },

  getContentIndex: (siteId: string) => {
    return readJsonFile<any>(`content-index-${safeSiteId(siteId)}.json`, null);
  },
  saveContentIndex: (siteId: string, index: any) => {
    writeJsonFile(`content-index-${safeSiteId(siteId)}.json`, index);
  },

  getProductionStore: (siteId: string) => {
    return readJsonFile<any>(`production-${safeSiteId(siteId)}.json`, null);
  },
  saveProductionStore: (siteId: string, store: any) => {
    writeJsonFile(`production-${safeSiteId(siteId)}.json`, store);
  },

  getPerformanceStore: (siteId: string) => {
    return readJsonFile<any>(`performance-${safeSiteId(siteId)}.json`, null);
  },
  savePerformanceStore: (siteId: string, store: any) => {
    writeJsonFile(`performance-${safeSiteId(siteId)}.json`, store);
  },

  getResearchStore: (siteId: string) => {
    return readJsonFile<any>(`research-${safeSiteId(siteId)}.json`, null);
  },
  saveResearchStore: (siteId: string, store: any) => {
    writeJsonFile(`research-${safeSiteId(siteId)}.json`, store);
  }
};
