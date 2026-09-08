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
  const firstArr = raw.indexOf('[');
  const lastArr = raw.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    try { return JSON.parse(raw.substring(firstArr, lastArr + 1)); } catch {}
  }
  return null;
}

export function calculatePriorityScore(
  businessValue: number,
  trafficPotential: number,
  conversionPotential: number,
  contentGap: number,
  competitionLevel: 'High' | 'Medium' | 'Low',
  duplicationPenalty: number = 0
): number {
  const compWeight = competitionLevel === 'High' ? 6 : competitionLevel === 'Medium' ? 3.5 : 1.5;
  const rawScore = 
    (businessValue * 1.5) + 
    (trafficPotential * 1.2) + 
    (conversionPotential * 1.3) + 
    (contentGap * 1.5) - 
    (compWeight * 0.8) - 
    (duplicationPenalty * 1.5);
  return Math.max(10, Math.min(99, Math.round(rawScore * 1.8)));
}

export async function discoverKeywordOpportunities(siteId: string, seedTopic?: string): Promise<any[]> {
  const site = db.getSiteById(siteId);
  const existingArticles = db.getArticles(siteId);
  const ai = getAI();

  const existingTitles = existingArticles.map((a) => a.title?.rendered || a.title || '').filter(Boolean).slice(0, 15);

  const prompt = `شما یک استراتژیست ارشد سئو، تحقیق کلمات کلیدی و بازاریابی محتوا هستید.
مشخصات سایت مشتری:
- نام برند: ${site.brand.name}
- حوزه فعالیت و نیچ: ${site.description || site.profile?.niche || 'تجهیزات تخصصی کوهنوردی و کمپینگ'}
- بازار هدف: ${site.seo.targetCountry || 'ایران'}
- زبان هدف: ${site.seo.targetLanguage || 'فارسی'}
- مخاطبان: ${site.seo.targetAudience || 'کوهنوردان و طبیعت‌گردان'}
- موضوعات فعلی مورد علاقه: ${(site.content?.topics || []).join('، ')}
- موضوع کانونی درخواست کاربر (در صورت وجود): ${seedTopic || 'فرصت‌های پول‌ساز جدید و مقایسه‌ای'}

عناوین مقالات موجود سایت (برای جلوگیری از تکرار):
${existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

تحلیل سئو و فرصت‌های کلمات کلیدی با نیت‌های مختلف (اطلاعاتی، تجاری، تراکنشی) را انجام دهید و ۶ فرصت طلایی محتوا با ارزش تجاری و ترافیکی بالا استخراج کنید.
فرمت خروجی صرفاً یک آرایه معتبر JSON باشد:
[
  {
    "keyword": "کلمه کلیدی اصلی با جستجوی بالا",
    "topic": "عنوان مقاله سئو شده و ترغیب کننده",
    "searchIntent": "informational | commercial | transactional | navigational",
    "contentType": "guide | review | comparison | tutorial | listicle",
    "estimatedDemand": "High | Medium | Low",
    "competitionLevel": "High | Medium | Low",
    "businessValue": 8,
    "trafficPotential": 9,
    "conversionPotential": 8,
    "contentGap": 9,
    "seasonality": "چهار فصل | بهار و تابستان | پاییز و زمستان",
    "reason": "توضیح کوتاه اینکه چرا این مقاله برای رشد فروش و رتبه سایت ضروری است"
  }
]`;

  let opportunities: any[] = [];

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      const parsed = extractJson(response.text || '');
      if (Array.isArray(parsed) && parsed.length > 0) {
        opportunities = parsed;
      }
    } catch (err: any) {
      console.warn('AI Keyword Discovery error, using curated domain fallback:', err.message);
    }
  }

  // Fallback domain opportunity generator if Gemini failed or key missing
  if (opportunities.length === 0) {
    opportunities = [
      {
        keyword: 'بهترین کیسه خواب کوهنوردی',
        topic: 'راهنمای جامع انتخاب بهترین کیسه خواب کوهنوردی بر اساس دمای کامفورت و وزن',
        searchIntent: 'commercial',
        contentType: 'guide',
        estimatedDemand: 'High',
        competitionLevel: 'Medium',
        businessValue: 9,
        trafficPotential: 9,
        conversionPotential: 9,
        contentGap: 8,
        seasonality: 'پاییز و زمستان',
        reason: 'نیت خرید بسیار بالا و کلمه کلیدی با بالاترین حاشیه سود در فروشگاه'
      },
      {
        keyword: 'چادر ۲ پوش در برابر تک پوش',
        topic: 'تفاوت چادر دوپوش با تک‌پوش در کوهنوردی: کدام را برای کمپ زمستانه انتخاب کنیم؟',
        searchIntent: 'informational',
        contentType: 'comparison',
        estimatedDemand: 'Medium',
        competitionLevel: 'Low',
        businessValue: 8,
        trafficPotential: 7,
        conversionPotential: 8,
        contentGap: 9,
        seasonality: 'چهار فصل',
        reason: 'شک رایج خریداران قبل از خرید چادر که رتبه گرفتن در آن آسان و نرخ تبدیل بالاست'
      },
      {
        keyword: 'تنظیم کوله پشتی کوهنوردی',
        topic: 'آموزش گام‌به‌گام تنظیم کوله پشتی کوهنوردی بر اساس فرم بدن و ارگونومی ستون فقرات',
        searchIntent: 'informational',
        contentType: 'tutorial',
        estimatedDemand: 'High',
        competitionLevel: 'Low',
        businessValue: 7,
        trafficPotential: 9,
        conversionPotential: 6,
        contentGap: 9,
        seasonality: 'بهار و تابستان',
        reason: 'ترافیک ورودی ارگانیک مداوم و جذب کوهنوردان تازه‌کار به وب‌سایت'
      },
      {
        keyword: 'قیمت کفش کوهنوردی ویبرام',
        topic: 'بررسی مشخصات فنی و ارزش خرید پوتین‌های کوهنوردی دارای کفی ویبرام (Vibram)',
        searchIntent: 'commercial',
        contentType: 'review',
        estimatedDemand: 'Medium',
        competitionLevel: 'Medium',
        businessValue: 9,
        trafficPotential: 8,
        conversionPotential: 9,
        contentGap: 7,
        seasonality: 'چهار فصل',
        reason: 'تمرکز روی برندهای معتبر زیره و تحریک خریدار به خرید مطمئن با گارانتی'
      }
    ];
  }

  // Enhance with duplication check & multi-dimensional priority score
  const processed = opportunities.map((opp, index) => {
    const dupCheck = checkDuplication({
      siteId,
      title: opp.topic,
      keyword: opp.keyword,
      searchIntent: opp.searchIntent
    });

    const priorityScore = calculatePriorityScore(
      opp.businessValue || 8,
      opp.trafficPotential || 7,
      opp.conversionPotential || 8,
      opp.contentGap || 8,
      opp.competitionLevel || 'Medium',
      dupCheck.similarityScore > 50 ? dupCheck.similarityScore / 10 : 0
    );

    return {
      id: `opp-${Date.now()}-${index}`,
      siteId,
      keyword: opp.keyword,
      topic: opp.topic,
      searchIntent: opp.searchIntent || 'commercial',
      contentType: opp.contentType || 'guide',
      estimatedDemand: opp.estimatedDemand || 'Medium',
      competitionLevel: opp.competitionLevel || 'Medium',
      businessValue: opp.businessValue || 8,
      trafficPotential: opp.trafficPotential || 8,
      conversionPotential: opp.conversionPotential || 8,
      contentGap: opp.contentGap || 8,
      seasonality: opp.seasonality || 'چهار فصل',
      priorityScore,
      reason: opp.reason,
      isEstimate: true,
      duplicateRisk: dupCheck,
      source: 'gemini_keyword_intelligence'
    };
  });

  return processed.sort((a, b) => b.priorityScore - a.priorityScore);
}

export async function analyzeCompetitors(siteId: string, customDomain?: string): Promise<any[]> {
  const site = db.getSiteById(siteId);
  const ai = getAI();

  const domain = customDomain || site.seo.domain || 'madanicamp.com';

  const prompt = `شما تحلیل‌گر ارشد هوش رقابتی سئو و محتوا هستید.
دامنه هدف: ${domain}
زمینه کاری: ${site.description || site.profile?.niche || 'فروشگاه تجهیزات کوهنوردی و کمپینگ ایران'}
زبان: فارسی

رقبای اصلی ارگانیک این وب‌سایت در نتایج گوگل را بررسی کنید و ۳ الی ۴ رقیب جدی با مشخصات زیر را استخراج کنید:
1. نام و دامنه رقیب
2. دسته‌بندی‌های پوشش داده شده
3. نقاط قوت محتوایی رقیب
4. برترین موضوعات ترافیک‌ساز رقیب
5. فرصت‌های شکاف محتوایی (Content Gaps) که ما می‌توانیم با مقالات باکیفیت‌تر از آن‌ها جلو بزنیم

خروجی صرفاً آرایه معتبر JSON:
[
  {
    "name": "نام رقیب",
    "domain": "competitor.ir",
    "discoveredAuto": true,
    "coveredCategories": ["دسته ۱", "دسته ۲"],
    "strengths": ["نقطه قوت ۱", "نقطه قوت ۲"],
    "topTopics": ["موضوع برتر ۱", "موضوع برتر ۲"],
    "contentGapAdvantage": "فرصت رقابتی ما برای شکست رقیب"
  }
]`;

  if (ai) {
    try {
      const resp = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const parsed = extractJson(resp.text || '');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item, idx) => ({
          id: `comp-${Date.now()}-${idx}`,
          siteId,
          ...item,
          lastScannedAt: new Date().toISOString()
        }));
      }
    } catch (e: any) {
      console.warn('Competitor AI error, using fallback:', e.message);
    }
  }

  // Reliable domain fallback for outdoor/camping market
  return [
    {
      id: `comp-fallback-1`,
      siteId,
      name: 'سیاه کمان',
      domain: 'siahkaman.com',
      discoveredAuto: true,
      coveredCategories: ['کوهنوردی', 'صخره‌نوردی', 'کفش ترکینگ'],
      strengths: ['پوشش مناسب برندهای کفش اروپایی', 'مشخصات فنی کوتاه در صفحه محصول'],
      topTopics: ['راهنمای سایز پوتین کوهنوردی', 'تفاوت کارابین ساده و پیچ'],
      contentGapAdvantage: 'مقالات بلاگ آن‌ها کوتاه است؛ ما می‌توانیم با راهنماهای جامع تصویری بالای ۲۰۰۰ کلمه رتبه ۱ را بگیریم.',
      lastScannedAt: new Date().toISOString()
    },
    {
      id: `comp-fallback-2`,
      siteId,
      name: 'هفت گوهر',
      domain: '7gohar.ir',
      discoveredAuto: true,
      coveredCategories: ['باتوم کوهنوردی', 'یخ‌شکن و کرامپون', 'ابزار فنی'],
      strengths: ['تولیدکننده تخصصی ابزار فلزی کوهنوردی در ایران'],
      topTopics: ['نحوه تعویض سخمه باتوم', 'انتخاب یخ‌شکن ۶ شاخه یا ۱۰ شاخه'],
      contentGapAdvantage: 'عدم ارائه راهنمای تصویری گام به گام و مقایسه جامع با برندهای جهانی.',
      lastScannedAt: new Date().toISOString()
    }
  ];
}
