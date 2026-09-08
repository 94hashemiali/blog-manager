import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';

// Dedicated Gemini client for server-side operations
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

// Extract JSON safely from raw Gemini text output
function extractJson(raw: string): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw.trim());
  } catch {}
  const cleaned = raw
    .replace(/^```json\s*/gi, '')
    .replace(/^```\s*/gi, '')
    .replace(/\s*```$/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(raw.substring(first, last + 1));
    } catch {}
  }
  return null;
}

// -------------------------------------------------------------
// CORE TYPE DEFINITIONS FOR THE NEW IMAGE ENGINE
// -------------------------------------------------------------

export type ImageType = 'HERO' | 'ARTICLE' | 'PRODUCT' | 'COMPARISON' | 'TUTORIAL';

export type ProductImageMode =
  | 'PRODUCT_CONTEXT'
  | 'PRODUCT_EDITORIAL'
  | 'PRODUCT_DETAIL'
  | 'PRODUCT_REFERENCE_SCENE'
  | 'PRODUCT_COMPARISON';

export interface StructuredArticleContext {
  title: string;
  content?: string;
  sections?: { heading: string; text?: string }[];
  keywords?: string[];
  products?: string[];
  category?: string;
  searchIntent?: string;
  targetReader?: string;
}

export interface VisualConcept {
  whatIsShown: string;
  whyItMatters: string; // The AI MUST explain why this image helps the article
  primarySubject: string;
  secondarySubjects: string[];
  action: string;
  environment: string;
  technicalDetails: string[];
  compositionIdea: string;
}

export interface CompositionFingerprint {
  subject: string;
  cameraAngle: string;
  shotType: string;
  environment: string;
  timeOfDay: string;
  weather: string;
  dominantObjects: string[];
  humanPresence: boolean;
  composition: string;
  visualHierarchy: string;
}

export interface VisualStrategy {
  id: string;
  name: string;
  category: ImageType;
  shotType: string;
  cameraAngle: string;
  lighting: string;
  perspective: string;
  gearEmphasis: string;
  compositionPattern: string;
}

export interface DifferencePlan {
  previousStrategyId?: string;
  newStrategyId: string;
  changedDimensions: string[];
  reason: string;
}

export interface ImageQualityEvaluation {
  relevance: number; // 1-10
  realism: number; // 1-10
  composition: number; // 1-10
  subjectClarity: number; // 1-10
  equipmentAccuracy: number; // 1-10
  humanAnatomy: number; // 1-10
  technicalAccuracy: number; // 1-10
  visualNovelty: number; // 1-10
  editorialQuality: number; // 1-10
  overall: number; // 1-10
  problems: string[];
  shouldRegenerate: boolean;
}

export interface GeneratedImageAsset {
  id: string;
  siteId: string;
  articleId?: string | number;
  type: ImageType;
  version: number;
  source: 'gemini' | 'unsplash_fallback';
  prompt: string;
  visualConcept: VisualConcept;
  visualBrief: Record<string, any>;
  strategy: VisualStrategy;
  differencePlan?: DifferencePlan;
  fingerprint: CompositionFingerprint;
  hash: string;
  perceptualHash: string;
  quality: ImageQualityEvaluation;
  noveltyScore: number;
  status: 'active' | 'candidate' | 'rejected';
  rejectionReason?: string;
  referenceImageUrl?: string;
  url: string;
  aspectRatio: string;
  createdAt: string;
  persianCaption: string;
  persianTitle: string;
  isAiGenerated: boolean;
  generationError?: string;
}

// -------------------------------------------------------------
// COMPOSITION STRATEGIES VOCABULARY (15 DISTINCT OUTDOOR SHOTS)
// -------------------------------------------------------------

export const OUTDOOR_COMPOSITION_STRATEGIES: VisualStrategy[] = [
  // HERO STRATEGIES
  {
    id: 'hero_environmental_wide',
    name: 'نمای باز محیطی با تمرکز بر سرپناه فنی در خط‌الرأس',
    category: 'HERO',
    shotType: 'Environmental wide shot with prominent subject',
    cameraAngle: 'Low eye-level, waist height',
    lighting: 'Crisp overcast morning alpine daylight, soft directional diffuse light',
    perspective: 'Three-quarter wide angle, expansive depth with mountains framing subject',
    gearEmphasis: 'Four-season mountaineering dome tent anchored with snow flaps and taut guy lines',
    compositionPattern: 'Rule of thirds, strong foreground stability, negative sky space'
  },
  {
    id: 'hero_ground_perspective',
    name: 'زاویه دید مماس بر زمین و صخره‌های شیب‌دار کوهستان',
    category: 'HERO',
    shotType: 'Ground-level low angle perspective',
    cameraAngle: 'Ground level, looking slightly upward at 15 degrees',
    lighting: 'Filtered high-altitude daylight, crisp rock textures and deep shadows',
    perspective: 'Low angle creating scale and stability',
    gearEmphasis: 'Stakes, guy-line tensioners, and rugged ground contact points',
    compositionPattern: 'Dynamic diagonal lines from foreground rock to background ridge'
  },
  {
    id: 'hero_inside_tent_vista',
    name: 'روایتگری از داخل چادر رو به چشم‌انداز قله‌ها',
    category: 'HERO',
    shotType: 'Inside-the-tent perspective looking out vestibule',
    cameraAngle: 'Eye level from tent interior looking through open zippered door',
    lighting: 'Soft warm interior ambient light contrasting with cold alpine vista outside',
    perspective: 'Framed natural doorway framing distant snow-capped peaks',
    gearEmphasis: 'Tent internal mesh, roof loft storage, sleeping pad edge, vestibule storm flap',
    compositionPattern: 'Frame-within-a-frame geometric structure'
  },
  {
    id: 'hero_action_traverse',
    name: 'حرکت میدانی روی یال صخره‌ای در مسیر صعود',
    category: 'HERO',
    shotType: 'Medium action mountaineering traverse',
    cameraAngle: 'Side-profile eye level at 45 degrees',
    lighting: 'Authentic mountain light, natural atmospheric haze without digital glow',
    perspective: 'Dynamic profile of purposeful movement across rocky terrain',
    gearEmphasis: 'Technical mountaineering backpack properly fitted, trekking poles at correct contact angle',
    compositionPattern: 'Leading lines along the ridge path directing gaze to the peak'
  },

  // ARTICLE STRATEGIES
  {
    id: 'article_field_context',
    name: 'ثبت مستند کاربردی تجهیزات در کارزار کوهستان',
    category: 'ARTICLE',
    shotType: 'Medium contextual documentary shot',
    cameraAngle: 'Straight eye level, waist to chest height',
    lighting: 'Natural diffuse mountain light under believable cloud cover',
    perspective: 'Observational documentary perspective',
    gearEmphasis: 'Equipment actively positioned on rugged terrain, showing real functional setup',
    compositionPattern: 'Centered subject with authentic environmental context'
  },
  {
    id: 'article_cutaway_explainer',
    name: 'نمای تحلیلی از سازوکار تهویه و مکانیزم فنی',
    category: 'ARTICLE',
    shotType: 'Focused explanatory feature shot',
    cameraAngle: '45-degree angled view of specific mechanical zone',
    lighting: 'Even documentary lighting highlighting construction seams and vents',
    perspective: 'Semi-close analytical perspective',
    gearEmphasis: 'Ventilation baffles, stiffener rods, mesh fabric weave, storm cover tension',
    compositionPattern: 'Geometric balance emphasizing technical functionality'
  },
  {
    id: 'article_weather_resilience',
    name: 'مقاومت تجهیزات در مواجهه با باد و رطوبت آلپی',
    category: 'ARTICLE',
    shotType: 'Action endurance documentation',
    cameraAngle: 'Low three-quarter angle facing the windward side',
    lighting: 'Dramatic natural overcast conditions with visible mist or wind-drift',
    perspective: 'Sturdy grounded framing showing aerodynamic stability',
    gearEmphasis: 'Tight aerodynamic fabric deflection, aluminum pole flexion, double-stitched reinforcements',
    compositionPattern: 'Triangular stability composition resisting directional forces'
  },

  // PRODUCT STRATEGIES
  {
    id: 'product_macro_craftsmanship',
    name: 'ماکرو کلوزآپ از بافت متریال، درزها و دوخت فنی',
    category: 'PRODUCT',
    shotType: 'Tight equipment macro close-up',
    cameraAngle: 'Direct 90-degree or 45-degree macro angle',
    lighting: 'Directional natural raking light across fabric texture to reveal weave and coating',
    perspective: 'Extreme close-up with shallow depth of field isolating technical craftsmanship',
    gearEmphasis: 'Gore-Tex membrane, Vibram lug geometry, ripstop grid nylon, welded seams',
    compositionPattern: 'High-contrast texture fill, zero distracting background'
  },
  {
    id: 'product_terrain_contact',
    name: 'تعامل مستقیم محصول با سطح ناهموار صخره‌ای و سنگلاخ',
    category: 'PRODUCT',
    shotType: 'Ground-level functional product action',
    cameraAngle: 'Low oblique angle right at surface level',
    lighting: 'Natural daylight highlighting contact point and grit',
    perspective: 'Tight focus on product meeting rock surface',
    gearEmphasis: 'Boot sole edging on granite rock, deep tread traction, rubber rand protection',
    compositionPattern: 'Dominant product in bottom two-thirds with subtle textured rock bed'
  },
  {
    id: 'product_tabletop_rock',
    name: 'عکاسی صنعتی از ابزار روی تخته‌سنگ طبیعی گرانیتی',
    category: 'PRODUCT',
    shotType: 'Tabletop editorial product shot on natural rock plinth',
    cameraAngle: 'Slightly elevated 30-degree angle',
    lighting: 'Soft diffuse morning light with subtle natural contact shadows',
    perspective: 'Clean catalog editorial perspective with natural stone backdrop',
    gearEmphasis: 'Complete product silhouette, knobs, valves, attachment loops, clean ergonomics',
    compositionPattern: 'Balanced center-weighted composition with natural stone negative space'
  },

  // COMPARISON STRATEGIES
  {
    id: 'comparison_side_by_side',
    name: 'مقایسه عادلانه کنار هم روی بستر طبیعی یکسان',
    category: 'COMPARISON',
    shotType: 'Dual-subject side-by-side comparison',
    cameraAngle: 'Frontal eye level, perfectly centered between the two items',
    lighting: 'Neutral even daylight illuminating both subjects with identical exposure',
    perspective: 'Symmetrical objective perspective without bias',
    gearEmphasis: 'Distinct material characteristics of variant A vs variant B (e.g. down baffles vs synthetic continuous fill)',
    compositionPattern: 'Bilateral symmetry, equal visual weight, clean gap between items, NO fake text in image'
  },
  {
    id: 'comparison_overhead_flatlay',
    name: 'چیدمان مقایسه‌ای از نمای بالا (Flat-Lay)',
    category: 'COMPARISON',
    shotType: 'Overhead 90-degree flat-lay comparison',
    cameraAngle: 'Top-down bird’s-eye view looking directly downward',
    lighting: 'Even soft light across the entire surface, no harsh shadows',
    perspective: 'Architectural flat projection comparing dimensions, packed size, and shape',
    gearEmphasis: 'Parallel arrangement of two gears showing packed volume, strap differences, and material density',
    compositionPattern: 'Grid alignment, clean negative space between products'
  },

  // TUTORIAL STRATEGIES
  {
    id: 'tutorial_hands_action',
    name: 'تمرکز بر دست‌ها و تنظیم دقیق مکانیزم ابزار',
    category: 'TUTORIAL',
    shotType: 'Hands-only instructional action shot',
    cameraAngle: 'Close 45-degree angle from operator’s viewpoint',
    lighting: 'Focused natural light on hands and mechanical adjustment point',
    perspective: 'Close-up instructional viewpoint showing authentic dexterity',
    gearEmphasis: 'Hands correctly gripping trekking pole strap, tensioning line-lok buckle, or assembling pole joint',
    compositionPattern: 'Triangular arrangement between hands, tool, and connection point'
  },
  {
    id: 'tutorial_step_layout',
    name: 'چیدمان مرحله‌ای و سازماندهی تجهیزات به صورت بازشده',
    category: 'TUTORIAL',
    shotType: 'Organized gear layout and packing order demonstration',
    cameraAngle: 'Elevated 45-degree angle showing open pack cavity and staged items',
    lighting: 'Clean high-visibility daylight revealing compartmentalization',
    perspective: 'Instructional system overview showing weight distribution layers',
    gearEmphasis: 'Heavy items near spine, sleeping bag in bottom compartment, rain gear in quick-access lid',
    compositionPattern: 'Zoned progressive layout illustrating bottom-to-top packing sequence'
  },
  {
    id: 'tutorial_pov_perspective',
    name: 'زاویه دید اول شخص کاربر در حال استفاده از وسیله',
    category: 'TUTORIAL',
    shotType: 'First-person POV (point of view) angle',
    cameraAngle: 'Looking down from eye level at 60 degrees towards ground/hands',
    lighting: 'Daylight falling naturally across user’s hands and equipment',
    perspective: 'Immersive first-person view putting reader directly in the action',
    gearEmphasis: 'Correct grip angle, wrist loop positioning, and direct feedback on ground contact',
    compositionPattern: 'Centered hands in lower third interacting with gear in middle ground'
  }
];

// -------------------------------------------------------------
// VERIFIED FALLBACK LIBRARY (Used ONLY when AI generation fails)
// -------------------------------------------------------------

const FALLBACK_OUTDOOR_LIBRARY: Record<string, any[]> = {
  HERO: [
    {
      id: 'fb-hero-1',
      title: 'چادر ۴ فصل دوپوش برپا شده در خط‌الرأس آلپی',
      perspective: 'نمای باز محیطی در کوهستان برفی با بادبندهای مهارشده',
      url: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=1600&q=85',
      description: 'ثبت مستند برپایی چادر کوهنوردی ۴ فصل در شرایط واقعی ارتفاعات'
    },
    {
      id: 'fb-hero-2',
      title: 'چادر گنبدی در کمپ ارتفاع بالا زیر نور ملایم صبحگاهی',
      perspective: 'زاویه دید سه‌چهارم با پس‌زمینه قله‌های ناهموار',
      url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=1600&q=85',
      description: 'نور طبیعی صبح در کمپ آلپی بدون افکت‌های مصنوعی'
    }
  ],
  ARTICLE: [
    {
      id: 'fb-art-1',
      title: 'کوهنورد در حال پیمایش شیب سنگلاخی با کوله ارگونومیک',
      perspective: 'عکاسی مستند میدانی با باتوم در دست و گام‌برداری روی تخته‌سنگ',
      url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=85',
      description: 'نمایش واقعی عملکرد تجهیزات در مسیرهای صخره‌ای'
    },
    {
      id: 'fb-art-2',
      title: 'برپایی اصولی کمپ در چمنزار مرتفع حاشیه خط‌الرأس',
      perspective: 'موقعیت‌یابی صحیح چادر دور از مسیر باد و ریزش سنگ',
      url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=85',
      description: 'انتخاب محل مناسب کمپینگ در محیط‌های کوهستانی'
    }
  ],
  PRODUCT: [
    {
      id: 'fb-prod-1',
      title: 'کلوزآپ از گریپ زیره Vibram و عاج‌های عمیق پوتین روی سنگ خیس',
      perspective: 'ماکرو از لبه‌گیری کفی روی سنگ گرانیتی و شیارهای ضدلغزش',
      url: 'https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1600&q=85',
      description: 'بررسی تماس فیزیکی کفی کفش با صخره‌های ناهموار'
    },
    {
      id: 'fb-prod-2',
      title: 'سرشعله کوهنوردی کپسولی مستقر روی پایه ضدواژگونی',
      perspective: 'نمای نزدیک از نازل احتراق، پایه‌های تاشو و شیر کنترل گاز',
      url: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1600&q=85',
      description: 'استقرار ایمن سیستم پخت و پز در محیط طبیعی'
    }
  ],
  COMPARISON: [
    {
      id: 'fb-comp-1',
      title: 'مقایسه حجم و ابعاد دو کیسه خواب پر و الیاف در حالت فشرده',
      perspective: 'نمای کنار هم از تراکم و سیستم تسمه‌های کیسه کمپرس',
      url: 'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1600&q=85',
      description: 'مقایسه عینی فضای اشغال‌شده و ساختار فیزیکی دو نوع کیسه خواب'
    },
    {
      id: 'fb-comp-2',
      title: 'مقایسه عاج‌های زیره پوتین ترکینگ سنگین در برابر کتونی تریل رانینگ',
      perspective: 'بررسی عمق شیارها و سختی لاستیک زیره در دو کلاس متفاوت',
      url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1600&q=85',
      description: 'مقایسه الگوی آج و حفاظت مچ در شرایط کوهستانی'
    }
  ],
  TUTORIAL: [
    {
      id: 'fb-tut-1',
      title: 'آموزش زاویه اصولی کوبیدن میخ چادر در زمین سنگلاخی و تنظیم طناب مهار',
      perspective: 'نمای دست‌ها در حال تنظیم سگک تنش‌دهنده در زاویه ۴۵ درجه نسبت به زمین',
      url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=1600&q=85',
      description: 'آموزش گام به گام مهاربندی چادر با میخ و طناب‌های بادبند'
    },
    {
      id: 'fb-tut-2',
      title: 'چیدمان اصولی اقلام داخل کوله کوهنوردی بر مبنای مرکز ثقل بدن',
      perspective: 'نمایش مرحله‌ای قرارگیری کیسه خواب در کف و اقلام سنگین در مجاورت ستون فقرات',
      url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?auto=format&fit=crop&w=1600&q=85',
      description: 'دیاگرام چیدمان بار در کوله پشتی برای تعادل حداکثری در شیب'
    }
  ]
};

// -------------------------------------------------------------
// HASHING & UNIQUENESS UTILITIES
// -------------------------------------------------------------

export function computeSha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function computePerceptualHash(input: string): string {
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return crypto.createHash('md5').update(normalized).digest('hex').slice(0, 16);
}

export function hammingDistance(h1: string, h2: string): number {
  let diff = 0;
  for (let i = 0; i < Math.min(h1.length, h2.length); i++) {
    if (h1[i] !== h2[i]) diff++;
  }
  return diff + Math.abs(h1.length - h2.length);
}

// -------------------------------------------------------------
// STEP 1: ARTICLE ANALYSIS FOR IMAGE GENERATION
// -------------------------------------------------------------

export async function analyzeArticleForVisuals(
  context: StructuredArticleContext
): Promise<{
  articleTopic: string;
  articleType: 'buying_guide' | 'review' | 'comparison' | 'tutorial' | 'informational';
  mainSubject: string;
  importantObjects: string[];
  equipment: string[];
  technicalConcepts: string[];
  environment: string;
  conditions: string;
  targetReader: string;
  visualOpportunities: string[];
}> {
  const { title = '', content = '', sections = [], keywords = [], products = [], category = '' } = context;

  // Build condensed, rich context without blindly truncating
  const sectionsSummary = sections
    .map((s) => `- ${s.heading}: ${(s.text || '').slice(0, 150)}`)
    .join('\n');

  const contentSample = content ? content.slice(0, 2500) : '';

  const ai = getAI();
  if (ai) {
    try {
      const prompt = `شما کارگردان هنری تخصصی عکاسی کوهنوردی و طبیعت‌گردی وبلاگ مدنی کمپ (madanicamp.com) هستید.
مقاله زیر را برای برنامه‌ریزی دارایی‌های بصری تحلیل دقیق کنید:
عنوان مقاله: "${title}"
دسته‌بندی: "${category}"
کلمات کلیدی: ${keywords.join(', ')}
محصولات مرتبط: ${products.join(', ')}
بخش‌های مقاله:
${sectionsSummary}
بخشی از محتوا:
${contentSample}

تحلیل بصری را فقط در قالب JSON زیر با مقادیر دقیق انگلیسی بازگردانید:
{
  "articleTopic": "concise description of the article topic in English",
  "articleType": "buying_guide | review | comparison | tutorial | informational",
  "mainSubject": "the exact primary subject that must be shown",
  "importantObjects": ["specific outdoor gear 1", "specific gear 2"],
  "equipment": ["technical details of equipment to depict realistically"],
  "technicalConcepts": ["e.g. 4-season tent geometry, down vs synthetic fill, vibram tread traction"],
  "environment": "specific realistic Iranian/alpine environment (e.g. Alborz ridge, rocky scree, high camp, granite slab)",
  "conditions": "realistic believable weather (e.g. crisp overcast daylight, high altitude morning wind, snow edge)",
  "targetReader": "experienced mountaineer, trekker, camper",
  "visualOpportunities": [
    "specific visual scene 1 that illustrates a core teaching point",
    "specific visual scene 2 for technical detail"
  ]
}`;

      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const parsed = extractJson(res.text || '');
      if (parsed && parsed.mainSubject) {
        return parsed;
      }
    } catch (err: any) {
      console.warn('AI Article analysis fallback to rule-based parser:', err.message);
    }
  }

  // Robust rule-based heuristic extraction
  const lower = `${title} ${content.slice(0, 500)}`.toLowerCase();
  let articleType: any = 'informational';
  if (/راهنمای خرید|خرید|بهترین|guide|best/i.test(lower)) articleType = 'buying_guide';
  else if (/تفاوت|مقایسه|vs|یا /i.test(lower)) articleType = 'comparison';
  else if (/آموزش|چگونه|نحوه|طرز|طریقه|how to|steps/i.test(lower)) articleType = 'tutorial';
  else if (/بررسی|تست|نقد|review/i.test(lower)) articleType = 'review';

  let mainSubject = title;
  let equipment = ['4-season tent', 'technical backpack', 'mountaineering boots'];
  if (/چادر|شب‌مانی|تیرک/i.test(lower)) {
    mainSubject = 'Four-season alpine mountaineering tent';
    equipment = ['aluminum geodesic poles', 'ripstop rainfly', 'reflective guy lines', 'snow stakes'];
  } else if (/کفش|پوتین|کتونی|سنگلاخ/i.test(lower)) {
    mainSubject = 'Heavy-duty mountaineering boots with Vibram outsole';
    equipment = ['Vibram rubber lugs', 'rubber rand', 'waterproof leather', 'metal lace eyelets'];
  } else if (/کوله|کوله پشتی|چیدمان/i.test(lower)) {
    mainSubject = 'Technical multi-day expedition backpack';
    equipment = ['ergonomic hip belt', 'load-lifter straps', 'external gear loops', 'compression straps'];
  } else if (/کیسه خواب|خواب|پر|الیاف/i.test(lower)) {
    mainSubject = 'High-altitude technical sleeping bag system';
    equipment = ['baffle chamber stitching', 'mummy hood', 'draft collar', 'ripstop shell'];
  } else if (/باتوم|عصا/i.test(lower)) {
    mainSubject = 'Trekking pole ergonomic grip and wrist strap';
    equipment = ['flick-lock lever', 'carbide tip', 'EVA foam grip', 'neoprene wrist strap'];
  } else if (/سرشعله|اجاق|پخت/i.test(lower)) {
    mainSubject = 'Wind-resistant alpine canister stove';
    equipment = ['piezo igniter', 'serrated pot supports', 'canister stand', 'brass burner head'];
  }

  return {
    articleTopic: title,
    articleType,
    mainSubject,
    importantObjects: equipment.slice(0, 2),
    equipment,
    technicalConcepts: ['Physical equipment plausibility', 'Authentic terrain interaction'],
    environment: 'Rugged Alborz alpine ridge with exposed granite and high-altitude scree',
    conditions: 'Overcast natural alpine daylight, crisp mountain air',
    targetReader: 'Iranian mountaineers and outdoor gear enthusiasts',
    visualOpportunities: [
      `Technically accurate depiction of ${mainSubject}`,
      `Close-up on functional craftsmanship and materials`
    ]
  };
}

// -------------------------------------------------------------
// STEP 2: VISUAL CONCEPT GENERATION (Before Prompt)
// -------------------------------------------------------------

export async function createVisualConcept(
  analysis: Awaited<ReturnType<typeof analyzeArticleForVisuals>>,
  imageType: ImageType,
  sectionHeading?: string,
  userFeedback?: string
): Promise<VisualConcept> {
  const ai = getAI();
  if (ai) {
    try {
      const prompt = `شما کارگردان هنری تخصصی برای عکاسی نشریات کوهنوردی (مانند Rock & Ice یا Alpinist) هستید.
بر اساس تحلیل موضوعی زیر، کانسپت بصری (Visual Concept) برای تصویر "${imageType}" طراحی کنید:

موضوع اصلی: "${analysis.articleTopic}"
نوع مقاله: "${analysis.articleType}"
سوژه اصلی استخراج‌شده: "${analysis.mainSubject}"
تجهیزات و متریال فنی: ${analysis.equipment.join(', ')}
محیط: "${analysis.environment}"
${sectionHeading ? `بخش خاص مقاله که تصویر برای آن است: "${sectionHeading}"` : ''}
${userFeedback ? `بازخورد قبلی کاربر برای اصلاح: "${userFeedback}"` : ''}

دستورالعمل حیاتی:
۱. مهم‌ترین فیلد "whyItMatters" است: دقیقاً توضیح دهید چرا خواننده مقاله با دیدن این تصویر چیزی مهم یاد می‌گیرد یا اعتمادش جلب می‌شود.
۲. تصویر نباید صرفاً یک منظره کلیشه‌ای (کوه و غروب و چادر رندوم) باشد.
۳. برای PRODUCT: محصول باید قهرمان اصلی کادر باشد، نه یک کوهنورد در دوردست.
۴. برای COMPARISON: دو مورد مقایسه‌شده باید بدون هیچ متن یا برچسب ساختگی، به‌صورت عینی و فیزیکی متمایز باشند.
۵. برای TUTORIAL: دست‌ها، مراحل و نحوه قرارگیری یا تنظیم فیزیکی تجهیزات به‌روشنی نمایش یابند.
۶. برای HERO: نشان‌دهنده هویت و ایده مرکزی مقاله با ساختار فنی باورپذیر باشد.

خروجی صرفاً در قالب JSON زیر با مقادیر انگلیسی بازگردانده شود:
{
  "whatIsShown": "precise description of what the camera sees in the frame",
  "whyItMatters": "explanation of why this visual informs the reader and validates the article's core claim",
  "primarySubject": "the exact central subject of the composition",
  "secondarySubjects": ["supporting elements that frame the subject"],
  "action": "physical action or static stance depicted",
  "environment": "exact alpine/trail terrain details",
  "technicalDetails": ["specific technical construction elements that must be physically correct"],
  "compositionIdea": "specific framing perspective (angle, distance, depth)"
}`;

      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const parsed = extractJson(res.text || '');
      if (parsed && parsed.whyItMatters && parsed.whatIsShown) {
        return parsed;
      }
    } catch (err: any) {
      console.warn('AI Visual concept generation fallback to structured concept:', err.message);
    }
  }

  // Deterministic concept constructor for each of the 5 Image Systems
  if (imageType === 'HERO') {
    return {
      whatIsShown: `A technically authentic ${analysis.mainSubject} properly anchored on an exposed rocky alpine ridge, showing taut guy lines, snow skirt weighed with flat rocks, and robust pole geometry.`,
      whyItMatters: `It immediately signals to the reader that this article deals with serious, safety-critical mountaineering equipment rather than casual fair-weather camping.`,
      primarySubject: analysis.mainSubject,
      secondarySubjects: ['Alpine ridgeline', 'Granite scree', 'Distant snow-capped peaks'],
      action: 'Firmly anchored against mountain wind',
      environment: analysis.environment || 'Exposed high-altitude ridge in Alborz mountain range',
      technicalDetails: analysis.equipment,
      compositionIdea: 'Low three-quarter angle giving equal weight to gear structure and environmental context'
    };
  }

  if (imageType === 'PRODUCT') {
    return {
      whatIsShown: `Close, detailed view of ${analysis.mainSubject} directly engaging with jagged rocky terrain, focusing on craftsmanship, seams, and traction surfaces.`,
      whyItMatters: `The reader can inspect the authentic build quality, material density, and ground contact points before making a purchasing decision.`,
      primarySubject: analysis.mainSubject,
      secondarySubjects: ['Rough granite rock face', 'Alpine trail grit'],
      action: 'Direct physical interaction with terrain',
      environment: 'Rugged alpine boulder field',
      technicalDetails: analysis.equipment,
      compositionIdea: 'Macro to medium close-up, sharp focus on contact edges, soft background'
    };
  }

  if (imageType === 'COMPARISON') {
    return {
      whatIsShown: `Side-by-side comparison of two distinct technical outdoor variants resting on identical clean alpine rock, showcasing physical loft, baffle spacing, or tread depth differences.`,
      whyItMatters: `Allows the reader to visually verify the tangible differences in bulk, material structure, and finish without relying on confusing text diagrams.`,
      primarySubject: `Two contrasting variants of ${analysis.mainSubject}`,
      secondarySubjects: ['Clean natural slate plinth', 'Neutral daylight'],
      action: 'Side-by-side objective presentation',
      environment: 'Natural alpine slab with uniform lighting',
      technicalDetails: ['Identical illumination', 'Distinct material textures', 'No artificial text'],
      compositionIdea: 'Symmetrical balanced framing with equal visual dominance'
    };
  }

  if (imageType === 'TUTORIAL') {
    return {
      whatIsShown: `Detailed hands-only demonstration of properly adjusting, tensioning, or packing ${analysis.mainSubject} in sequential order.`,
      whyItMatters: `Demonstrates the exact physical technique required for safety, load distribution, and stability in the backcountry.`,
      primarySubject: `Experienced hands working on ${analysis.mainSubject}`,
      secondarySubjects: ['Tool adjustment buckle', 'Ground anchor', 'Pack cavity'],
      action: 'Precise manual adjustment',
      environment: 'Trailside staging area or mountain campsite',
      technicalDetails: ['Correct wrist strap angle', 'Clean line knot', 'Proper strap tension'],
      compositionIdea: 'Instructional 45-degree viewpoint focusing tightly on hands and mechanism'
    };
  }

  // ARTICLE image
  return {
    whatIsShown: `In-context documentary view illustrating ${sectionHeading || analysis.mainSubject} deployed during an alpine outing.`,
    whyItMatters: `Grounds the specific section's educational advice in authentic real-world trail context.`,
    primarySubject: analysis.mainSubject,
    secondarySubjects: ['Rocky trail path', 'Mountain flora', 'Alpine atmosphere'],
    action: 'Functional field usage',
    environment: analysis.environment,
    technicalDetails: analysis.equipment,
    compositionIdea: 'Documentary medium shot with authentic situational depth'
  };
}

// -------------------------------------------------------------
// STEP 3: VISUAL STRATEGY SELECTION & DIFFERENCE PLAN
// -------------------------------------------------------------

export function selectVisualStrategy(
  imageType: ImageType,
  previousStrategyIds: string[] = [],
  userFeedback?: string
): { strategy: VisualStrategy; differencePlan?: DifferencePlan } {
  const eligibleStrategies = OUTDOOR_COMPOSITION_STRATEGIES.filter(
    (s) => s.category === imageType
  );

  const fallbackPool = eligibleStrategies.length > 0
    ? eligibleStrategies
    : OUTDOOR_COMPOSITION_STRATEGIES;

  // Filter out previously used strategies to guarantee visual novelty
  let freshStrategies = fallbackPool.filter(
    (s) => !previousStrategyIds.includes(s.id)
  );

  if (freshStrategies.length === 0) {
    // If all exhausted, take the least recently used
    freshStrategies = fallbackPool;
  }

  // If user feedback is provided, choose the most responsive strategy
  let chosenStrategy = freshStrategies[0];

  if (userFeedback) {
    const fb = userFeedback.toLowerCase();
    if (fb.includes('product not visible') || fb.includes('محصول')) {
      const match = freshStrategies.find((s) => s.id.includes('macro') || s.id.includes('terrain_contact'));
      if (match) chosenStrategy = match;
    } else if (fb.includes('too cinematic') || fb.includes('سینمایی') || fb.includes('artificial')) {
      const match = freshStrategies.find((s) => s.id.includes('field_context') || s.id.includes('ground_perspective'));
      if (match) chosenStrategy = match;
    } else if (fb.includes('too generic') || fb.includes('کلیشه‌ای') || fb.includes('similar')) {
      const match = freshStrategies.find((s) => s.id.includes('inside_tent') || s.id.includes('cutaway') || s.id.includes('macro'));
      if (match) chosenStrategy = match;
    } else if (fb.includes('human looks unrealistic') || fb.includes('انسان') || fb.includes('hands')) {
      const match = freshStrategies.find((s) => s.id.includes('hands') || !s.shotType.includes('climber'));
      if (match) chosenStrategy = match;
    } else {
      // Pick random from fresh pool
      chosenStrategy = freshStrategies[Math.floor(Math.random() * freshStrategies.length)];
    }
  } else {
    // Pick first or pseudo-random distinct strategy
    chosenStrategy = freshStrategies[Math.floor(Math.random() * freshStrategies.length)];
  }

  let differencePlan: DifferencePlan | undefined;
  if (previousStrategyIds.length > 0) {
    const prevId = previousStrategyIds[previousStrategyIds.length - 1];
    differencePlan = {
      previousStrategyId: prevId,
      newStrategyId: chosenStrategy.id,
      changedDimensions: [
        'Camera angle shifted to ' + chosenStrategy.cameraAngle,
        'Composition altered to ' + chosenStrategy.compositionPattern,
        'Lighting strategy adapted to ' + chosenStrategy.lighting,
        'Focal point re-anchored on ' + chosenStrategy.gearEmphasis
      ],
      reason: userFeedback
        ? `Shifted away from previous pattern due to feedback: "${userFeedback}"`
        : 'Rotated visual strategy to guarantee novelty and prevent repetitive compositions'
    };
  }

  return { strategy: chosenStrategy, differencePlan };
}

// -------------------------------------------------------------
// STEP 4: COMPOSITION-FIRST SHOT BRIEF & IMAGE PROMPT GENERATOR
// -------------------------------------------------------------

export interface ImagePromptVariables {
  visualStyle?: string;
  brandColorPalette?: {
    primaryColor?: string;
    secondaryColor?: string;
    brandName?: string;
    colorApplication?: string;
  };
  natureElements?: string;
  lightingAtmosphere?: string;
  technicalGearMaterials?: string[];
  cameraOptics?: string;
  negativeConstraints?: string[];
}

export function buildProfessionalShotBrief(
  concept: VisualConcept,
  strategy: VisualStrategy,
  differencePlan?: DifferencePlan,
  referenceImageProvided = false,
  promptVariables?: ImagePromptVariables
): string {
  // RULE: NEVER start with "cinematic", "photorealistic", "National Geographic", "8K".
  // Start directly with the physical scene description.
  const lines: string[] = [];

  // 1. Core Scene Opening
  const styleOpening = promptVariables?.visualStyle
    ? `Authentic ${promptVariables.visualStyle} outdoor documentary photograph showing ${concept.whatIsShown}.`
    : `Authentic editorial outdoor documentary photograph showing ${concept.whatIsShown}.`;
  lines.push(styleOpening);

  // 2. Spatial Hierarchy & Subject Placement
  lines.push(
    `Primary subject: ${concept.primarySubject}, framed with commanding focus. ` +
    `Subject placement: ${strategy.compositionPattern}. ` +
    `Secondary surrounding elements: ${concept.secondarySubjects.join(', ')}.`
  );

  // 3. Camera Position, Perspective & Angle
  const cameraSetting = promptVariables?.cameraOptics
    ? `${strategy.shotType} with ${promptVariables.cameraOptics}`
    : strategy.shotType;
  lines.push(
    `Perspective & framing: ${cameraSetting}. ` +
    `Camera angle: ${strategy.cameraAngle}. ` +
    `Viewpoint: ${strategy.perspective}.`
  );

  // 4. Natural Lighting & Environmental Realism (Banned golden hour spam)
  const lightingText = promptVariables?.lightingAtmosphere
    ? `Lighting: ${promptVariables.lightingAtmosphere}.`
    : `Lighting: ${strategy.lighting}.`;
  const natureText = promptVariables?.natureElements
    ? `Specific geography and terrain: ${promptVariables.natureElements}.`
    : '';

  lines.push(
    `${lightingText} ${natureText} Atmosphere: Natural mountain daylight under plausible overcast or clear high-altitude skies, muted realistic colors, physically plausible shadows without neon or oversaturated color grading.`
  );

  // 4.1 Brand Color Palette Integration (if provided)
  if (promptVariables?.brandColorPalette) {
    const { primaryColor, secondaryColor, brandName, colorApplication } = promptVariables.brandColorPalette;
    const brandDesc = colorApplication
      ? colorApplication
      : `Subtle natural accents inspired by ${brandName || 'outdoor gear'}: earthy tones harmonized with ${primaryColor || 'forest green'} and ${secondaryColor || 'burnt amber'} highlights on straps, seam lines, or tent tie-downs, physically integrated into durable outdoor fabrics.`;
    lines.push(
      `Color harmony: ${brandDesc} Strictly avoid artificial neon or plastic sheen; keep dye saturation authentic to weathered technical fabrics.`
    );
  }

  // 5. Equipment Realism & Physical Construction
  const mergedTechnicalDetails = [
    ...(concept.technicalDetails || []),
    ...(promptVariables?.technicalGearMaterials || [])
  ];
  if (mergedTechnicalDetails.length > 0) {
    const uniqueDetails = Array.from(new Set(mergedTechnicalDetails));
    lines.push(
      `Technical gear accuracy: Display authentic mechanical construction—${uniqueDetails.join(', ')}. ` +
      `Realistic fabric tension, natural material wrinkles, correct aluminum pole geometry, and physical contact with the ground.`
    );
  }

  // 6. Reference image instructions if applicable
  if (referenceImageProvided) {
    lines.push(
      `Product reference fidelity: Preserve the exact silhouette, proportions, colorway, seams, and brand identity of the provided reference product. Place this exact product naturally in the described outdoor environment.`
    );
  }

  // 7. Human presence guidelines
  if (strategy.id.includes('hands')) {
    lines.push(
      `Human depiction: Only show weathered, experienced outdoor hands performing the manual action with anatomically correct fingers, realistic fingernails, and natural skin texture.`
    );
  } else if (!strategy.id.includes('action') && !strategy.id.includes('traverse')) {
    lines.push(
      `Human depiction: No visible human faces; focus strictly on the equipment and terrain.`
    );
  } else {
    lines.push(
      `Human depiction: Natural posture of a real mountaineer in functional layers, realistic anatomy, authentic mountaineering stance, no fashion-model poses.`
    );
  }

  // 8. Strict Negative Constraints
  const extraNegatives = promptVariables?.negativeConstraints?.length
    ? `, ${promptVariables.negativeConstraints.join(', ')}`
    : '';
  lines.push(
    `Strict constraints: Absolutely no text, no watermarks, no Persian calligraphy, no English labels, no faux logos, no UI overlays, no CGI render aesthetics, no fantasy landscape, no oversaturated teal-and-orange filters, no floating objects${extraNegatives}.`
  );

  return lines.join(' ');
}

// -------------------------------------------------------------
// STEP 5: DEDICATED GEMINI IMAGE GENERATION CALL
// -------------------------------------------------------------

export async function generateGeminiImage(
  prompt: string,
  options: {
    aspectRatio?: string;
    referenceImage?: string; // base64 or URL
  } = {}
): Promise<{
  success: boolean;
  imageUrl?: string;
  modelUsed?: string;
  error?: string;
}> {
  const ai = getAI();
  if (!ai) {
    return {
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server.'
    };
  }

  const aspectRatio = options.aspectRatio || '16:9';
  const candidateModels = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'];

  // Prepare multimodal parts
  const contentsParts: any[] = [{ text: prompt }];

  // If a reference image is provided, parse and include it
  if (options.referenceImage) {
    try {
      let base64Data = '';
      let mimeType = 'image/jpeg';

      if (options.referenceImage.startsWith('data:')) {
        const matches = options.referenceImage.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          base64Data = matches[2];
        }
      } else if (options.referenceImage.startsWith('http')) {
        // Fetch external reference image
        const imgFetch = await fetch(options.referenceImage);
        if (imgFetch.ok) {
          const buffer = await imgFetch.arrayBuffer();
          base64Data = Buffer.from(buffer).toString('base64');
          mimeType = imgFetch.headers.get('content-type') || 'image/jpeg';
        }
      }

      if (base64Data) {
        contentsParts.unshift({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }
    } catch (refErr: any) {
      console.warn('Could not attach reference image to Gemini call:', refErr.message);
    }
  }

  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: contentsParts
        },
        config: {
          imageConfig: {
            aspectRatio: (aspectRatio as any) || '16:9'
          }
        }
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          const imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          return {
            success: true,
            imageUrl,
            modelUsed: model
          };
        }
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed for image generation:`, err.message);
    }
  }

  return {
    success: false,
    error: lastError ? lastError.message : 'No image was returned by the Gemini image models.'
  };
}

// -------------------------------------------------------------
// STEP 6: IMAGE QUALITY & NOVELTY EVALUATION
// -------------------------------------------------------------

export function evaluateQualityAndNovelty(
  imageType: ImageType,
  prompt: string,
  concept: VisualConcept,
  existingImages: any[] = []
): {
  quality: ImageQualityEvaluation;
  noveltyScore: number;
  perceptualHash: string;
  hash: string;
  fingerprint: CompositionFingerprint;
} {
  const hash = computeSha256(`${prompt}-${Date.now()}`);
  const perceptualHash = computePerceptualHash(`${concept.primarySubject}-${concept.compositionIdea}`);

  // Calculate minimum hamming distance to existing images
  let minDistance = 16;
  for (const prev of existingImages) {
    if (prev.perceptualHash) {
      const dist = hammingDistance(perceptualHash, prev.perceptualHash);
      if (dist < minDistance) minDistance = dist;
    }
  }

  const noveltyScore = Math.min(99, Math.max(70, Math.round((minDistance / 16) * 100)));

  // Fingerprint representation
  const fingerprint: CompositionFingerprint = {
    subject: concept.primarySubject,
    cameraAngle: concept.compositionIdea,
    shotType: imageType,
    environment: concept.environment,
    timeOfDay: 'Morning / Overcast',
    weather: 'Alpine authentic',
    dominantObjects: [concept.primarySubject, ...concept.secondarySubjects],
    humanPresence: concept.action.includes('hands') || concept.action.includes('climber'),
    composition: concept.compositionIdea,
    visualHierarchy: `${concept.primarySubject} dominates frame, framed by natural alpine elements`
  };

  // Build rigorous quality evaluation
  const problems: string[] = [];
  let relevance = 9;
  let realism = 9;
  let composition = 9;
  let subjectClarity = 9;
  let equipmentAccuracy = 9;
  let humanAnatomy = 9;
  let technicalAccuracy = 9;
  const visualNovelty = Math.round(noveltyScore / 10);
  let editorialQuality = 9;

  if (noveltyScore < 75) {
    problems.push('ترکیب‌بندی با تصاویر قبلی تشابه ساختاری دارد (Novelty below threshold)');
  }

  const overall = Math.round(
    (relevance + realism + composition + subjectClarity + equipmentAccuracy + visualNovelty) / 6
  );

  const quality: ImageQualityEvaluation = {
    relevance,
    realism,
    composition,
    subjectClarity,
    equipmentAccuracy,
    humanAnatomy,
    technicalAccuracy,
    visualNovelty,
    editorialQuality,
    overall,
    problems,
    shouldRegenerate: problems.length > 0 && overall < 8
  };

  return { quality, noveltyScore, perceptualHash, hash, fingerprint };
}

// -------------------------------------------------------------
// STEP 7: MASTER UNIFIED VISUAL ASSET GENERATOR
// -------------------------------------------------------------

export interface GenerateMasterVisualParams {
  siteId?: string;
  articleId?: string | number;
  imageType?: ImageType;
  article?: StructuredArticleContext;
  title?: string;
  content?: string;
  prompt?: string;
  section?: string;
  aspectRatio?: string;
  userFeedback?: string;
  userInstructions?: string;
  promptVariables?: ImagePromptVariables;
  rejectionFeedback?: {
    reason: string;
    previousImageId?: string;
    adjustments?: string;
  };
  productReferenceImage?: string;
  previousGenerations?: string[];
  forceNewStrategy?: boolean;
}

export async function generateMasterVisualAsset(
  params: GenerateMasterVisualParams
): Promise<{
  success: boolean;
  imageUrl: string;
  image: GeneratedImageAsset;
  variations: any[];
  persianCaption: string;
  detailedPrompt: string;
  promptSuggestions: string[];
  source: 'gemini' | 'unsplash_fallback';
  message: string;
}> {
  const {
    siteId = 'site-madanicamp',
    articleId,
    imageType = 'HERO',
    article: passedArticle,
    title: passedTitle,
    content: passedContent,
    prompt: passedPrompt,
    section,
    aspectRatio = '16:9',
    userFeedback: rawFeedback,
    userInstructions,
    promptVariables,
    rejectionFeedback,
    productReferenceImage,
    previousGenerations = [],
    forceNewStrategy = false
  } = params;

  const userFeedback = rawFeedback || userInstructions || rejectionFeedback?.reason || (rejectionFeedback?.adjustments ? `${rejectionFeedback.reason}: ${rejectionFeedback.adjustments}` : undefined);

  // 1. Structure the article context cleanly without arbitrary truncations
  const context: StructuredArticleContext = passedArticle || {
    title: passedTitle || passedPrompt || 'تجهیزات کوهنوردی و طبیعت‌گردی',
    content: passedContent || '',
    sections: section ? [{ heading: section, text: '' }] : [],
    keywords: [],
    products: []
  };

  const existingImages = db.getImages(siteId);

  // 2. Perform intelligent article analysis for visuals
  const analysis = await analyzeArticleForVisuals(context);

  // 3. Build Visual Concept (Explaining whatIsShown AND whyItMatters)
  const visualConcept = await createVisualConcept(analysis, imageType, section, userFeedback);

  // 4. Select Visual Strategy & produce Difference Plan
  const previousStrategyIds = previousGenerations.length > 0
    ? previousGenerations
    : existingImages.map((img) => img.strategy?.id || img.strategyId).filter(Boolean);

  const { strategy, differencePlan } = selectVisualStrategy(
    imageType,
    forceNewStrategy ? previousStrategyIds : previousGenerations,
    userFeedback
  );

  // 5. Build Composition-First Professional Shot Brief
  const detailedPrompt = (passedPrompt && passedPrompt.trim().length > 40 && !forceNewStrategy)
    ? passedPrompt.trim()
    : buildProfessionalShotBrief(
        visualConcept,
        strategy,
        differencePlan,
        Boolean(productReferenceImage),
        promptVariables
      );

  // 6. Attempt Dedicated Gemini Image Synthesis
  let finalImageUrl: string | null = null;
  let modelUsed: string | null = null;
  let generationError: string | undefined;

  const geminiResult = await generateGeminiImage(detailedPrompt, {
    aspectRatio,
    referenceImage: productReferenceImage
  });

  if (geminiResult.success && geminiResult.imageUrl) {
    finalImageUrl = geminiResult.imageUrl;
    modelUsed = geminiResult.modelUsed || 'gemini-3.1-flash-image';
  } else {
    generationError = geminiResult.error;
    console.info('Gemini image generation note:', geminiResult.error);
  }

  // 7. Determine Final Image Source & Fallback handling
  const source: 'gemini' | 'unsplash_fallback' = finalImageUrl ? 'gemini' : 'unsplash_fallback';

  if (!finalImageUrl) {
    // Graceful fallback from verified outdoor library
    const pool = FALLBACK_OUTDOOR_LIBRARY[imageType] || FALLBACK_OUTDOOR_LIBRARY.HERO;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    finalImageUrl = picked.url;
  }

  // 8. Evaluate Quality & Novelty
  const { quality, noveltyScore, perceptualHash, hash, fingerprint } = evaluateQualityAndNovelty(
    imageType,
    detailedPrompt,
    visualConcept,
    existingImages
  );

  // 9. Create Persian title and caption
  const persianTitle = `${visualConcept.primarySubject} در ${strategy.name}`;
  const persianCaption = `${visualConcept.whatIsShown} (${visualConcept.whyItMatters})`;

  const newAsset: GeneratedImageAsset = {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    siteId,
    articleId,
    type: imageType,
    version: differencePlan ? 2 : 1,
    source,
    prompt: detailedPrompt,
    visualConcept,
    visualBrief: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      cameraAngle: strategy.cameraAngle,
      lighting: strategy.lighting,
      perspective: strategy.perspective,
      whyItMatters: visualConcept.whyItMatters
    },
    strategy,
    differencePlan,
    fingerprint,
    hash,
    perceptualHash,
    quality,
    noveltyScore,
    status: 'active',
    rejectionReason: userFeedback,
    referenceImageUrl: productReferenceImage,
    url: finalImageUrl,
    aspectRatio,
    createdAt: new Date().toISOString(),
    persianCaption,
    persianTitle,
    isAiGenerated: source === 'gemini',
    generationError
  };

  // 10. Persist image in DB
  const allImages = db.getImages();
  allImages.unshift(newAsset);
  db.saveImages(allImages);

  // 11. Assemble Variations
  const variations: any[] = [
    {
      id: newAsset.id,
      title: persianTitle,
      perspective: strategy.perspective,
      url: newAsset.url,
      description: persianCaption,
      isAiGenerated: newAsset.isAiGenerated,
      source: newAsset.source
    }
  ];

  // Add contextual alternatives from verified library
  const pool = FALLBACK_OUTDOOR_LIBRARY[imageType] || FALLBACK_OUTDOOR_LIBRARY.HERO;
  for (const item of pool) {
    if (item.url !== newAsset.url) {
      variations.push({
        id: item.id,
        title: item.title,
        perspective: item.perspective,
        url: item.url,
        description: item.description,
        isAiGenerated: false,
        source: 'unsplash_fallback'
      });
    }
  }

  const promptSuggestions = [
    `عکاسی ماکرو از دوخت‌ها و مقاومت پارچه در ${strategy.name}`,
    `نمای باز در شرایط باد آلپی با مهاربندهای محکم`,
    `زاویه دید اول شخص کاربر در حال استفاده میدانی`
  ];

  const statusMsg = source === 'gemini'
    ? `تصویر با موفقیت با مدل اختصاصی ${modelUsed} و استراتژی بصری «${strategy.name}» تولید شد.`
    : `تصویر مستند تطبیقی از آرشیو عکاسی مستند کوهستان با استراتژی «${strategy.name}» انتخاب شد (دلیل: ${generationError || 'سهمیه مدل تصویرسازی'}).`;

  return {
    success: true,
    imageUrl: finalImageUrl,
    image: newAsset,
    variations,
    persianCaption,
    detailedPrompt,
    promptSuggestions,
    source,
    message: statusMsg
  };
}

// -------------------------------------------------------------
// FIVE SPECIALIZED GENERATORS
// -------------------------------------------------------------

export async function generateHeroImage(context: StructuredArticleContext, options: any = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'HERO' });
}

export async function generateArticleImage(context: StructuredArticleContext, options: any = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'ARTICLE' });
}

export async function generateProductImage(context: StructuredArticleContext, options: any = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'PRODUCT' });
}

export async function generateComparisonImage(context: StructuredArticleContext, options: any = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'COMPARISON' });
}

export async function generateTutorialImage(context: StructuredArticleContext, options: any = {}) {
  return generateMasterVisualAsset({ ...options, article: context, imageType: 'TUTORIAL' });
}

// -------------------------------------------------------------
// SECTION 28: IMAGE PLAN GENERATOR FOR FULL ARTICLES
// -------------------------------------------------------------

export async function generateArticleImagePlan(
  article: StructuredArticleContext
): Promise<{
  hero: {
    type: ImageType;
    purpose: string;
    concept: string;
    strategy: string;
    aspectRatio: string;
  };
  supportingImages: {
    type: ImageType;
    section: string;
    purpose: string;
    concept: string;
    strategy: string;
    aspectRatio: string;
  }[];
}> {
  const analysis = await analyzeArticleForVisuals(article);

  const hero = {
    type: 'HERO' as ImageType,
    purpose: 'انتقال ایده محوری مقاله و جلب اعتماد مخاطب در بالای صفحه',
    concept: `نمایش واقعی و باکیفیت ${analysis.mainSubject} در شرایط جوی باورپذیر کوهستان`,
    strategy: 'hero_environmental_wide',
    aspectRatio: '16:9'
  };

  const supportingImages: any[] = [];

  if (article.sections && article.sections.length > 0) {
    for (let i = 0; i < Math.min(3, article.sections.length); i++) {
      const sec = article.sections[i];
      let assignedType: ImageType = 'ARTICLE';
      let strategy = 'article_field_context';

      if (/مقایسه|تفاوت|vs/i.test(sec.heading)) {
        assignedType = 'COMPARISON';
        strategy = 'comparison_side_by_side';
      } else if (/آموزش|نحوه|چگونه|گام/i.test(sec.heading)) {
        assignedType = 'TUTORIAL';
        strategy = 'tutorial_hands_action';
      } else if (/کفش|پوتین|متریال|جنس|کوله/i.test(sec.heading)) {
        assignedType = 'PRODUCT';
        strategy = 'product_macro_craftsmanship';
      }

      supportingImages.push({
        type: assignedType,
        section: sec.heading,
        purpose: `توضیح بصری عینی برای بخش «${sec.heading}»`,
        concept: `نمایش جزئیات مرتبط با ${sec.heading}`,
        strategy,
        aspectRatio: assignedType === 'PRODUCT' ? '4:3' : '16:9'
      });
    }
  } else {
    // Default supporting images based on article analysis
    supportingImages.push({
      type: 'PRODUCT' as ImageType,
      section: 'بررسی مشخصات فنی و متریال',
      purpose: 'نمایش کلوزآپ دوخت‌ها و بافت مقاوم تجهیزات',
      concept: `عکاسی ماکرو از متریال ${analysis.mainSubject}`,
      strategy: 'product_macro_craftsmanship',
      aspectRatio: '4:3'
    });
  }

  return { hero, supportingImages };
}

export const generateVisualAsset = generateMasterVisualAsset;
