import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';

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

export async function analyzeSiteIntelligence(siteId: string): Promise<any> {
  const site = db.getSiteById(siteId);
  const targetUrl = site.wordpress?.baseUrl || site.url || 'https://madanicamp.com';
  const ai = getAI();

  let fetchedPosts: any[] = [];
  let fetchedCategories: any[] = [];

  // 1. Fetch live metadata from WordPress REST API
  try {
    const postsRes = await fetch(`${targetUrl}/wp-json/wp/v2/posts?per_page=20&_embed`, {
      headers: { 'User-Agent': 'Madani-Content-OS/2.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (postsRes.ok) {
      fetchedPosts = await postsRes.json();
    }
  } catch (err) {
    console.warn(`Could not fetch live posts from ${targetUrl}:`, err);
  }

  try {
    const catRes = await fetch(`${targetUrl}/wp-json/wp/v2/categories?per_page=20`, {
      headers: { 'User-Agent': 'Madani-Content-OS/2.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (catRes.ok) {
      fetchedCategories = await catRes.json();
    }
  } catch (err) {
    console.warn(`Could not fetch live categories from ${targetUrl}:`, err);
  }

  const sampleTitles = fetchedPosts.map((p) => p.title?.rendered || '').filter(Boolean);
  const sampleCats = fetchedCategories.map((c) => c.name || '').filter(Boolean);

  const prompt = `شما تحلیل‌گر ارشد استراتژی محتوا، برند و وب‌سایت‌های وردپرسی هستید.
اطلاعات استخراج شده از وب‌سایت هدف:
- نام سایت: ${site.name}
- آدرس: ${targetUrl}
- توضیحات اولیه: ${site.description}
- عناوین مقالات فعال در سایت:
${sampleTitles.length > 0 ? sampleTitles.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join('\n') : 'وبلاگ جدید یا اولیه'}
- دسته‌بندی‌های موجود: ${sampleCats.join('، ') || 'مقالات و راهنما، تجهیزات کمپینگ، کوهنوردی'}

لطفاً پروفایل هوشمند کامل وب‌سایت (Site Profile) را استخراج کنید.
خروجی باید صرفاً یک آبجکت معتبر JSON با ساختار زیر باشد:
{
  "niche": "حوزه کاری دقیق و تخصصی سایت",
  "audience": ["پرسونای مخاطب ۱", "پرسونای مخاطب ۲", "پرسونای مخاطب ۳"],
  "mainTopics": ["موضوع اصلی ۱", "موضوع اصلی ۲", "موضوع اصلی ۳", "موضوع اصلی ۴"],
  "subTopics": ["زیرموضوع ۱", "زیرموضوع ۲", "زیرموضوع ۳", "زیرموضوع ۴"],
  "products": ["محصول یا خدمت کلیدی ۱", "محصول ۲", "محصول ۳"],
  "categories": ["دسته پیشنهادی ۱", "دسته پیشنهادی ۲"],
  "contentStyle": "سبک محتوایی بهینه برای این سایت",
  "brandVoice": "لحن و صدای برند (Tone of Voice)",
  "contentClusters": [
    {
      "id": "cluster-1",
      "name": "نام خوشه محتوایی ۱",
      "pillarTopic": "عنوان مقاله ستون (Pillar Article)",
      "existingArticlesCount": 1,
      "missingArticlesCount": 3,
      "topics": [
        {"title": "عنوان موضوع ۱", "keyword": "کلمه کلیدی", "status": "existing"},
        {"title": "عنوان موضوع ۲ (فرصت غایب)", "keyword": "کلمه کلیدی", "status": "missing"},
        {"title": "عنوان موضوع ۳ (فرصت غایب)", "keyword": "کلمه کلیدی", "status": "missing"}
      ]
    }
  ],
  "contentGaps": [
    {
      "id": "gap-1",
      "topic": "موضوع یا راهنمای پول‌ساز غایب در سایت",
      "competitorsCovering": 4,
      "siteCoverage": 0,
      "businessValue": 9,
      "trafficPotential": 8,
      "gapScore": 89,
      "reason": "توضیح دلیل اهمیت سئو و درآمدزایی این گپ محتوایی"
    }
  ]
}`;

  let analyzedProfile: any = null;

  if (ai) {
    try {
      const resp = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const parsed = extractJson(resp.text || '');
      if (parsed && parsed.niche && Array.isArray(parsed.contentClusters)) {
        analyzedProfile = {
          ...parsed,
          existingContentCount: fetchedPosts.length || site.profile?.existingContentCount || 6,
          lastAnalyzedAt: new Date().toISOString()
        };
      }
    } catch (err: any) {
      console.warn('Site Intelligence AI failed, using existing/fallback profile:', err.message);
    }
  }

  // Fallback to existing or domain profile
  if (!analyzedProfile) {
    analyzedProfile = site.profile || {
      niche: 'فروشگاه تخصصی تجهیزات کوهنوردی و طبیعت‌گردی',
      audience: ['کوهنوردان و طبیعت‌گردان', 'خریداران تجهیزات کمپینگ', 'ماجراجویان فضای باز'],
      mainTopics: ['کوهنوردی', 'کمپینگ', 'کفش ترکینگ', 'چادر ۴ فصل', 'کیسه خواب'],
      subTopics: ['گورتکس و ویبرام', 'دمای کامفورت', 'تیرک‌های آلومینیومی', 'ارگونومی کوله'],
      products: ['چادر کوهنوردی', 'کیسه خواب پر', 'پوتین گورتکس', 'کوله پشتی فنی'],
      categories: ['راهنما و مقالات', 'تجهیزات کمپینگ', 'کوهنوردی و کفش'],
      contentStyle: 'تخصصی، مستند، آموزنده با تکیه بر استانداردهای بین‌المللی تجهیزات',
      brandVoice: 'حرفه‌ای، با تجربه کوهستان، الهام‌بخش، صادق و راهنما',
      existingContentCount: fetchedPosts.length || 6,
      contentClusters: site.profile?.contentClusters || [],
      contentGaps: site.profile?.contentGaps || [],
      lastAnalyzedAt: new Date().toISOString()
    };
  }

  // Update site in database
  const sites = db.getSites();
  const targetIdx = sites.findIndex((s) => s.id === siteId);
  if (targetIdx >= 0) {
    sites[targetIdx].profile = analyzedProfile;
    sites[targetIdx].updatedAt = new Date().toISOString();
    db.saveSites(sites);
  }

  return analyzedProfile;
}
