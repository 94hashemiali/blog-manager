import { useState, useEffect } from 'react';
import { Sparkles, X, Loader2, BookOpen, Compass, CheckCircle2, Flame, Tent, Shield, ArrowLeft, ShieldAlert, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { WPPost, ManagedSite, ImageType } from '../types';
import { extractString } from '../utils/postUtils';

interface AIPostGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostGenerated: (post: Partial<WPPost>) => void;
  activeSite?: ManagedSite;
  initialTopic?: string;
  initialKeyword?: string;
  initialIntent?: string;
  oppId?: string;
  previousVersion?: {
    title: string;
    content: string;
    versionNumber: number;
  };
}

const PRESET_TOPICS = [
  {
    title: 'راهنمای خرید کیسه خواب کوهنوردی برای فصول سرد',
    keywords: ['کیسه خواب', 'دمای کامفورت', 'تجهیزات خواب کمپینگ', 'مدنی کمپ'],
    tone: 'gear_review' as const,
    category: 'تجهیزات خواب کمپ'
  },
  {
    title: 'نحوه صحیح چیدمان کوله پشتی کوهنوردی و توزیع وزن',
    keywords: ['کوله پشتی کوهنوردی', 'ارگونومی', 'لوازم کمپینگ', 'کوهنوردی'],
    tone: 'practical' as const,
    category: 'مقالات'
  },
  {
    title: 'تفاوت چادر اتوماتیک با چادر عصایی: کدام برای کمپینگ مناسب‌تر است؟',
    keywords: ['چادر کمپینگ', 'چادر ضد آب', 'چادر تیرک‌دار', 'طبیعت گردی'],
    tone: 'gear_review' as const,
    category: 'تجهیزات کمپینگ'
  },
  {
    title: 'راهنمای ضدآب کردن و نگهداری کفش و پوتین کوهنوردی',
    keywords: ['کفش کوهنوردی', 'اسپری گورتکس', 'نگهداری پوتین', 'سایز کفش'],
    tone: 'practical' as const,
    category: 'کوهنوردی و کفش'
  },
  {
    title: '۱۰ قلم وسیله حیاتی در کیت بقا و جعبه کمک‌های اولیه طبیعت‌گردی',
    keywords: ['کیت بقا در طبیعت', 'جعبه کمک های اولیه', 'کمپینگ ایمن', 'مدنی کمپ'],
    tone: 'educational' as const,
    category: 'مقالات'
  }
];

export default function AIPostGeneratorModal({
  isOpen,
  onClose,
  onPostGenerated,
  activeSite,
  initialTopic,
  initialKeyword,
  initialIntent,
  oppId,
  previousVersion
}: AIPostGeneratorModalProps) {
  const [topic, setTopic] = useState(initialTopic || '');
  const [tone, setTone] = useState<'educational' | 'practical' | 'engaging' | 'gear_review'>('practical');
  const [targetAudience, setTargetAudience] = useState(
    activeSite?.profile?.audience?.[0] || 'طبیعت‌گردان، کوهنوردان و دوستداران کمپینگ در ایران'
  );
  const [keywordsInput, setKeywordsInput] = useState(
    initialKeyword || 'تجهیزات کمپینگ، مدنی کمپ'
  );
  const [searchIntent, setSearchIntent] = useState<'commercial' | 'informational' | 'transactional'>(
    (initialIntent as any) || 'commercial'
  );
  const [includeFaq, setIncludeFaq] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Duplication guard state
  const [dupCheckResult, setDupCheckResult] = useState<any>(null);
  const [isCheckingDup, setIsCheckingDup] = useState(false);

  // Image Type state for hero
  const [heroImageType, setHeroImageType] = useState<ImageType>('HERO');

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
    if (initialKeyword) setKeywordsInput(initialKeyword);
    if (initialIntent) setSearchIntent(initialIntent as any);
  }, [initialTopic, initialKeyword, initialIntent]);

  // Live duplication check debounce
  useEffect(() => {
    if (!topic || topic.length < 5) {
      setDupCheckResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingDup(true);
      try {
        const res = await fetch('/api/seo/check-duplication', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            siteId: activeSite?.id || 'site-madanicamp',
            title: topic.trim(),
            keyword: keywordsInput.split(/[,،]+/)[0]?.trim() || ''
          })
        });
        const data = await res.json();
        if (data.success && data.result) {
          setDupCheckResult(data.result);
        }
      } catch {
        // quiet ignore
      } finally {
        setIsCheckingDup(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [topic, activeSite?.id]);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: typeof PRESET_TOPICS[0]) => {
    setTopic(preset.title);
    setKeywordsInput(preset.keywords.join('، '));
    setTone(preset.tone);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('لطفاً عنوان یا ایده مقاله را وارد کنید.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    const keywords = keywordsInput
      .split(/[,،]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    try {
      // 1. Generate Article using the high-performance Article Engine
      const response = await fetch('/api/ai/generate-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite?.id || 'site-madanicamp',
          topic: topic.trim(),
          primaryKeyword: keywords[0] || topic.trim(),
          searchIntent,
          tone,
          targetAudience,
          previousVersion: previousVersion || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'خطا در تولید مقاله توسط هوش مصنوعی');
      }

      if (data.article) {
        const article = data.article;

        // Assemble full content
        const rawContent = extractString(article.content, '');
        let fullContent = rawContent;
        if (article.faq && Array.isArray(article.faq) && article.faq.length > 0) {
          fullContent += '\n\n## سوالات متداول درباره این موضوع\n';
          for (const item of article.faq) {
            fullContent += `\n### ${item.question}\n${item.answer}\n`;
          }
        }

        const cleanTitle = extractString(article.title, topic);
        const cleanExcerpt = extractString(article.excerpt, '') || extractString(article.metaDescription, '');

        // 2. Generate Smart Hero Image with Visual Engine & Perceptual Novelty
        let featuredImageUrl = '';
        try {
          const imgRes = await fetch('/api/ai/visual-assets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteId: activeSite?.id || 'site-madanicamp',
              imageType: heroImageType,
              topic: cleanTitle,
              aspectRatio: '16:9'
            })
          });
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.image && imgData.image.url) {
              featuredImageUrl = imgData.image.url;
            }
          }
        } catch {
          // Graceful fallback
        }

        const newPost: Partial<WPPost> = {
          id: `draft-${Date.now()}`,
          title: { rendered: cleanTitle },
          slug: article.slug || cleanTitle.replace(/\s+/g, '-'),
          excerpt: { rendered: cleanExcerpt },
          content: { rendered: fullContent },
          status: 'local_draft',
          date: new Date().toISOString(),
          category_names: ['مقالات'],
          tag_names: article.tags || keywords,
          featured_media_url: featuredImageUrl,
          is_local: true,
          versions: article.versions || [
            {
              versionNumber: 1,
              title: cleanTitle,
              content: fullContent,
              createdAt: new Date().toISOString()
            }
          ]
        };

        onPostGenerated(newPost);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'خطایی رخ داد. لطفاً اتصال اینترنت یا سرور را بررسی کنید.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs">
      <div 
        id="ai-generator-modal" 
        className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 max-h-[92vh] overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">
                موتور تولید استراتژیک محتوا {activeSite ? `برای «${activeSite.name}»` : ''}
              </h3>
              <p className="text-xs text-stone-500">طراحی شده با مدل هوش مصنوعی Gemini 3.8 Flash و آزمون تمایز بصری</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        {/* Presets */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-stone-700 mb-2 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-emerald-600" />
            <span>ایده‌های آماده و پرجستجوی مدنی کمپ (کلیک کنید):</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_TOPICS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-2.5 rounded-xl border text-right transition-all text-xs font-medium cursor-pointer ${
                  topic === preset.title
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 ring-1 ring-emerald-400'
                    : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-700'
                }`}
              >
                <div className="line-clamp-1">{preset.title}</div>
                <div className="text-[10px] text-stone-400 mt-1 flex items-center gap-1">
                  <span>{preset.category}</span>
                  <span>•</span>
                  <span>{preset.keywords.slice(0, 2).join('، ')}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main form */}
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              عنوان یا ایده مقاله (Focus Topic) *
            </label>
            <input 
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="مثال: مقایسه کیسه خواب پر با الیاف در کمپ زمستانه"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 text-stone-800"
            />

            {/* Cannibalization Warning Indicator */}
            {dupCheckResult && (
              <div
                className={`mt-2 p-2.5 rounded-lg border flex items-center justify-between text-[11px] ${
                  dupCheckResult.cannibalizationRisk === 'severe'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : dupCheckResult.cannibalizationRisk === 'moderate'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {dupCheckResult.cannibalizationRisk === 'severe' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  ) : dupCheckResult.cannibalizationRisk === 'moderate' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <span>{dupCheckResult.verdictMessage}</span>
                </div>
                <span className="font-bold font-mono text-[10px]">
                  شباهت: {dupCheckResult.similarityScore}٪
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-stone-700 mb-1">
                کلمات کلیدی کانونی (با کاما فارسی یا انگلیسی جدا کنید)
              </label>
              <input 
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="کیسه خواب، کمپینگ، مدنی کمپ"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-stone-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-stone-700 mb-1">
                نیت کاربر از جستجو (Search Intent)
              </label>
              <select 
                value={searchIntent}
                onChange={(e) => setSearchIntent(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-stone-800 bg-white"
              >
                <option value="commercial">بررسی و مقایسه تجاری (Commercial)</option>
                <option value="informational">راهنمای آموزشی و فنی (Informational)</option>
                <option value="transactional">خرید مستقیم و ترغیب به خرید (Transactional)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-stone-700 mb-1">
                لحن نگارش (Tone of Voice)
              </label>
              <select 
                value={tone}
                onChange={(e) => setTone(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-stone-800 bg-white"
              >
                <option value="practical">کاربردی و تجربی (همراه با نکات میدانی)</option>
                <option value="gear_review">بررسی تخصصی تجهیزات (Review)</option>
                <option value="educational">آموزشی و راهنمای جامع (Guide)</option>
                <option value="engaging">روایی، انگیزشی و الهام‌بخش</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-stone-700 mb-1">
                سبک تصویر شاخص مقاله
              </label>
              <select 
                value={heroImageType}
                onChange={(e) => setHeroImageType(e.target.value as any)}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-stone-800 bg-white"
              >
                <option value="HERO">بنر سینمایی شاخص ۱۶:۹ (Hero)</option>
                <option value="PRODUCT">کلوزآپ ماکرو و بافت تجهیزات (Product)</option>
                <option value="COMPARISON">مقایسه دو ابزار در کنار هم (Comparison)</option>
                <option value="ARTICLE">میدانی در دل طبیعت (Article)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-stone-700 mb-1">
              پرسونای مخاطب هدف
            </label>
            <input 
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-stone-800"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input 
              type="checkbox"
              id="includeFaq"
              checked={includeFaq}
              onChange={(e) => setIncludeFaq(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-stone-300 focus:ring-emerald-500"
            />
            <label htmlFor="includeFaq" className="text-stone-700 cursor-pointer select-none">
              افزودن خودکار بخش پرسش‌های متداول (FAQ Schema) به انتهای مقاله
            </label>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-stone-600 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-all flex items-center gap-2 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال نگارش مقاله و خلق تصویر هوشمند...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>تولید کامل مقاله و تصویر شاخص</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
