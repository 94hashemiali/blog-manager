import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { db, DEFAULT_SITE_ID } from './server/db.js';
import { generateGeminiText, extractJson } from './server/geminiClient.js';
import { discoverKeywordOpportunities, analyzeCompetitors, calculatePriorityScore } from './server/seoEngine.js';
import { checkDuplication } from './server/duplicationGuard.js';
import { generateArticleWithDifferenceEngine } from './server/articleEngine.js';
import { generateVisualAsset, generateMasterVisualAsset, generateArticleImagePlan } from './server/imageEngine.js';
import { analyzeSiteIntelligence } from './server/siteIntelligence.js';
import { resolveGeneratedImagePath } from './server/visual/storage.js';
import { createVisualJob, updateVisualJob, getVisualJob } from './server/visual/jobs.js';
import {
  syncSiteIntelligence,
  getContentIndex,
  buildArticleBrief,
  createIntelligenceJob,
  updateIntelligenceJob,
  getIntelligenceJob,
  applySyncProgress,
  SYNC_STAGES
} from './server/intelligence/index.js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const DEFAULT_WP_URL = 'https://madanicamp.com';

// Cache in-memory for fast responses
let cachedCategories: any[] = [];
let lastFetchedTime = 0;

// Fallback seed posts from madanicamp.com in case of network timeouts
const SEED_POSTS = [
  {
    id: 17091,
    date: '2026-07-15T12:51:06',
    slug: 'آیا-کتونی-برای-کوهنوردی-مناسب-است',
    status: 'publish',
    link: 'https://madanicamp.com/%d8%a2%db%8c%d8%a7-%da%a9%d8%aa%d9%88%d9%86%db%8c-%d8%a8%d8%b1%d8%a7%db%8c-%da%a9%d9%88%d9%87%d9%86%d9%88%d8%b1%d8%af%db%8c-%d9%85%d9%86%d8%a7%d8%b3%d8%a8-%d8%a7%d8%b3%d8%aa%d8%9f/',
    title: { rendered: 'آیا کتونی برای کوهنوردی مناسب است؟' },
    excerpt: {
      rendered: '<p>تصور کن صبح زود، هوای خنک کوهستان به صورتت می‌خورد و آماده‌ای که دل به شیب تند مسیر بسپاری. بند کتونی روزمره‌ات را محکم می‌کنی و با خودت می‌گویی: «همین هم جواب می‌دهد!» اما آیا واقعاً کفش کتونی معمولی برای کوهنوردی مناسب است؟</p>'
    },
    content: {
      rendered: `<p class="wp-block-paragraph">تصور کن صبح زود، هوای خنک کوهستان به صورتت می‌خورد و آماده‌ای که دل به شیب تند مسیر بسپاری. بند کتونی روزمره‌ات را محکم می‌کنی و با خودت می‌گویی: «همین هم جواب می‌دهد!» اما آیا واقعاً کفش کتونی معمولی برای کوهنوردی مناسب است؟</p>
<h2>تفاوت کتونی معمولی با کفش تخصصی کوهنوردی</h2>
<p>کتونی‌های روزمره برای سطوح صاف، آسفالت و فعالیت‌های شهری طراحی شده‌اند. در مقابل، کفش‌های کوهنوردی ویژگی‌های منحصربه‌فردی دارند:</p>
<ul>
<li><strong>عاج و گریپ کفی (Outsole):</strong> کفش کوهنوردی دارای عاج‌های عمیق چندجهته (معمولاً از جنس Vibram) است که مانع از لیز خوردن روی خاک، سنگریزه و گل می‌شود.</li>
<li><strong>محافظت از مچ پا:</strong> مسیرهای کوهستانی ناهموار نیازمند حمایت محکم از مچ پا هستند تا از پیچ‌خوردگی جلوگیری شود.</li>
<li><strong>ضربه پذیری و استحکام زیره:</strong> سنگ‌های نوک‌تیز از زیره نرم کتونی‌های شهری عبور کرده و به کف پا فشار وارد می‌کنند.</li>
<li><strong>مقاومت در برابر آب و تنفس‌پذیری:</strong> استفاده از غشاهای ضدآب مانند گورتکس مانع از خیس شدن پا در مواجهه با شبنم، برف و رودخانه‌ها می‌شود.</li>
</ul>
<h2>چه زمانی می‌توان از کتونی استفاده کرد؟</h2>
<p>تنها برای پیاده‌روی‌های سبک (Trail Walking) در مسیرهای هموار و پارک‌های جنگلی مسطح می‌توان از کتونی‌های مخصوص تریل رانینگ استفاده کرد، اما برای کوهپیمایی متوسط تا سنگین حتماً باید از پوتین کوهنوردی استفاده شود.</p>`
    },
    featured_media_url: 'https://madanicamp.com/wp-content/uploads/2026/07/20250708_173211_450569-rjpv7d6w3l0p8a2ig6pjkfrmj1oevqpy6s7krudytk.jpg',
    categories: [1],
    category_names: ['مقالات'],
    tags: [],
    author_name: 'مدنی کمپ'
  },
  {
    id: 17088,
    date: '2026-07-15T12:49:01',
    slug: 'راهنمای-سایز-کفش-ورزشی-و-کوهنوردی',
    status: 'publish',
    link: 'https://madanicamp.com/%d8%b1%d8%a7%d9%87%d9%86%d9%85%d8%a7%db%8c-%d8%b3%d8%a7%db%8c%d8%b2-%da%a9%d9%81%d8%b4-%d9%88%d8%b1%d8%b2%d8%b4%db%8c-%d9%88-%da%a9%d9%88%d9%87%d9%86%d9%88%d8%b1%d8%af%db%8c/',
    title: { rendered: 'راهنمای سایز کفش ورزشی و کوهنوردی' },
    excerpt: {
      rendered: '<p>انتخاب کفش نامناسب می‌تواند تجربه کوهنوردی یا دویدن را به یک کابوس دردناک تبدیل کند. در این مقاله به صورت گام به گام نحوه اندازه‌گیری دقیق پا و انتخاب بهترین سایز کفش کوهنوردی را آموزش می‌دهیم.</p>'
    },
    content: {
      rendered: `<p>انتخاب سایز مناسب در کفش کوهنوردی کاملاً با کفش شهری متفاوت است. در شیب‌های تند رو به پایین، اگر نوک انگشتان با جلوی کفش برخورد کند، باعث کبودی ناخن‌ها و درد شدید خواهد شد.</p>
<h2>قانون طلایی: نیم تا یک سایز بزرگتر</h2>
<p>همیشه توصیه می‌شود کفش کوهنوردی را نیم تا یک سایز بزرگتر از کفش شهری خود انتخاب کنید. دلایل این موضوع عبارتند از:</p>
<ul>
<li>پوشیدن جوراب‌های ضخیم کوهنوردی یا حوله‌ای</li>
<li>ورم طبیعی پا پس از چند ساعت پیمایش مداوم</li>
<li>آزادی حرکت انگشتان در هنگام فرود</li>
</ul>
<h2>نحوه اندازه‌گیری طول پا در خانه</h2>
<ol>
<li>یک برگه کاغذ سفید را روی زمین بچسبانید.</li>
<li>پای خود را روی آن بگذارید و با مداد دور پاشنه و بلندترین انگشت خط بکشید.</li>
<li>فاصله را با خط‌کش بر حسب سانتی‌متر اندازه گرفته و با جدول سایزبندی برند مورد نظر تطبیق دهید.</li>
</ol>`
    },
    featured_media_url: 'https://madanicamp.com/wp-content/uploads/2026/07/f1ef7653-c6bf-4509-a121-5867349cba03-rpo60w23ff9xz0moqj32numd5qhm02k5c3hv3m4fwo.jpg',
    categories: [1],
    category_names: ['مقالات'],
    tags: [],
    author_name: 'مدنی کمپ'
  },
  {
    id: 17084,
    date: '2026-07-15T12:46:55',
    slug: '12-نکته-مهم-انتخاب-تجهیزات-خواب-کمپ',
    status: 'publish',
    link: 'https://madanicamp.com/12-%d9%86%da%a9%d8%aa%d9%87-%d9%85%d9%87%d9%85-%d8%a7%d9%86%d8%aa%d8%ae%d8%a7%d8%a8-%d8%aa%d8%ac%d9%87%db%8c%d8%b2%d8%a7%d8%aa-%d8%ae%d9%88%d8%a7%d8%a8-%da%a9%d9%85%d9%be/',
    title: { rendered: '12 نکته مهم انتخاب تجهیزات خواب کمپ' },
    excerpt: {
      rendered: '<p>یک خواب راحت در طبیعت انرژی شما را برای روز بعد تضمین می‌کند. کیسه خواب، زیرانداز عایق، چادر و بالش سفری ارکان اصلی سیستم خواب در کمپینگ هستند.</p>'
    },
    content: {
      rendered: `<p>خواب ناکافی یا سرد در طبیعت می‌تواند لذت هر برنامه‌ای را از بین ببرد. برای داشتن سیستم خواب بی‌نقص، این ۱۲ نکته حیاتی را بررسی کنید:</p>
<h2>۱. رتبه دمایی کیسه خواب (Comfort vs Limit)</h2>
<p>همیشه دمای Comfort (راحتی) را ملاک قرار دهید، نه دمای Extreme که صرفاً حداقل دمای زنده ماندن است!</p>
<h2>۲. کیسه خواب پر یا الیاف مصنوعی؟</h2>
<p>کیسه خواب پر سبکتر و فشرده‌تر است اما به رطوبت حساس است؛ کیسه خواب الیاف در شرایط مرطوب نیز گرما را حفظ می‌کند.</p>
<h2>۳. اهمیت فوق‌العاده زیرانداز بادی یا فومی (R-Value)</h2>
<p>بیشترین سرمای بدن از طریق زمین منتقل می‌شود نه هوا! داشتن زیرانداز با ضریب عایق (R-Value) مناسب از کیسه خواب هم مهم‌تر است.</p>`
    },
    featured_media_url: 'https://madanicamp.com/wp-content/uploads/2026/07/440614_4455_XXL-rd8cijej9yjilmr9biupiaof3dsmd6m3xrisjoyjk8.jpg',
    categories: [1],
    category_names: ['مقالات'],
    tags: [],
    author_name: 'مدنی کمپ'
  },
  {
    id: 17101,
    date: '2026-08-25T11:20:00',
    slug: 'راهنمای-خرید-چادر-کوهنوردی-۴-فصل',
    status: 'draft',
    link: 'https://madanicamp.com/?p=17101',
    title: { rendered: 'راهنمای جامع خرید چادر کوهنوردی ۴ فصل و ۲ پوش' },
    excerpt: {
      rendered: '<p>چادر ۴ فصل کوهنوردی تفاوت‌های اساسی در مقاومت تیرک‌ها، ضخامت پارچه آکسفورد، زوایای بادگیر و دریچه‌های تنفسی ضدبرف با چادرهای معمولی دارد. در این راهنما مشخصات حیاتی را مرور می‌کنیم.</p>'
    },
    content: {
      rendered: `<p>چادر کوهنوردی ۴ فصل خانه امن شما در طوفان‌ها و بارش‌های سنگین برف است. در شرایط بحرانی، مقاومت چادر مرز بین بقا و فاجعه است.</p>
<h2>۱. ساختار ژئودزیک در برابر ایگلو</h2>
<p>چادرهای ارتفاع بالا معمولاً از ساختار گنبدی ژئودزیک (Geodesic) با تیرک‌های آلومینیومی چندتقاطعی (مانند تیرک‌های DAC Featherlite) استفاده می‌کنند تا در برابر بادهای شدید و وزن برف سنگین واژگون نشوند.</p>
<h2>۲. جنس پارچه و ضریب ضدآب بودن (Waterproof Index)</h2>
<p>پوش خارجی چادر باید حداقل ضریب ضدآب ۳۰۰۰ الی ۵۰۰۰ میلی‌متر (معمولاً از جنس پلی‌استر ریپ‌استاپ با پوشش پلی‌اورتان یا سیلیکون) داشته باشد و کفی چادر حداقل ۵۰۰۰ تا ۱۰۰۰۰ میلی‌متر ضدآب باشد.</p>
<h2>۳. پوش دوم (Rainfly) و برف‌گیر (Snow Skirt)</h2>
<p>وجود لایه برفی در لبه‌های بیرونی چادر مانع از ورود باد سرد و بوران به داخل فضای تنفسی می‌شود.</p>
<h2>نکات چک‌لیست قبل از خرید:</h2>
<ul>
<li>وزن مناسب برای پیمایش انفرادی یا دونفره (زیر ۳.۵ کیلوگرم)</li>
<li>تهویه مناسب برای جلوگیری از تعریق شدید داخلی (Condensation)</li>
<li>میخ‌های برفی و طناب‌های مهار مقاوم با شب‌رنگ</li>
</ul>`
    },
    featured_media_url: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1200&q=80',
    categories: [1, 2],
    category_names: ['تجهیزات کمپینگ', 'راهنما'],
    tags: ['چادر کوهنوردی', 'کمپینگ زمستانه'],
    author_name: 'مدنی کمپ',
    is_local: false
  },
  {
    id: 17102,
    date: '2026-08-20T14:10:00',
    slug: 'نکات-نگهداری-پوتین-کوهنوردی-گورتکس',
    status: 'draft',
    link: 'https://madanicamp.com/?p=17102',
    title: { rendered: '۱۰ نکته حیاتی شستشو و نگهداری پوتین کوهنوردی گورتکس' },
    excerpt: {
      rendered: '<p>شستشوی اشتباه پوتین کوهنوردی با شوینده‌های اسیدی می‌تواند لایه تنفسی Gore-Tex را از بین ببرد. بهترین روش‌های واکس زدن، خشک کردن و نگهداری اصولی کفش در این مقاله آمده است.</p>'
    },
    content: {
      rendered: `<p>پوتین‌های تخصصی کوهنوردی از سرمایه‌گذاری‌های اساسی هر همنورد هستند. نگهداری اشتباه می‌تواند عمر مفید یک کفش ۱۰ میلیونی را به یک سال کاهش دهد.</p>
<h2>۱. هرگز کفش خیس را روی بخاری یا کنار آتش نگذارید!</h2>
<p>حرارت مستقیم باعث جمع شدن چرم نوبوک، ذوب شدن چسب‌های حرارتی زیره Vibram و خشک و شکننده شدن لایه میانی کفش می‌شود. بگذارید کفش در دمای اتاق با پر کردن روزنامه خشک شود.</p>
<h2>۲. شستشو با برس نرم و آب ولرم</h2>
<p>گل‌ولای خشک شده رطوبت چرم را بیرون می‌کشد. پس از هر برنامه، با یک فرچه نرم و آب ملایم منافذ پارچه و زیره را تمیز کنید.</p>
<h2>۳. استفاده از اسپری و واکس‌های استاندارد ضدآب‌کننده (DWR)</h2>
<p>برای بازیابی خاصیت آب‌گریزی غشای گورتکس، از اسپری‌های تخصصی پایه آب نانو بدون روغن‌های مسدودکننده استفاده نمایید.</p>`
    },
    featured_media_url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1200&q=80',
    categories: [1, 3],
    category_names: ['کوهنوردی و کفش', 'راهنما'],
    tags: ['پوتین کوهنوردی', 'نگهداری کفش'],
    author_name: 'مدنی کمپ',
    is_local: false
  },
  {
    id: 17103,
    date: '2026-08-12T09:45:00',
    slug: 'چک-لیست-تجهیزات-بقا-شب-مانی-کوهستان',
    status: 'draft',
    link: 'https://madanicamp.com/?p=17103',
    title: { rendered: 'چک‌لیست بقا و تجهیزات شب‌مانی زمستانه در کوهستان' },
    excerpt: {
      rendered: '<p>شب‌مانی در هوای سرد و ارتفاعات شوخی‌بردار نیست. چادر دوپوش، کیسه خواب پر، کپسول گاز ایزوبوتان، کیت کمک‌های اولیه و لایه‌بندی اصولی پوشاک در این چک‌لیست ضروری هستند.</p>'
    },
    content: {
      rendered: `<p>اقامت شبانه در کوهستان یکی از لذت‌بخش‌ترین و در عین حال چالش‌برانگیزترین تجارب طبیعت‌گردی است. برای ایمنی کامل، این اقلام را همراه داشته باشید:</p>
<h2>سیستم سرپناه و خواب:</h2>
<ul>
<li>کیسه خواب با دمای Comfort زیر منفی ۵ یا ۱۰ درجه بر اساس فصل</li>
<li>زیرانداز عایق با R-Value بالای ۳.۵ برای جلوگیری از هدررفت حرارت بدن به زمین</li>
<li>چادر بادوام مجهز به مهاربندهای طوفان</li>
</ul>
<h2>سیستم پخت‌وپز و آب‌رسانی:</h2>
<ul>
<li>سرشعله کوهنوردی ضدباد به همراه کپسول گاز ایزوبوتان/پروپان مخصوص سرما</li>
<li>فلاسک آب جوش دوجداره استیل</li>
<li>قرص‌های تصفیه آب یا فیلترهای مکانیکی آب</li>
</ul>
<h2>تجهیزات ناوبری و ایمنی:</h2>
<ul>
<li>هدلامپ با باتری یدکی (مقاوم در برابر سرما)</li>
<li>سوت نجات، فندک اتمی و چخماق آتش‌زنه</li>
<li>کیت کمک‌های اولیه و پتوی نجات آلومینیومی</li>
</ul>`
    },
    featured_media_url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1200&q=80',
    categories: [1, 4],
    category_names: ['کیسه خواب و چادر', 'تجهیزات کمپینگ'],
    tags: ['شب‌مانی', 'بقا در کوهستان'],
    author_name: 'مدنی کمپ',
    is_local: false
  }
];

// Initialize in-memory cache with both published and draft seed posts
let cachedPosts: any[] = [...SEED_POSTS];

async function callGemini(
  prompt: string,
  options: {
    systemInstruction?: string;
    responseMimeType?: string;
    models?: string[];
  } = {}
): Promise<string> {
  const result = await generateGeminiText({
    prompt,
    systemInstruction: options.systemInstruction,
    responseMimeType: options.responseMimeType,
    models: options.models,
    stage: 'optimize'
  });
  return result.text;
}

/**
 * Safely extract JSON objects/arrays even if formatted with markdown code fences
 */
function extractJsonFromText(rawText: string): any {
  if (!rawText) return null;
  // 1. Direct parse
  try {
    return JSON.parse(rawText.trim());
  } catch {}

  // 2. Remove markdown code blocks
  const cleaned = rawText
    .replace(/^```json\s*/gi, '')
    .replace(/^```\s*/gi, '')
    .replace(/\s*```$/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  // 3. Find outermost { ... }
  const firstCurly = rawText.indexOf('{');
  const lastCurly = rawText.lastIndexOf('}');
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    try {
      return JSON.parse(rawText.substring(firstCurly, lastCurly + 1));
    } catch {}
  }

  // 4. Find outermost [ ... ]
  const firstBracket = rawText.indexOf('[');
  const lastBracket = rawText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(rawText.substring(firstBracket, lastBracket + 1));
    } catch {}
  }

  return null;
}

// 1. Health and Status check for madanicamp.com
app.get('/api/wp/status', async (req, res) => {
  try {
    const targetUrl = (req.query.siteUrl as string) || DEFAULT_WP_URL;
    const startTime = Date.now();
    const response = await fetch(`${targetUrl}/wp-json/wp/v2/posts?per_page=1`, {
      headers: { 'User-Agent': 'Madani-Blog-Manager/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    const duration = Date.now() - startTime;

    if (response.ok) {
      const totalPosts = response.headers.get('X-WP-Total') || '3';
      res.json({
        connected: true,
        siteUrl: targetUrl,
        responseTimeMs: duration,
        totalPosts: parseInt(totalPosts, 10),
        status: 'online',
        message: 'اتصال به وردپرس برقرار است.'
      });
    } else {
      res.json({
        connected: false,
        siteUrl: targetUrl,
        status: 'error',
        statusCode: response.status,
        message: `پاسخ از سرور وردپرس: کد ${response.status}`
      });
    }
  } catch (err: any) {
    res.json({
      connected: false,
      siteUrl: DEFAULT_WP_URL,
      status: 'offline',
      message: err.message || 'خطا در برقراری ارتباط با سایت'
    });
  }
});

// 2. Get posts with live sync to madanicamp.com
app.get('/api/wp/posts', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const siteUrl = (req.query.siteUrl as string) || DEFAULT_WP_URL;
  const username = req.query.username as string | undefined;
  const appPassword = req.query.appPassword as string | undefined;
  const now = Date.now();

  // Return cached if fresh (< 30s) and not forced
  if (!forceRefresh && cachedPosts.length > 0 && now - lastFetchedTime < 30000) {
    return res.json({ posts: cachedPosts, source: 'cache', lastFetched: lastFetchedTime });
  }

  try {
    let response: any = null;

    // If WordPress credentials provided, fetch all statuses including draft & pending
    if (username && appPassword) {
      try {
        const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
        response = await fetch(`${siteUrl}/wp-json/wp/v2/posts?status=publish,draft,future,pending,private&_embed&per_page=100`, {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'User-Agent': 'Madani-Blog-Manager/1.0'
          },
          signal: AbortSignal.timeout(10000)
        });
      } catch (authErr) {
        console.warn('Authenticated fetch failed, falling back to public posts:', authErr);
      }
    }

    // If no credentials or auth request failed, fetch public posts
    if (!response || !response.ok) {
      response = await fetch(`${siteUrl}/wp-json/wp/v2/posts?_embed&per_page=50`, {
        headers: { 'User-Agent': 'Madani-Blog-Manager/1.0' },
        signal: AbortSignal.timeout(10000)
      });
    }

    if (response && response.ok) {
      const data: any = await response.json();
      const mapped = data.map((item: any) => {
        // Extract featured image
        let featuredImg = '';
        if (item._embedded?.['wp:featuredmedia']?.[0]?.source_url) {
          featuredImg = item._embedded['wp:featuredmedia'][0].source_url;
        }

        // Extract categories
        const catNames: string[] = [];
        if (item._embedded?.['wp:term']) {
          for (const group of item._embedded['wp:term']) {
            for (const term of group) {
              if (term.taxonomy === 'category') {
                catNames.push(term.name);
              }
            }
          }
        }

        // Extract author
        const author = item._embedded?.author?.[0]?.name || 'مدنی کمپ';

        return {
          id: item.id,
          date: item.date,
          modified: item.modified,
          slug: decodeURIComponent(item.slug || ''),
          status: item.status,
          link: item.link,
          title: {
            rendered: item.title?.rendered || 'بدون عنوان',
            raw: item.title?.raw
          },
          excerpt: {
            rendered: item.excerpt?.rendered || '',
            raw: item.excerpt?.raw
          },
          content: {
            rendered: item.content?.rendered || '',
            raw: item.content?.raw
          },
          featured_media_url: featuredImg,
          categories: item.categories || [],
          category_names: catNames.length > 0 ? catNames : ['مقالات'],
          tags: item.tags || [],
          author_name: author,
          is_local: false
        };
      });

      // Preserve all draft posts so they are NEVER wiped out
      const existingDrafts = cachedPosts.filter(
        (p) => p.status !== 'publish' || p.is_local || String(p.id).startsWith('draft')
      );
      const merged = [...mapped];
      for (const draft of existingDrafts) {
        if (!merged.some((p) => p.id === draft.id || (p.slug && draft.slug && p.slug === draft.slug))) {
          merged.push(draft);
        }
      }

      cachedPosts = merged;
      lastFetchedTime = now;
      return res.json({ posts: merged, source: 'live', count: merged.length });
    }
  } catch (err: any) {
    console.warn('Live fetch failed, falling back to cached/seed posts:', err.message);
  }

  // Fallback to cached or seed data
  if (cachedPosts.length === 0) {
    cachedPosts = [...SEED_POSTS];
  }
  return res.json({ posts: cachedPosts, source: 'seed_fallback', count: cachedPosts.length });
});

// 3. Save / Stage Draft locally on server
app.post('/api/wp/save-draft', (req, res) => {
  const { post } = req.body;
  if (!post || !post.title) {
    return res.status(400).json({ error: 'اطلاعات مقاله ناقص است' });
  }

  const stagedId = post.id || `draft-${Date.now()}`;
  const stagedPost = {
    ...post,
    id: stagedId,
    status: post.status || 'draft',
    date: post.date || new Date().toISOString(),
    is_local: true,
    local_updated_at: new Date().toISOString()
  };

  const existingIdx = cachedPosts.findIndex((p) => p.id === stagedId);
  if (existingIdx >= 0) {
    cachedPosts[existingIdx] = stagedPost;
  } else {
    cachedPosts.unshift(stagedPost);
  }

  res.json({ success: true, post: stagedPost, message: 'پیش‌نویس با موفقیت در سرور ذخیره شد.' });
});

// Delete a post / draft
app.delete('/api/wp/posts/:id', (req, res) => {
  const postId = req.params.id;
  cachedPosts = cachedPosts.filter((p) => String(p.id) !== String(postId));
  res.json({ success: true, message: 'مقاله حذف شد.' });
});

// 4. Get Categories
app.get('/api/wp/categories', async (req, res) => {
  try {
    const siteUrl = (req.query.siteUrl as string) || DEFAULT_WP_URL;
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/categories`, {
      signal: AbortSignal.timeout(6000)
    });
    if (response.ok) {
      const cats: any = await response.json();
      cachedCategories = cats.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        count: c.count
      }));
      return res.json({ categories: cachedCategories });
    }
  } catch (e) {
    // ignore
  }

  if (cachedCategories.length === 0) {
    cachedCategories = [
      { id: 1, name: 'مقالات و راهنما', slug: 'articles', count: 3 },
      { id: 2, name: 'تجهیزات کمپینگ', slug: 'camping-gear', count: 2 },
      { id: 3, name: 'کوهنوردی و کفش', slug: 'mountaineering', count: 2 },
      { id: 4, name: 'کیسه خواب و چادر', slug: 'sleep-systems', count: 2 }
    ];
  }
  res.json({ categories: cachedCategories });
});

// 5. Publish / Update Post to WordPress REST API
app.post('/api/wp/publish', async (req, res) => {
  const { siteUrl, username, appPassword, post } = req.body;

  if (!post || !post.title) {
    return res.status(400).json({ error: 'عنوان و محتوای پست الزامی است' });
  }

  const targetSite = siteUrl || DEFAULT_WP_URL;

  // If user provided WP credentials, attempt real WordPress REST API publish
  if (username && appPassword) {
    try {
      const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');
      const isUpdate = typeof post.id === 'number' && post.id < 900000;
      const endpoint = isUpdate
        ? `${targetSite}/wp-json/wp/v2/posts/${post.id}`
        : `${targetSite}/wp-json/wp/v2/posts`;

      const wpPayload: any = {
        title: post.title.rendered,
        content: post.content.rendered,
        status: post.status === 'publish' ? 'publish' : 'draft',
        excerpt: post.excerpt?.rendered || ''
      };
      if (post.slug) {
        wpPayload.slug = post.slug;
      }

      const wpResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(wpPayload)
      });

      if (wpResponse.ok) {
        const result: any = await wpResponse.json();
        return res.json({
          success: true,
          action: isUpdate ? 'updated' : 'created',
          post: result,
          message: isUpdate
            ? 'پست با موفقیت در وردپرس مدنی کمپ بروزرسانی شد.'
            : 'پست جدید با موفقیت در وردپرس مدنی کمپ منتشر شد.'
        });
      } else {
        const errText = await wpResponse.text();
        return res.status(wpResponse.status).json({
          error: `خطا از وردپرس: ${errText}`,
          statusCode: wpResponse.status
        });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'خطا در ارتباط با وب‌سایت وردپرس' });
    }
  }

  // If no credentials provided, stage locally in server memory/response
  const stagedId = post.id || `draft-${Date.now()}`;
  const stagedPost = {
    ...post,
    id: stagedId,
    status: post.status || 'draft',
    date: post.date || new Date().toISOString(),
    is_local: true,
    local_updated_at: new Date().toISOString()
  };

  // Add or update in cachedPosts
  const existingIdx = cachedPosts.findIndex((p) => p.id === stagedId);
  if (existingIdx >= 0) {
    cachedPosts[existingIdx] = stagedPost;
  } else {
    cachedPosts.unshift(stagedPost);
  }

  res.json({
    success: true,
    action: 'staged_locally',
    post: stagedPost,
    message: 'پست به عنوان پیش‌نویس آماده ذخیره شد. برای انتشار مستقیم در سایت، نام کاربری و رمز عبور کاربردی وردپرس (Application Password) را در بخش تنظیمات وارد کنید.'
  });
});

// 6. AI Post Generation (High availability multi-model fallback)
app.post('/api/ai/generate', async (req, res) => {
  const { topic, tone = 'educational', targetAudience = 'علاقه‌مندان به کمپینگ و کوهنوردی', keywords = [], includeFaq = true } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'موضوع مقاله باید مشخص شود.' });
  }

  try {
    const result = await generateArticleWithDifferenceEngine({
      siteId: req.body.siteId || DEFAULT_SITE_ID,
      topic,
      tone,
      targetAudience,
      keywords,
      includeFaq
    });
    return res.json({ success: true, article: result.article, brief: result.brief });
  } catch (err: any) {
    return res.status(422).json({
      success: false,
      stage: err.stage || 'article_generation',
      errorCode: err.errorCode || 'article_generation_failed',
      error: err.message,
      message: err.message,
      retryable: err.retryable !== false
    });
  }
});

// 7. AI Optimization & Suggestions (Titles, Meta, FAQs, Grammar, Full Auto SEO Suite)
app.post('/api/ai/optimize', async (req, res) => {
  const { action, title, content, focusKeyword } = req.body;

  try {
    if (action === 'auto_seo_suite') {
      const prompt = `شما کارشناس ارشد سئو (SEO Specialist) وب‌سایت مدنی کمپ (فروشگاه و مرجع کمپینگ و کوهنوردی ایران) هستید.
مقاله زیر را آنالیز کنید و یک پکیج سئوی کامل، حرفه‌ای و کاربردی تهیه کنید:
عنوان فعلی: "${title || 'بدون عنوان'}"
کلمه کلیدی کانونی (در صورت وجود): "${focusKeyword || ''}"
بخشی از محتوا:
"""
${content?.slice(0, 3000) || 'محتوایی ثبت نشده'}
"""

خروجی باید صرفاً یک آبجکت JSON معتبر و بدون هیچ تگ Markdown اضافی به فرمت زیر باشد:
{
  "titles": ["عنوان جذاب سئو شده ۱ (حاوی کلمه کلیدی)", "عنوان ۲", "عنوان ۳", "عنوان ۴", "عنوان ۵"],
  "metaDescription": "توضیحات متای ۱۲۰ تا ۱۵۵ کاراکتری بسیار ترغیب‌کننده با کلمه کلیدی اصلی و دعوت به اقدام (CTR بالا)",
  "primaryKeywords": ["کلمه کلیدی اصلی ۱", "کلمه کلیدی اصلی ۲", "کلمه کلیدی اصلی ۳"],
  "secondaryKeywords": ["کلمه کلیدی طولانی LSI ۱", "کلمه کلیدی ۲", "کلمه کلیدی ۳", "کلمه کلیدی ۴"],
  "suggestedSlug": "یک-پیوند-یکتا-انگلیسی-یا-فارسی-کوتاه",
  "h2Headings": ["سرتیتر H2 پیشنهادی ۱ برای غنی‌سازی متن", "سرتیتر H2 پیشنهادی ۲", "سرتیتر H2 پیشنهادی ۳"],
  "readabilityFeedback": "توصیه کوتاه ۲ الی ۳ جمله‌ای برای ارتقای رتبه مقاله در گوگل"
}`;

      try {
        const raw = await callGemini(prompt, { responseMimeType: 'application/json' });
        const parsedData = extractJsonFromText(raw) || extractJson(raw);
        if (parsedData) {
          return res.json({ success: true, result: parsedData });
        }
      } catch (err: any) {
        return res.status(422).json({
          success: false,
          stage: err.stage || 'optimize',
          errorCode: err.errorCode || 'seo_optimize_failed',
          error: err.message || 'Gemini could not produce SEO suggestions.',
          message: err.message || 'Gemini could not produce SEO suggestions.',
          retryable: err.retryable !== false
        });
      }

      return res.status(422).json({
        success: false,
        stage: 'optimize',
        errorCode: 'invalid_seo_json',
        error: 'Gemini returned SEO output that could not be validated.',
        message: 'Gemini returned SEO output that could not be validated.',
        retryable: true
      });
    }

    if (action === 'expand_section') {
      const prompt = `شما نویسنده متخصص بلاگ مدنی کمپ هستید. با توجه به موضوع "${title}" و محتوای کلی مقاله، لطفاً بخش یا سرتیتر زیر را به شکل کامل، جذاب، آموزنده و شامل نکات عملی و کاربردی کوهنوردی/کمپینگ در حدود ۲ الی ۳ پاراگراف بنویسید (با استفاده از مارک‌داون):
بخش مورد نظر برای توسعه: "${focusKeyword || 'توسعه متن مقاله'}"
متن فعلی:
${content?.slice(0, 1000)}`;

      const text = await callGemini(prompt);
      return res.json({ success: true, result: text });
    }

    if (action === 'generate_intro') {
      const prompt = `یک مقدمه (Hook) بسیار گیرا، پرانرژی و جذاب برای این مقاله در بلاگ مدنی کمپ بنویسید که خواننده را فوراً ترغیب به خواندن ادامه مطلب کند:
عنوان: ${title}
کلمات کلیدی: ${focusKeyword || 'کمپینگ و کوهنوردی'}`;

      const text = await callGemini(prompt);
      return res.json({ success: true, result: text });
    }

    if (action === 'generate_conclusion') {
      const prompt = `یک بخش جمع‌بندی فوق‌العاده همراه با پیام الهام‌بخش برای دوستداران طبیعت و دعوت به دیدن تجهیزات در سایت مدنی کمپ (madanicamp.com) برای این مقاله بنویسید:
عنوان: ${title}
متن مقاله: ${content?.slice(0, 1500)}`;

      const text = await callGemini(prompt);
      return res.json({ success: true, result: text });
    }

    let prompt = '';
    if (action === 'catchy_titles') {
      prompt = `برای مقاله با موضوع یا عنوان فعلی: "${title || content?.slice(0, 200)}"، ۵ عنوان جذاب، کلیک‌خور و منطبق با اصول سئو بلاگ مدنی کمپ به زبان فارسی پیشنهاد دهید. خروجی فقط یک آرایه JSON از رشته‌ها باشد: ["عنوان ۱", "عنوان ۲", ...]`;
    } else if (action === 'meta_description') {
      prompt = `برای این مقاله:
عنوان: ${title}
بخشی از محتوا: ${content?.slice(0, 800)}
یک متا دیسکریپشن (Meta Description) جذاب با حداکثر ۱۵۰ کاراکتر بنویسید که نرخ کلیک گوگل (CTR) را بالا ببرد. خروجی فقط یک رشته متنی باشد.`;
    } else if (action === 'faq_generation') {
      prompt = `با توجه به این مقاله:
عنوان: ${title}
محتوا: ${content?.slice(0, 1500)}
۴ سوال و پاسخ متداول (FAQ) کاربردی برای کوهنوردان و طبیعت‌گردان تهیه کنید. خروجی به فرمت JSON به شکل: [{"question": "...", "answer": "..."}] باشد.`;
    } else if (action === 'suggest_tags') {
      prompt = `برای مقاله ای با عنوان "${title}" در بلاگ مدنی کمپ، ۶ برچسب (Tag) مرتبط برای دسته‌بندی و سئو پیشنهاد دهید. خروجی یک آرایه JSON: ["تگ۱", "تگ۲", ...] باشد.`;
    } else {
      prompt = `لطفاً متن زیر را از نظر نگارش فارسی، نیم‌فاصله‌ها، روانی و جذابیت برای خواننده بازنویسی کنید بدون اینکه بار معنایی آن عوض شود:
${content?.slice(0, 2000)}`;
    }

    const text = await callGemini(prompt);
    return res.json({ success: true, result: text });
  } catch (err: any) {
    console.error('AI Optimize Error:', err);
    res.status(500).json({ error: err.message || 'خطا در هوش مصنوعی' });
  }
});

// 7. Smart AI Featured Image Generation (Multi-layer Intelligence & Authentic Outdoor Photography)
interface OutdoorVisualPreset {
  id: string;
  category: string;
  title: string;
  perspective: string;
  url: string;
  description: string;
}

const OUTDOOR_VISUAL_LIBRARY: Record<string, OutdoorVisualPreset[]> = {
  tent: [
    {
      id: 'tent-1',
      category: 'tent',
      title: 'چادر ۴ فصل در خط‌الرأس کوهستانی',
      perspective: 'عملکرد در شرایط سخت (Gear in Action)',
      url: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=85',
      description: 'چادر گنبدی دوپوش در غروب آفتاب با پس‌زمینه قله‌های مرتفع و تجهیزات کمپ'
    },
    {
      id: 'tent-2',
      category: 'tent',
      title: 'کمپینگ شبانه زیر آسمان پرستاره کوهستان',
      perspective: 'اتمسفر شب‌مانی و آرامش (Night Atmosphere)',
      url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1600&q=85',
      description: 'نور گرم داخل چادر در دل شب‌های بکر کوهستان با کهکشان راه شیری'
    },
    {
      id: 'tent-3',
      category: 'tent',
      title: 'جزئیات پارچه ضدآب و تیرک‌های آلومینیومی چادر',
      perspective: 'کلوزآپ تخصصی متریال (Macro Details)',
      url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1600&q=85',
      description: 'نمای نزدیک از ساختار ریپ‌استاپ، زیپ‌های آب‌بندی‌شده و طناب‌های مهار باد'
    }
  ],
  sleeping_bag: [
    {
      id: 'sleep-1',
      category: 'sleeping_bag',
      title: 'کیسه خواب پر تخصصی بازشده در ورودی چادر',
      perspective: 'تجهیزات و راحتی (Comfort in Wild)',
      url: 'https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=1600&q=85',
      description: 'کیسه خواب پر غاز با تراکم بالا رو به چشم‌انداز باز کوهستان در صبح زود'
    },
    {
      id: 'sleep-2',
      category: 'sleeping_bag',
      title: 'کوهنورد در کیسه خواب عایق زمستانه',
      perspective: 'انسان و طبیعت (Mountaineer Experience)',
      url: 'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=1600&q=85',
      description: 'تجربه خواب گرم و ایمن در دمای زیر صفر با پوشش کلاه مومیایی'
    },
    {
      id: 'sleep-3',
      category: 'sleeping_bag',
      title: 'چیدمان کیسه خواب، زیرانداز بادشونده و بالش کمپ',
      perspective: 'سیستم کامل خواب (Sleep System Setup)',
      url: 'https://images.unsplash.com/photo-1537905569824-f89f14cceb68?auto=format&fit=crop&w=1600&q=85',
      description: 'عایق‌بندی حرارتی زمین با زیرانداز آکاردئونی و کیسه خواب فشرده سبک‌وزن'
    }
  ],
  hiking_boots: [
    {
      id: 'boots-1',
      category: 'hiking_boots',
      title: 'پوتین گورتکس کوهنوردی روی سنگلاخ قله',
      perspective: 'عملکرد در مسیر سخت (Summit Traction)',
      url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1600&q=85',
      description: 'کفش کوهستان چرمی با عاج‌های عمیق ویبرام روی شیب‌های صخره‌ای'
    },
    {
      id: 'boots-2',
      category: 'hiking_boots',
      title: 'ردپای کفش کوهنوردی در پیمایش طبیعت و رودخانه',
      perspective: 'ضدآب بودن و مقاومت (Waterproof Action)',
      url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=1600&q=85',
      description: 'محافظت مچ پا و زیره مقاوم در عبور از آب و سنگ‌های مرطوب'
    },
    {
      id: 'boots-3',
      category: 'hiking_boots',
      title: 'کلوزآپ از گریپ زیره Vibram و ضربه‌گیر پنجه',
      perspective: 'طراحی فنی و متریال (Macro Sole Details)',
      url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1600&q=85',
      description: 'عاج‌های چندجهته ضدلغزش و محافظت کامل از انگشتان پا در برابر ضربات سنگ'
    }
  ],
  backpack: [
    {
      id: 'pack-1',
      category: 'backpack',
      title: 'کوله پشتی فنی کوهنوردی مستقر در قله',
      perspective: 'تجهیزات اکسپدیشن (Summit Pack)',
      url: 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=1600&q=85',
      description: 'کوله پشتی ۶۵ لیتری با تسمه‌های استاندارد و باتوم‌های متصل رو به افق'
    },
    {
      id: 'pack-2',
      category: 'backpack',
      title: 'کوهنورد در حال پیمایش خط‌الرأس با کوله استاندارد',
      perspective: 'ارگونومی و توزیع وزن (Trekking Ergonomics)',
      url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=85',
      description: 'تنظیمات دقیق کمربند لگنی و پدهای تنفسی پشت برای حفظ سلامت ستون فقرات'
    },
    {
      id: 'pack-3',
      category: 'backpack',
      title: 'چیدمان مهندسی‌شده لوازم داخل کوله پشتی (Flatlay)',
      perspective: 'سازماندهی و تفکیک بار (Pack Organization)',
      url: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1600&q=85',
      description: 'کیسه آب، لباس‌های یدک، کیت کمک‌های اولیه و ابزارهای ضروری برای دسترسی سریع'
    }
  ],
  camp_stove: [
    {
      id: 'stove-1',
      category: 'camp_stove',
      title: 'سرشعله کوهنوردی کپسولی با شعله آبی پرقدرت',
      perspective: 'پخت و پز در هوای آزاد (Alpine Cooking)',
      url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1600&q=85',
      description: 'جوش آوردن سریع آب در ارتفاعات بالا با سرشعله ضدباد تیتانیومی'
    },
    {
      id: 'stove-2',
      category: 'camp_stove',
      title: 'ماگ قهوه کمپینگ و قوری در هوای مه‌آلود صبحگاهی',
      perspective: 'حس نوستالژیک صبح کمپ (Morning Camp Coffee)',
      url: 'https://images.unsplash.com/photo-1495954484750-af469f2f9be5?auto=format&fit=crop&w=1600&q=85',
      description: 'نوشیدن چای و قهوه داغ در سکوت دل‌انگیز طبیعت کنار چادر'
    },
    {
      id: 'stove-3',
      category: 'camp_stove',
      title: 'ظروف پخت و پز سفری آنودایز شده و ست قاشق چنگال',
      perspective: 'سبک‌باری و کارایی (Lightweight Cookware)',
      url: 'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1600&q=85',
      description: 'ظروف تودرتو فشرده مقاوم در برابر حرارت بالا بدون سوختگی غذا'
    }
  ],
  survival_tools: [
    {
      id: 'tools-1',
      category: 'survival_tools',
      title: 'قطب‌نما، نقشه توپوگرافی و چراغ پیشانی ناوبری',
      perspective: 'مسیریابی و جهت‌یابی (Navigation & Safety)',
      url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1600&q=85',
      description: 'ابزارهای بقا و ناوبری دقیق در شرایط کاهش دید و کوهستان‌های ناشناخته'
    },
    {
      id: 'tools-2',
      category: 'survival_tools',
      title: 'کارد بوش‌کرفت مقاوم، آتش‌زنه و طناب پاراکورد',
      perspective: 'بقا در طبیعت (Bushcraft & Survival)',
      url: 'https://images.unsplash.com/photo-1533240332313-0db49b459ad6?auto=format&fit=crop&w=1600&q=85',
      description: 'تجهیزات فولادی سخت‌کاری شده برای بریدن چوب، برپایی پناهگاه و اضطرار'
    },
    {
      id: 'tools-3',
      category: 'survival_tools',
      title: 'جعبه کمک‌های اولیه و پتوی نجات اضطراری',
      perspective: 'ایمنی و مراقبت پزشکی (First Aid Preparedness)',
      url: 'https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=1600&q=85',
      description: 'باند استریل، قرص‌های تصفیه آب و آتل برای امداد سریع در مسیرهای دشوار'
    }
  ],
  outdoor_clothing: [
    {
      id: 'apparel-1',
      category: 'outdoor_clothing',
      title: 'کاپشن ضدباد و ضدباران گورتکس در هوای مه‌آلود',
      perspective: 'محافظت در برابر طوفان (Stormproof Shell)',
      url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?auto=format&fit=crop&w=1600&q=85',
      description: 'پارچه ۳ لایه تنفسی با درزهای کاملاً آپارات شده در صعودهای هیمالیایی'
    },
    {
      id: 'apparel-2',
      category: 'outdoor_clothing',
      title: 'لایه‌بندی لباس کوهنوردی، پلار و دستکش‌های گرم قطبی',
      perspective: 'عایق حرارتی (Thermal Layering)',
      url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=85',
      description: 'حفظ گرمای مرکزی بدن با پلار تنفسی و پوشش ضدسرما در سرمای منفی ۲۰ درجه'
    },
    {
      id: 'apparel-3',
      category: 'outdoor_clothing',
      title: 'عینک آفتابی پلاریزه کوهستان و کلاه نقاب‌دار محافظ UV',
      perspective: 'محافظت در برابر تابش شدید (Alpine Sun Protection)',
      url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
      description: 'جلوگیری از برف‌کوری و تابش اشعه‌های فرابنفش خورشید در ارتفاعات برف‌گیر'
    }
  ],
  mountain_landscape: [
    {
      id: 'scenic-1',
      category: 'mountain_landscape',
      title: 'رشته‌کوه‌های باشکوه در نور طلایی سپیده‌دم',
      perspective: 'چشم‌انداز پانورامیک (Majestic Panorama)',
      url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=85',
      description: 'قله‌های برفی احاطه شده در دریای ابرها با گرمای نور خورشید صبحگاهی'
    },
    {
      id: 'scenic-2',
      category: 'mountain_landscape',
      title: 'دریاچه زلال آلپی با انعکاس کوهستان',
      perspective: 'آرامش طبیعت بکر (Alpine Reflection)',
      url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
      description: 'آب شفاف فیروزه‌ای یخچال‌های طبیعی در دامنه‌های سرسبز کوهستان'
    },
    {
      id: 'scenic-3',
      category: 'mountain_landscape',
      title: 'مسیر مالرو و پاکوب کوهنوردی میان جنگل‌های کاج',
      perspective: 'مسیر پیمایش و ماجراجویی (Trekking Trailhead)',
      url: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?auto=format&fit=crop&w=1600&q=85',
      description: 'عبور از دالان مه و درختان کهنسال در ابتدای یک صعود فراموش‌نشدنی'
    }
  ]
};

app.post('/api/ai/generate-image', async (req, res) => {
  try {
    const {
      prompt,
      title,
      content,
      article,
      imageType = 'HERO',
      section,
      aspectRatio = '16:9',
      userFeedback,
      userInstructions,
      feedbackCode,
      productReferenceImage,
      previousGenerations,
      forceNewStrategy,
      siteId,
      articleBrief
    } = req.body;

    if (!prompt && !title && (!article || !article.title)) {
      return res.status(400).json({ error: 'عنوان یا توضیحات تصویر یا اطلاعات ساختاریافته مقاله الزامی است.' });
    }

    const effectiveTitle = title || prompt || article?.title || 'تجهیزات کوهنوردی و کمپینگ';
    const effectiveArticle = article || {
      title: effectiveTitle,
      content: content || '',
      sections: section ? [{ heading: section, text: '' }] : []
    };

    const result = await generateMasterVisualAsset({
      siteId: siteId || DEFAULT_SITE_ID,
      imageType,
      article: effectiveArticle,
      articleBrief,
      title: effectiveTitle,
      content,
      prompt,
      section,
      aspectRatio,
      userFeedback: userFeedback || userInstructions,
      userInstructions,
      feedbackCode,
      productReferenceImage,
      previousGenerations,
      forceNewStrategy
    });

    if (!result.success) {
      return res.status(422).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.error('Error in /api/ai/generate-image:', err);
    return res.status(500).json({ error: err.message || 'خطا در تولید دارایی بصری' });
  }
});

app.post('/api/ai/visual-plan', async (req, res) => {
  try {
    const { article } = req.body;
    if (!article || !article.title) {
      return res.status(400).json({ error: 'اطلاعات ساختاریافته مقاله برای تولید برنامه بصری الزامی است.' });
    }
    const plan = await generateArticleImagePlan(article, req.body.siteId, req.body.articleBrief);
    return res.json({ success: true, plan });
  } catch (err: any) {
    console.error('Error in /api/ai/visual-plan:', err);
    return res.status(500).json({ error: err.message || 'خطا در تولید پلن بصری مقاله' });
  }
});

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// =============================================================
// PART 1 & 2: MULTI-WORDPRESS WEBSITE MANAGEMENT API
// =============================================================
app.get('/api/sites', (req, res) => {
  const sites = db.getSites();
  // Sanitize application password for client security
  const sanitized = sites.map((s) => ({
    ...s,
    wordpress: {
      baseUrl: s.wordpress?.baseUrl || s.url,
      username: s.wordpress?.username || '',
      hasPassword: Boolean(s.wordpress?.applicationPassword)
    }
  }));
  res.json({ sites: sanitized });
});

app.get('/api/sites/:id', (req, res) => {
  const site = db.getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: 'سایت یافت نشد' });
  const sanitized = {
    ...site,
    wordpress: {
      baseUrl: site.wordpress?.baseUrl || site.url,
      username: site.wordpress?.username || '',
      hasPassword: Boolean(site.wordpress?.applicationPassword)
    }
  };
  res.json({ site: sanitized });
});

app.post('/api/sites', async (req, res) => {
  const { name, url, description, language = 'fa', wordpress, brand, seo, content } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'نام و آدرس سایت الزامی است' });
  }

  const cleanUrl = url.trim().replace(/\/+$/, '');
  const id = `site-${Date.now()}`;
  const newSite = {
    id,
    name: name.trim(),
    url: cleanUrl,
    description: description || '',
    language,
    wordpress: {
      baseUrl: cleanUrl,
      username: wordpress?.username || '',
      applicationPassword: wordpress?.applicationPassword || '',
      hasPassword: Boolean(wordpress?.applicationPassword)
    },
    brand: {
      name: brand?.name || name,
      description: brand?.description || description || '',
      primaryColor: brand?.primaryColor || '#059669',
      secondaryColor: brand?.secondaryColor || '#0f766e'
    },
    seo: {
      domain: seo?.domain || cleanUrl.replace(/^https?:\/\//, ''),
      targetCountry: seo?.targetCountry || 'ایران',
      targetLanguage: seo?.targetLanguage || 'فارسی',
      targetAudience: seo?.targetAudience || 'عموم کاربران و خریداران'
    },
    content: {
      tone: content?.tone || 'educational',
      topics: content?.topics || [],
      excludedTopics: content?.excludedTopics || []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const sites = db.getSites();
  sites.push(newSite);
  db.saveSites(sites);

  // Trigger non-blocking site intelligence analysis
  analyzeSiteIntelligence(id).catch((err) => console.warn('Background site intelligence failed:', err));

  res.json({ success: true, site: newSite, message: 'وب‌سایت جدید با موفقیت اضافه شد.' });
});

app.put('/api/sites/:id', (req, res) => {
  const { name, url, description, language, wordpress, brand, seo, content } = req.body;
  const sites = db.getSites();
  const idx = sites.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'سایت یافت نشد' });

  const existing = sites[idx];
  const cleanUrl = url ? url.trim().replace(/\/+$/, '') : existing.url;

  sites[idx] = {
    ...existing,
    name: name !== undefined ? name.trim() : existing.name,
    url: cleanUrl,
    description: description !== undefined ? description : existing.description,
    language: language || existing.language,
    wordpress: {
      baseUrl: cleanUrl,
      username: wordpress?.username !== undefined ? wordpress.username : existing.wordpress?.username,
      applicationPassword: wordpress?.applicationPassword !== undefined ? wordpress.applicationPassword : existing.wordpress?.applicationPassword,
      hasPassword: Boolean(wordpress?.applicationPassword || existing.wordpress?.applicationPassword)
    },
    brand: { ...existing.brand, ...brand },
    seo: { ...existing.seo, ...seo },
    content: { ...existing.content, ...content },
    updatedAt: new Date().toISOString()
  };

  db.saveSites(sites);
  res.json({ success: true, site: sites[idx], message: 'تنظیمات وب‌سایت بروزرسانی شد.' });
});

app.delete('/api/sites/:id', (req, res) => {
  if (req.params.id === DEFAULT_SITE_ID) {
    return res.status(400).json({ error: 'سایت پیش‌فرض قابل حذف نیست' });
  }
  let sites = db.getSites();
  sites = sites.filter((s) => s.id !== req.params.id);
  db.saveSites(sites);
  res.json({ success: true, message: 'وب‌سایت حذف شد' });
});

app.post('/api/sites/:id/analyze', async (req, res) => {
  try {
    const profile = await analyzeSiteIntelligence(req.params.id);
    res.json({ success: true, profile, message: 'تحلیل هوشمند وب‌سایت با موفقیت تکمیل شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'خطا در تحلیل وب‌سایت' });
  }
});

app.post('/api/sites/:id/sync', async (req, res) => {
  const siteId = req.params.id;
  const mode = req.body?.mode === 'incremental' ? 'incremental' : 'full';
  const job = createIntelligenceJob(siteId);
  res.json({ jobId: job.id, status: job.status, stage: job.stage, stages: SYNC_STAGES });
  syncSiteIntelligence({
    siteId,
    mode,
    onProgress: (progress) => applySyncProgress(job.id, progress)
  })
    .then((index) => {
      updateIntelligenceJob(job.id, {
        status: 'COMPLETED',
        stage: 'updating_intelligence',
        result: {
          articleCount: index.articles.length,
          articleTotalFromWp: index.articleTotalFromWp,
          clusterCount: index.clusters.length,
          opportunityCount: index.opportunities.length,
          woocommerceAvailable: index.woocommerceAvailable
        },
        completedAt: new Date().toISOString(),
        done: index.articles.length,
        total: index.articleTotalFromWp || index.articles.length
      });
    })
    .catch((err) => {
      updateIntelligenceJob(job.id, {
        status: 'FAILED',
        error: err.message,
        completedAt: new Date().toISOString()
      });
    });
});

app.get('/api/ai/intelligence-jobs/:id', (req, res) => {
  const job = getIntelligenceJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    id: job.id,
    siteId: job.siteId,
    status: job.status,
    stage: job.stage,
    detail: job.detail,
    done: job.done,
    total: job.total,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    result: job.result,
    error: job.error
  });
});

app.get('/api/sites/:id/intelligence', (req, res) => {
  const index = getContentIndex(req.params.id);
  res.json({
    siteId: req.params.id,
    indexedAt: index.indexedAt,
    lastSyncedAt: index.lastSyncedAt,
    lastFullSyncAt: index.lastFullSyncAt,
    lastIncrementalSyncAt: index.lastIncrementalSyncAt,
    woocommerceAvailable: index.woocommerceAvailable,
    articleCount: index.articles.length,
    articleTotalFromWp: index.articleTotalFromWp,
    categories: index.categories.length,
    products: index.products.length,
    clusters: index.clusters,
    gaps: index.gaps,
    opportunities: index.opportunities,
    isEmpty: index.articles.length === 0
  });
});

app.get('/api/sites/:id/content-health', (req, res) => {
  const index = getContentIndex(req.params.id);
  const weakClusters = index.clusters.filter((c) => c.health.score < 60);
  res.json({
    siteId: req.params.id,
    totalArticles: index.articleTotalFromWp || index.articles.length,
    indexedArticles: index.articles.length,
    categories: index.categories.length,
    clusters: index.clusters.length,
    weakClusters: weakClusters.map((c) => ({ id: c.id, name: c.name, score: c.health.score })),
    outdatedArticles: index.articles.filter((a) => a.freshness !== 'healthy').map((a) => ({
      id: a.id,
      title: a.title,
      freshness: a.freshness,
      reason: a.freshnessReason
    })),
    duplicationRisks: index.clusters.filter((c) => c.health.cannibalizationRisk !== 'none').map((c) => ({
      cluster: c.name,
      risk: c.health.cannibalizationRisk
    })),
    isSeedProfile: Boolean(db.getSiteById(req.params.id)?.profile?.isSeed)
  });
});

app.get('/api/sites/:id/opportunities', (req, res) => {
  const index = getContentIndex(req.params.id);
  res.json({ opportunities: index.opportunities, source: 'content_index' });
});

app.post('/api/sites/:id/opportunities/analyze', async (req, res) => {
  try {
    const index = await syncSiteIntelligence({ siteId: req.params.id, mode: req.body?.mode || 'incremental' });
    res.json({ opportunities: index.opportunities, indexedArticles: index.articles.length });
  } catch (err: any) {
    res.status(422).json({ success: false, message: err.message });
  }
});

app.post('/api/sites/:id/article-brief', (req, res) => {
  const index = getContentIndex(req.params.id);
  const opportunity = index.opportunities.find((o) => o.id === req.body.opportunityId) ||
    index.opportunities.find((o) => o.title === req.body.topic);
  if (!opportunity && !req.body.topic) {
    return res.status(400).json({ error: 'موضوع یا شناسه فرصت الزامی است.' });
  }
  const brief = buildArticleBrief({
    siteId: req.params.id,
    opportunity,
    topic: req.body.topic || opportunity?.title,
    audience: db.getSiteById(req.params.id)?.seo?.targetAudience,
    articles: index.articles
  });
  res.json({ success: true, brief });
});

app.post('/api/sites/:id/test-connection', async (req, res) => {
  const site = db.getSiteById(req.params.id);
  if (!site) return res.status(404).json({ error: 'سایت یافت نشد' });
  const targetUrl = site.wordpress?.baseUrl || site.url;
  const username = site.wordpress?.username;
  const appPassword = site.wordpress?.applicationPassword;

  try {
    const startTime = Date.now();
    let authHeaders: Record<string, string> = { 'User-Agent': 'Madani-Content-OS/2.0' };
    if (username && appPassword) {
      authHeaders['Authorization'] = `Basic ${Buffer.from(`${username}:${appPassword}`).toString('base64')}`;
    }

    const response = await fetch(`${targetUrl}/wp-json/wp/v2/posts?per_page=1`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(8000)
    });
    const duration = Date.now() - startTime;

    if (response.ok) {
      const totalPosts = response.headers.get('X-WP-Total') || '0';
      res.json({
        connected: true,
        siteUrl: targetUrl,
        responseTimeMs: duration,
        totalPosts: parseInt(totalPosts, 10),
        authenticated: Boolean(username && appPassword),
        status: 'online',
        message: 'اتصال به وب‌سایت وردپرس با موفقیت برقرار شد.'
      });
    } else {
      res.json({
        connected: false,
        siteUrl: targetUrl,
        statusCode: response.status,
        message: `پاسخ از سرور وردپرس: کد ${response.status}`
      });
    }
  } catch (err: any) {
    res.json({
      connected: false,
      siteUrl: targetUrl,
      message: err.message || 'خطا در برقراری ارتباط با سایت'
    });
  }
});

// =============================================================
// PART 4, 5, 6, 8: SEO, KEYWORDS, COMPETITORS & DUPLICATION API
// =============================================================
app.get('/api/seo/opportunities', async (req, res) => {
  const siteId = (req.query.siteId as string) || DEFAULT_SITE_ID;
  const seedTopic = req.query.seedTopic as string | undefined;
  try {
    const opps = await discoverKeywordOpportunities(siteId, seedTopic);
    res.json({ opportunities: opps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/seo/check-duplication', (req, res) => {
  const { siteId = DEFAULT_SITE_ID, title, keyword, searchIntent, content } = req.body;
  if (!title) return res.status(400).json({ error: 'عنوان الزامی است' });
  const result = checkDuplication({ siteId, title, keyword, searchIntent, content });
  res.json({ success: true, result });
});

app.get('/api/seo/competitors', async (req, res) => {
  const siteId = (req.query.siteId as string) || DEFAULT_SITE_ID;
  let comps = db.getCompetitors(siteId);
  if (comps.length === 0) {
    comps = await analyzeCompetitors(siteId);
    db.saveCompetitors([...db.getCompetitors(), ...comps]);
  }
  res.json({ competitors: comps });
});

app.post('/api/seo/analyze-competitors', async (req, res) => {
  const { siteId = DEFAULT_SITE_ID, customDomain } = req.body;
  try {
    const freshComps = await analyzeCompetitors(siteId, customDomain);
    const existing = db.getCompetitors().filter((c) => c.siteId !== siteId);
    db.saveCompetitors([...existing, ...freshComps]);
    res.json({ success: true, competitors: freshComps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// PART 7: CONTENT CALENDAR & TOPIC OPPORTUNITY PIPELINE
// =============================================================
app.get('/api/planner/topics', (req, res) => {
  const siteId = (req.query.siteId as string) || DEFAULT_SITE_ID;
  const topics = db.getTopics(siteId);
  res.json({ topics });
});

app.post('/api/planner/topics', (req, res) => {
  const {
    siteId = DEFAULT_SITE_ID,
    title,
    primaryKeyword,
    searchIntent = 'commercial',
    contentType = 'guide',
    priorityScore = 80,
    estimatedDemand = 'Medium',
    reason = ''
  } = req.body;
  if (!title) return res.status(400).json({ error: 'عنوان الزامی است' });

  const newTopic = {
    id: `topic-${Date.now()}`,
    siteId,
    title,
    primaryKeyword: primaryKeyword || title,
    secondaryKeywords: [],
    searchIntent,
    contentType,
    lifecycle: 'IDEA',
    priorityScore,
    businessValue: 8,
    trafficPotential: 8,
    conversionPotential: 8,
    contentGap: 8,
    competitionLevel: 'Medium',
    estimatedDemand,
    targetAudience: 'مخاطبان هدف سایت',
    reason,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const topics = db.getTopics();
  topics.unshift(newTopic);
  db.saveTopics(topics);

  res.json({ success: true, topic: newTopic });
});

app.put('/api/planner/topics/:id', (req, res) => {
  const topicId = req.params.id;
  const topics = db.getTopics();
  const idx = topics.findIndex((t) => t.id === topicId);
  if (idx === -1) return res.status(404).json({ error: 'موضوع یافت نشد' });

  topics[idx] = {
    ...topics[idx],
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  db.saveTopics(topics);
  res.json({ success: true, topic: topics[idx] });
});

app.delete('/api/planner/topics/:id', (req, res) => {
  let topics = db.getTopics();
  topics = topics.filter((t) => t.id !== req.params.id);
  db.saveTopics(topics);
  res.json({ success: true, message: 'موضوع حذف شد' });
});

// =============================================================
// PART 10, 11, 32: ARTICLE GENERATION & DIFFERENCE ENGINE API
// =============================================================
app.post('/api/ai/generate-article', async (req, res) => {
  try {
    const result = await generateArticleWithDifferenceEngine(req.body);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(422).json({
      success: false,
      stage: err.stage || 'article_generation',
      errorCode: err.errorCode || 'article_generation_failed',
      error: err.message,
      message: err.message,
      retryable: err.retryable !== false
    });
  }
});

// =============================================================
// PART 12-21: VISUAL ASSETS & NOVELTY ENGINE API
// =============================================================
app.get('/api/ai/visual-assets', (req, res) => {
  const siteId = (req.query.siteId as string) || DEFAULT_SITE_ID;
  const articleId = req.query.articleId as string | undefined;
  let images = db.getImages(siteId);
  if (articleId) {
    images = images.filter((img) => String(img.articleId) === String(articleId));
  }
  res.json({ images });
});

app.get('/api/media/generated/:filename', (req, res) => {
  const filePath = resolveGeneratedImagePath(req.params.filename);
  if (!filePath) {
    return res.status(404).json({ error: 'تصویر یافت نشد' });
  }
  return res.sendFile(filePath);
});

app.get('/api/ai/visual-jobs/:id', (req, res) => {
  const job = getVisualJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/ai/visual-assets', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.async) {
      const job = createVisualJob(body.siteId || DEFAULT_SITE_ID);
      res.json({ jobId: job.id, status: job.status, stage: job.stage });
      generateVisualAsset({
        ...body,
        onStage: (stage: string, detail?: string) => {
          updateVisualJob(job.id, { stage: stage as any, detail });
        }
      })
        .then((result) => {
          updateVisualJob(job.id, {
            status: result.success ? 'COMPLETED' : 'FAILED',
            result,
            error: result.success ? undefined : result.message,
            completedAt: new Date().toISOString(),
            stage: 'finalizing'
          });
        })
        .catch((err) => {
          updateVisualJob(job.id, {
            status: 'FAILED',
            error: err.message,
            completedAt: new Date().toISOString()
          });
        });
      return;
    }

    const result = await generateVisualAsset(body);
    if (!result.success) {
      return res.status(422).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      stage: 'image_generation',
      errorCode: 'unhandled',
      message: err.message,
      retryable: true
    });
  }
});

function markImageStatus(imageId: string, status: string, reason?: string) {
  const images = db.getImages();
  const idx = images.findIndex((img) => img.id === imageId || img.imageId === imageId);
  if (idx < 0) return null;
  images[idx].status = status;
  if (reason) images[idx].rejectionReason = reason;
  db.saveImages(images);
  return images[idx];
}

function parentArticleFromImage(targetImg: any) {
  const snap = targetImg?.visualBrief?.articleSnapshot;
  return {
    title:
      snap?.title ||
      targetImg?.visualIntent?.context ||
      targetImg?.visualConcept?.primarySubject ||
      targetImg?.persianTitle ||
      'تجهیزات فضای باز',
    content: [
      snap?.contentHint,
      targetImg?.visualIntent?.visualMessage,
      targetImg?.visualConcept?.whatIsShown,
      ...(targetImg?.visualIntent?.importantDetails || [])
    ]
      .filter(Boolean)
      .join('\n'),
    primaryKeyword: snap?.primaryKeyword,
    searchIntent: snap?.articleType
  };
}

app.post('/api/ai/visual-assets/:id/accept', (req, res) => {
  const target = markImageStatus(req.params.id, 'accepted');
  if (!target) return res.status(404).json({ error: 'تصویر یافت نشد' });
  res.json({ success: true, image: target });
});

app.post('/api/ai/visual-assets/:id/reject', async (req, res) => {
  const imageId = req.params.id;
  const { reason, userInstructions, siteId = DEFAULT_SITE_ID, feedbackCode, regenerate = true } = req.body;
  const targetImg = markImageStatus(imageId, 'rejected', reason);
  if (!targetImg) return res.status(404).json({ error: 'تصویر یافت نشد' });
  if (!regenerate) {
    return res.json({ success: true, image: targetImg });
  }
  try {
    const article = parentArticleFromImage(targetImg);
    const fresh = await generateVisualAsset({
      siteId,
      imageType: targetImg?.type || targetImg?.imageType || 'HERO',
      title: article.title,
      content: article.content,
      article,
      articleId: targetImg?.articleId,
      userFeedback: userInstructions,
      feedbackCode,
      rejectionFeedback: {
        reason: reason || 'کاربر تصویر را رد کرد',
        previousImageId: imageId,
        adjustments: userInstructions,
        code: feedbackCode
      },
      previousGenerations: targetImg?.strategy?.id ? [targetImg.strategy.id] : [],
      previousImageId: imageId,
      familyId: targetImg?.familyId || targetImg?.lineageId,
      forceNewStrategy: true,
      regenerationMode: 'different_concept'
    });
    if (!fresh.success) return res.status(422).json(fresh);
    res.json({ success: true, ...fresh, message: 'تصویر جایگزین با زاویه و استراتژی بصری نوین آماده شد.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/visual-assets/:id/regenerate', async (req, res) => {
  const targetImg = db.getImages().find((img) => img.id === req.params.id || img.imageId === req.params.id);
  if (!targetImg) return res.status(404).json({ error: 'تصویر یافت نشد' });
  const article = parentArticleFromImage(targetImg);
  const result = await generateVisualAsset({
    siteId: req.body.siteId || targetImg.siteId || DEFAULT_SITE_ID,
    imageType: targetImg.type || targetImg.imageType || 'HERO',
    title: article.title,
    content: article.content,
    article,
    articleId: targetImg.articleId,
    previousImageId: targetImg.id || targetImg.imageId,
    familyId: targetImg.familyId || targetImg.lineageId,
    regenerationMode: 'same_concept',
    userFeedback: req.body.userInstructions,
    feedbackCode: req.body.feedbackCode
  });
  if (!result.success) return res.status(422).json(result);
  res.json(result);
});

app.post('/api/ai/visual-assets/:id/regenerate-differently', async (req, res) => {
  const targetImg = db.getImages().find((img) => img.id === req.params.id || img.imageId === req.params.id);
  if (!targetImg) return res.status(404).json({ error: 'تصویر یافت نشد' });
  const article = parentArticleFromImage(targetImg);
  const result = await generateVisualAsset({
    siteId: req.body.siteId || targetImg.siteId || DEFAULT_SITE_ID,
    imageType: targetImg.type || targetImg.imageType || 'HERO',
    title: article.title,
    content: article.content,
    article,
    articleId: targetImg.articleId,
    previousImageId: targetImg.id || targetImg.imageId,
    familyId: targetImg.familyId || targetImg.lineageId,
    previousGenerations: targetImg.strategy?.id ? [targetImg.strategy.id] : [],
    forceNewStrategy: true,
    regenerationMode: 'different_concept',
    userFeedback: req.body.userInstructions || req.body.reason,
    feedbackCode: req.body.feedbackCode
  });
  if (!result.success) return res.status(422).json(result);
  res.json(result);
});

app.post('/api/ai/visual-assets/:id/feedback', async (req, res) => {
  const targetImg = db.getImages().find((img) => img.id === req.params.id || img.imageId === req.params.id);
  if (!targetImg) return res.status(404).json({ error: 'تصویر یافت نشد' });
  const article = parentArticleFromImage(targetImg);
  const result = await generateVisualAsset({
    siteId: req.body.siteId || targetImg.siteId || DEFAULT_SITE_ID,
    imageType: targetImg.type || targetImg.imageType || 'HERO',
    title: article.title,
    content: article.content,
    article,
    articleId: targetImg.articleId,
    previousImageId: targetImg.id || targetImg.imageId,
    familyId: targetImg.familyId || targetImg.lineageId,
    previousGenerations: targetImg.strategy?.id ? [targetImg.strategy.id] : [],
    forceNewStrategy: true,
    regenerationMode: req.body.feedbackCode === 'too_generic' || req.body.feedbackCode === 'too_similar'
      ? 'different_concept'
      : 'same_concept',
    userFeedback: req.body.text || req.body.reason,
    feedbackCode: req.body.feedbackCode
  });
  if (!result.success) return res.status(422).json(result);
  res.json(result);
});

// Setup Vite or Serve Static Files
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Madani Blog Project server running on port ${PORT}`);
  });
}

startServer();
