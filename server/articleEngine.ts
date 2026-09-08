import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { checkDuplication } from './duplicationGuard.js';

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!aiClient) aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return aiClient;
}

function extractJson(raw: string): any {
  if (!raw) return null;
  try { return JSON.parse(raw.trim()); } catch {}
  const cleaned = raw.replace(/^```json\s*/gi, '').replace(/^```\s*/gi, '').replace(/\s*```$/gi, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(raw.substring(first, last + 1)); } catch {}
  }
  return null;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

export interface GenerateArticleParams {
  siteId: string;
  topic: string;
  tone?: string;
  targetAudience?: string;
  keywords?: string[];
  searchIntent?: string;
  includeFaq?: boolean;
  opportunityId?: string;
  // Regeneration & Difference Engine parameters
  previousVersion?: {
    version: number;
    title: string;
    content: string;
    excerpt?: string;
  };
  regenerationInstructions?: string;
}

export async function generateArticleWithDifferenceEngine(params: GenerateArticleParams) {
  const {
    siteId,
    topic,
    tone = 'educational',
    targetAudience,
    keywords = [],
    searchIntent = 'commercial',
    includeFaq = true,
    previousVersion,
    regenerationInstructions
  } = params;

  const site = db.getSiteById(siteId);
  const existingArticles = db.getArticles(siteId);
  const ai = getAI();

  // 1. Calculate duplication check before generation
  const dupCheck = checkDuplication({ siteId, title: topic, keyword: keywords[0] });

  // 2. Formulate Internal Linking Candidates
  const internalLinkCandidates = existingArticles
    .filter((a) => a.title?.rendered && a.title.rendered !== topic)
    .slice(0, 8)
    .map((a) => ({
      id: a.id,
      title: a.title.rendered,
      slug: a.slug,
      link: a.link || `/${a.slug}`
    }));

  const brandVoice = site.profile?.brandVoice || 'حرفه‌ای، با تجربه کوهستان، الهام‌بخش و قابل اعتماد';
  const siteNiche = site.profile?.niche || 'تجهیزات کوهنوردی و کمپینگ';

  const isRegeneration = Boolean(previousVersion && previousVersion.content);

  let systemPrompt = `شما استراتژیست ارشد تولید محتوا و متخصص سئوی وب‌سایت «${site.brand.name}» (${site.url}) هستید.
زمینه تخصصی سایت: ${siteNiche}
لحن برند: ${brandVoice}
مخاطب هدف: ${targetAudience || site.seo.targetAudience || 'علاقه‌مندان به طبیعت و کوهنوردی'}

دستورالعمل نگارش:
- زبان: فارسی روان، اصیل، غنی، سلیس و بدون ترجمه ماشینی
- نگارش مقاله‌ای جامع، ساختاریافته در قالب Markdown حرفه‌ای شامل عناوین ## و ###، جداول مقایسه، نکات طلایی چکیده و باکس‌های هشدار/توصیه
- بهینه‌سازی دقیق سئو (تراکم طبیعی کلمات کلیدی، توضیحات متا با CTR بالا، اسلاگ انگلیسی مناسب)
- خروجی منحصراً در قالب JSON معتبر با ساختار زیر باشد:
{
  "title": "عنوان جذاب و سئو شده",
  "slug": "english-short-slug",
  "metaDescription": "توضیحات متای ۱۵۰ کاراکتری ترغیب‌کننده با کلمه کلیدی",
  "excerpt": "چکیده جذاب ۱ الی ۲ پاراگرافی",
  "content": "متن کامل مقاله به فرمت مارک‌داون غنی با جداول و لیست‌ها",
  "tags": ["تگ ۱", "تگ ۲", "تگ ۳", "تگ ۴"],
  "suggestedInternalLinks": [
    {"articleTitle": "عنوان مقاله مرتبط", "anchorText": "متن لنگر مناسب", "reason": "دلیل پیوند داخلی"}
  ],
  "suggestedProducts": [
    {"name": "نام محصول در فروشگاه", "category": "دسته محصول", "reason": "دلیل معرفی در این مقاله", "suggestedAnchor": "متن لینک خرید"}
  ],
  "faq": [
    {"question": "سوال ۱؟", "answer": "پاسخ کوتاه و کاربردی"}
  ]
}`;

  let userPrompt = `موضوع اصلی: ${topic}
کلمات کلیدی اصلی: ${keywords.join('، ') || topic}
نیت جستجوی کاربر (Search Intent): ${searchIntent}
لحن: ${tone}
شامل سوالات متداول: ${includeFaq ? 'بله' : 'خیر'}

مقالات موجود وب‌سایت برای ایجاد پیوندهای داخلی هوشمند:
${internalLinkCandidates.map((c, i) => `${i + 1}. ${c.title}`).join('\n')}
`;

  let changedDimensions: string[] = [];

  if (isRegeneration) {
    changedDimensions = [
      'زاویه دید و قلاب ورودی (Hook Angle)',
      'ساختار استدلال و ترتیب سرتیترها',
      'مثال‌های میدانی و چک‌لیست کاربردی',
      'تنوع در جدول مقایسه مشخصات'
    ];

    userPrompt += `
⚠️ دستورالعمل ویژه بازتولید محتوا (Difference & Regeneration Engine):
این مقاله قبلاً یک نسخه دارد (نسخه ${previousVersion?.version}).
نسخه قبلی:
عنوان قبلی: ${previousVersion?.title}
بخشی از محتوای قبلی:
"""
${previousVersion?.content.slice(0, 1500)}
"""

تغییرات الزامی برای نسخه جدید:
1. بازنویسی با زاویه دید کاملاً متفاوت و نوآورانه (Novel Perspective)
2. ساختار جدید سرتیترها و جلوگیری از تکرار همان استدلال‌های نسخه قبل
3. اضافه کردن مثال‌های میدانی جدید، معیارهای ارزیابی عمیق‌تر و چک‌لیست‌های کاربردی‌تر
${regenerationInstructions ? `دستورات خاص کاربر برای این بازتولید: «${regenerationInstructions}»` : ''}
`;
  }

  let generatedArticle: any = null;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json'
        }
      });
      const parsed = extractJson(response.text || '');
      if (parsed && parsed.title && parsed.content) {
        generatedArticle = parsed;
      }
    } catch (err: any) {
      console.warn('AI generateArticle failed, engaging smart domain fallback:', err.message);
    }
  }

  // Fallback domain synthesizer
  if (!generatedArticle) {
    const cleanTitle = isRegeneration ? `${topic} - تحلیل تخصصی و راهنمای پیشرفته ${site.brand.name}` : `${topic} - راهنمای جامع ${site.brand.name}`;
    generatedArticle = {
      title: cleanTitle,
      slug: topic.replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50),
      metaDescription: `بررسی موشکافانه و راهنمای انتخاب ${topic} در وبلاگ تخصصی ${site.brand.name}. فاکتورهای کلیدی، استانداردهای دوام و راهنمای خرید هوشمندانه.`,
      excerpt: `در این راهنمای جامع از ${site.brand.name}، تمام زوایای فنی و تجربی ${topic} را بررسی می‌کنیم تا بهترین انتخاب را در برنامه‌های طبیعت‌گردی داشته باشید.`,
      content: `# ${cleanTitle}

طبیعت‌گردی و کوهنوردی زمانی لذت‌بخش و ایمن خواهد بود که با شناخت دقیق از تجهیزات و اصول استاندارد همراه باشد. در این مقاله به بررسی عمیق **${topic}** می‌پردازیم.

---

## ۱. مبانی مهندسی و اهمیت ${topic} در شرایط سخت
هنگامی که در ارتفاعات بالا با شرایط پیش‌بینی‌نشده جوی روبرو می‌شوید، کیفیت ساخت و ارگونومی تجهیزات مرز بین یک برنامه موفق و یک موقعیت اضطراری است.

### شاخص‌های کلیدی ${site.brand.name}:
- **مقاومت در برابر فرسایش و سایش صخره‌ها:** استفاده از الیاف تقویت‌شده Ripstop
- **تنفس‌پذیری و مدیریت رطوبت:** استفاده از غشاهای تنفسی استاندارد
- **توزیع ارگونومیک وزن:** کاهش اتلاف انرژی کوهنورد در پیمایش‌های بالای ۶ ساعت

---

## ۲. جدول مقایسه فنی و راهنمای انتخاب
| فاکتور ارزیابی | مدل‌های آماتور / اقتصادی | مدل‌های تخصصی اکسپدیشن |
| :--- | :--- | :--- |
| **جنس بدنه** | پلی‌استر معمولی | نایلون ریپ‌استاپ با پوشش PU/سیلیکون |
| **وزن خالص** | نسبتاً سنگین | بهینه‌سازی شده و سبک‌وزن |
| **دوام در باد و باران** | مقاومت محدود | ۱۰۰٪ عایق‌بندی شده و دارای گواهینامه |

---

## ۳. اشتباهات رایج در استفاده و نگهداری
1. شستشو با شوینده‌های شیمیایی خورنده
2. نگهداری در محیط مرطوب و بسته
3. نادیده گرفتن تست عملکرد قبل از عزیمت به منطقه

---

## ۴. جمع‌بندی و توصیه کارشناسان ${site.brand.name}
انتخاب آگاهانه ${topic} سرمایه‌گذاری برای ایمنی و سلامت شما در کوهستان است. کارشناسان ما آماده پاسخگویی به پرسش‌های شما هستند.`,
      tags: keywords.length > 0 ? keywords : [topic, site.brand.name, 'راهنمای خرید'],
      suggestedInternalLinks: internalLinkCandidates.slice(0, 3).map((c) => ({
        articleTitle: c.title,
        anchorText: c.title,
        reason: 'افزایش ماندگاری کاربر و بهبود رتبه سئو پیوند داخلی'
      })),
      suggestedProducts: [
        {
          name: `تجهیزات مرتبط با ${topic}`,
          category: 'فروشگاه کوهنوردی',
          reason: 'نرخ تبدیل مستقیم بازدیدکننده به خریدار',
          suggestedAnchor: `مشاهده و خرید تجهیزات ${topic} در ${site.brand.name}`
        }
      ],
      faq: includeFaq
        ? [
            {
              question: `مهم‌ترین فاکتور در خرید ${topic} چیست؟`,
              answer: `تناسب وزن، استحکام متریال و سازگاری با شرایط دمایی و اقلیمی منطقه هدف.`
            },
            {
              question: `چگونه طول عمر این تجهیزات را افزایش دهیم؟`,
              answer: `تمیزکاری مداوم با برس نرم، خشک کردن در سایه و نگهداری در کاور تنفسی دور از تابش مستقیم آفتاب.`
            }
          ]
        : []
    };
  }

  const newVersionNumber = previousVersion ? previousVersion.version + 1 : 1;
  const contentHash = computeHash(generatedArticle.content);

  const versionRecord = {
    version: newVersionNumber,
    createdAt: new Date().toISOString(),
    title: generatedArticle.title,
    content: generatedArticle.content,
    excerpt: generatedArticle.excerpt,
    metaDescription: generatedArticle.metaDescription,
    generationStrategy: isRegeneration ? 'regeneration_difference_engine' : 'standard_brief_generation',
    changedDimensions: isRegeneration ? changedDimensions : ['initial_generation'],
    contentHash
  };

  return {
    article: {
      title: { rendered: generatedArticle.title },
      slug: generatedArticle.slug,
      content: { rendered: generatedArticle.content },
      excerpt: { rendered: generatedArticle.excerpt },
      meta_description: generatedArticle.metaDescription,
      tag_names: generatedArticle.tags || [],
      faq: generatedArticle.faq || [],
      suggested_internal_links: generatedArticle.suggestedInternalLinks || [],
      suggested_products: generatedArticle.suggestedProducts || [],
      version: newVersionNumber,
      versions: previousVersion ? [versionRecord] : [versionRecord],
      site_id: siteId,
      duplicate_risk: dupCheck
    },
    versionRecord,
    isRegeneration,
    changedDimensions
  };
}
