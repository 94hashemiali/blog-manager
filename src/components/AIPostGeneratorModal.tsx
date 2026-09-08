import { useState } from 'react';
import { Sparkles, X, Loader2, BookOpen, Compass, CheckCircle2, Flame, Tent, Shield, ArrowLeft } from 'lucide-react';
import { WPPost } from '../types';

interface AIPostGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostGenerated: (post: Partial<WPPost>) => void;
}

const PRESET_TOPICS = [
  {
    title: 'راهنمای خرید کیسه خواب کوهنوردی برای فصول سرد',
    keywords: ['کیسه خواب', 'دمای کامفورت', 'تجهیزات خواب کمپینگ', 'مدنی کمپ'],
    tone: 'educational' as const,
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

export default function AIPostGeneratorModal({ isOpen, onClose, onPostGenerated }: AIPostGeneratorModalProps) {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<'educational' | 'practical' | 'engaging' | 'gear_review'>('practical');
  const [targetAudience, setTargetAudience] = useState('طبیعت‌گردان، کوهنوردان و دوستداران کمپینگ در ایران');
  const [keywordsInput, setKeywordsInput] = useState('تجهیزات کمپینگ، مدنی کمپ');
  const [includeFaq, setIncludeFaq] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          tone,
          targetAudience,
          keywords,
          includeFaq
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'خطا در تولید مقاله توسط هوش مصنوعی');
      }

      if (data.article) {
        const article = data.article;
        
        // Assemble FAQs into markdown content if provided
        let fullContent = article.content || '';
        if (article.faq && Array.isArray(article.faq) && article.faq.length > 0) {
          fullContent += '\n\n## سوالات متداول درباره این موضوع\n';
          for (const item of article.faq) {
            fullContent += `\n### ${item.question}\n${item.answer}\n`;
          }
        }

        let featuredImageUrl = '';
        try {
          const imgRes = await fetch('/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: article.title || topic,
              content: fullContent.slice(0, 400),
              style: 'realistic',
              aspectRatio: '16:9'
            })
          });
          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.imageUrl) {
              featuredImageUrl = imgData.imageUrl;
            }
          }
        } catch {
          // Graceful fallback if image request encounters network delay
        }

        const newPost: Partial<WPPost> = {
          id: `draft-${Date.now()}`,
          title: { rendered: article.title || topic },
          slug: article.slug || topic.replace(/\s+/g, '-'),
          excerpt: { rendered: article.excerpt || article.metaDescription || '' },
          content: { rendered: fullContent },
          status: 'local_draft',
          date: new Date().toISOString(),
          category_names: ['مقالات'],
          tag_names: article.tags || keywords,
          featured_media_url: featuredImageUrl,
          is_local: true
        };

        onPostGenerated(newPost);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'خطایی رخ داد. لطفاً اتصال اینترنت یا کلید Gemini را بررسی کنید.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div 
        id="ai-generator-modal" 
        className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 max-h-[92vh] overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">تولید محتوای هوشمند بلاگ مدنی کمپ</h3>
              <p className="text-xs text-stone-500">طراحی شده با مدل هوش مصنوعی Gemini 3.8 Flash</p>
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
                <div className="text-[10px] text-stone-400 mt-1 flex items-center gap-2">
                  <span className="bg-stone-200/60 px-1.5 py-0.5 rounded text-stone-600">{preset.category}</span>
                  <span>{preset.keywords.slice(0, 2).join('، ')}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Input Form */}
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-stone-800 mb-1.5">
              موضوع یا ایده مقاله: <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="مثال: راهنمای انتخاب چادر ۲ نفره مناسب برای باد و باران کوهستان"
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-stone-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-stone-700 mb-1.5">لحن مقاله:</label>
              <select
                value={tone}
                onChange={(e: any) => setTone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-700 bg-white"
              >
                <option value="practical">راهنمای کاربردی و تجربی (پیشنهادی)</option>
                <option value="gear_review">نقد و بررسی و مقایسه تجهیزات</option>
                <option value="educational">آموزشی و تخصصی سئو شده</option>
                <option value="engaging">جذاب، داستانی و انگیزشی طبیعت‌گردی</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-stone-700 mb-1.5">کلمات کلیدی سئو (با کاما جدا کنید):</label>
              <input
                type="text"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="تجهیزات کمپ، مدنی کمپ، راهنمای خرید"
                className="w-full px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="includeFaq"
              checked={includeFaq}
              onChange={(e) => setIncludeFaq(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-stone-300"
            />
            <label htmlFor="includeFaq" className="font-medium text-stone-700 cursor-pointer">
              تولید خودکار بخش سوالات متداول (FAQ) انتهای مقاله جهت بهبود رتبه در گوگل
            </label>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-stone-600 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors text-xs font-semibold"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl shadow-md transition-all flex items-center gap-2 text-xs sm:text-sm font-bold disabled:opacity-50 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال نگارش مقاله تخصصی با هوش مصنوعی...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>نگارش و انتقال به پیش‌نویس</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
