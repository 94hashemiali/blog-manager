import { useState } from 'react';
import { 
  Sparkles, Wand2, Image as ImageIcon, Check, Loader2, 
  RefreshCw, Compass, BookOpen, Layers, CheckCircle2, AlertCircle, Eye
} from 'lucide-react';

interface AIWritingStudioProps {
  title: string;
  content: string;
  featuredImage: string;
  onUpdateContent: (newContent: string) => void;
  onAppendContent: (additionalContent: string) => void;
  onUpdateFeaturedImage: (imageUrl: string) => void;
}

export default function AIWritingStudio({
  title,
  content,
  featuredImage,
  onUpdateContent,
  onAppendContent,
  onUpdateFeaturedImage
}: AIWritingStudioProps) {
  // Text generation states
  const [activeSectionPrompt, setActiveSectionPrompt] = useState('');
  const [isWritingText, setIsWritingText] = useState(false);
  const [textFeedback, setTextFeedback] = useState<string | null>(null);

  // Image generation states
  const [imagePrompt, setImagePrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1'>('16:9');
  const [visualStyle, setVisualStyle] = useState<'realistic' | 'golden_hour' | 'macro' | 'campsite'>('realistic');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageFeedback, setImageFeedback] = useState<string | null>(null);
  const [generatedPreviewUrl, setGeneratedPreviewUrl] = useState<string | null>(null);
  const [imageVariations, setImageVariations] = useState<Array<{
    id: string;
    title: string;
    perspective: string;
    url: string;
    description: string;
    isAiGenerated?: boolean;
  }>>([]);
  const [aiSceneCaption, setAiSceneCaption] = useState<string | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([
    'عکس واقعی از چادر ۴ فصل در طلوع کوهستان با نور طبیعی',
    'چیدمان ارگونومیک تجهیزات داخل کوله پشتی کوهنوردی',
    'کلوزآپ پوتین کوهنوردی با زیره ویبرام روی سنگلاخ'
  ]);

  // AI Text action triggers
  const handleWriteAction = async (action: 'expand_section' | 'generate_intro' | 'generate_conclusion' | 'improve_persian') => {
    setIsWritingText(true);
    setTextFeedback(null);

    try {
      const response = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          title: title || 'مقاله کمپینگ مدنی کمپ',
          content: content || '',
          focusKeyword: activeSectionPrompt.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'خطا در نگارش با هوش مصنوعی');

      if (action === 'generate_intro') {
        const newIntro = data.result + '\n\n';
        onUpdateContent(newIntro + content);
        setTextFeedback('مقدمه جذاب با موفقیت به ابتدای مقاله اضافه شد.');
      } else if (action === 'generate_conclusion') {
        const newConclusion = '\n\n## جمع‌بندی و نتیجه‌گیری\n' + data.result;
        onAppendContent(newConclusion);
        setTextFeedback('بخش جمع‌بندی و کال تو اکشن به انتهای مقاله پیوست شد.');
      } else if (action === 'expand_section') {
        const sectionText = '\n\n## ' + (activeSectionPrompt || 'راهنمای کاربردی') + '\n' + data.result;
        onAppendContent(sectionText);
        setTextFeedback(`بخش «${activeSectionPrompt || 'محتوای جدید'}» با هوش مصنوعی تولید و درج شد.`);
        setActiveSectionPrompt('');
      } else if (action === 'improve_persian') {
        onUpdateContent(data.result);
        setTextFeedback('تمام متن مقاله از نظر ادبیات فارسی، روانی و نیم‌فاصله‌ها بازنویسی و ویرایش شد.');
      }
    } catch (err: any) {
      setTextFeedback(err.message || 'خطا در ارتباط با هوش مصنوعی');
    } finally {
      setIsWritingText(false);
    }
  };

  // AI Image generation trigger
  const handleGenerateImage = async () => {
    setIsGeneratingImage(true);
    setImageFeedback(null);

    const effectivePrompt = imagePrompt.trim();

    try {
      const response = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectivePrompt,
          title: title || 'تجهیزات کمپینگ مدنی کمپ',
          content: content?.slice(0, 600) || '',
          style: visualStyle,
          aspectRatio
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'خطا در تولید تصویر');

      if (data.imageUrl) {
        setGeneratedPreviewUrl(data.imageUrl);
        onUpdateFeaturedImage(data.imageUrl);
        if (Array.isArray(data.variations)) {
          setImageVariations(data.variations);
        }
        if (data.persianCaption) {
          setAiSceneCaption(data.persianCaption);
        }
        if (Array.isArray(data.promptSuggestions) && data.promptSuggestions.length > 0) {
          setPromptSuggestions(data.promptSuggestions);
        }
        setImageFeedback(data.message || 'تصاویر اختصاصی و واقع‌گرایانه با موفقیت آماده شدند.');
      }
    } catch (err: any) {
      setImageFeedback(err.message || 'خطا در ساخت تصویر');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="bg-stone-900 text-stone-100 rounded-2xl p-5 shadow-md border border-stone-800 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-stone-950 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              استودیو نگارش هوشمند (AI Text & Image Studio)
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                متن + تصویر
              </span>
            </h3>
            <p className="text-xs text-stone-400">
              مانور هوش مصنوعی برای تولید بخش‌های مقاله، بازنویسی ویرایشی و خلق تصویر شاخص مرتبط
            </p>
          </div>
        </div>
      </div>

      {/* Grid: Left column for AI Text generation, Right column for AI Image creation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Module 1: AI Content & Text Engine */}
        <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              نگارش و گسترش خودکار متن مقاله
            </span>
            {isWritingText && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />}
          </div>

          {/* Quick preset actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleWriteAction('generate_intro')}
              disabled={isWritingText}
              className="p-2.5 bg-stone-800/80 hover:bg-stone-800 text-stone-200 hover:text-white rounded-xl text-xs font-medium text-right border border-stone-700/60 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <div>
                <span className="block font-bold text-white text-[11px]">نوشتن مقدمه جذاب</span>
                <span className="text-[10px] text-stone-400">ورود به ابتدای مقاله</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleWriteAction('generate_conclusion')}
              disabled={isWritingText}
              className="p-2.5 bg-stone-800/80 hover:bg-stone-800 text-stone-200 hover:text-white rounded-xl text-xs font-medium text-right border border-stone-700/60 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div>
                <span className="block font-bold text-white text-[11px]">نوشتن جمع‌بندی و CTA</span>
                <span className="text-[10px] text-stone-400">جمع‌بندی در انتهای متن</span>
              </div>
            </button>
          </div>

          {/* Section expansion tool */}
          <div className="space-y-2 pt-1 border-t border-stone-800">
            <label className="block text-[11px] font-bold text-stone-300">
              افزودن پاراگراف تخصصی به متن درباره یک مبحث خاص:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={activeSectionPrompt}
                onChange={(e) => setActiveSectionPrompt(e.target.value)}
                placeholder="مثال: نکات شستشو، انتخاب دمای کیسه خواب، معایب چادر فنری..."
                className="flex-1 px-3 py-2 bg-stone-900 rounded-xl border border-stone-700 text-xs text-stone-200 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleWriteAction('expand_section')}
                disabled={isWritingText || !activeSectionPrompt.trim()}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>نگارش و درج</span>
              </button>
            </div>
          </div>

          {/* Polish button */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleWriteAction('improve_persian')}
              disabled={isWritingText || !content.trim()}
              className="w-full py-2 bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-stone-700 transition-colors cursor-pointer disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span>ویرایش لحن ادبی، روانی و اصلاح نیم‌فاصله‌های کل متن</span>
            </button>
          </div>

          {textFeedback && (
            <div className="p-2.5 bg-emerald-950/80 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>{textFeedback}</span>
            </div>
          )}
        </div>

        {/* Module 2: AI Image Engine */}
        <div className="bg-stone-950/60 p-4 rounded-xl border border-stone-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" />
              تولید تصویر هوشمند و واقع‌گرایانه (Smart Outdoor Visuals)
            </span>
            <div className="flex items-center gap-1">
              {(['16:9', '4:3', '1:1'] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                    aspectRatio === ratio
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          {/* Visual Style Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-stone-300">
              سبک و زاویه دید عکاسی:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: 'realistic', label: '📸 عکاسی واقعی', desc: 'National Geographic' },
                { id: 'golden_hour', label: '🌅 نور طلایی', desc: 'غروب/طلوع دراماتیک' },
                { id: 'macro', label: '🔍 کلوزآپ متریال', desc: 'جزئیات دقیق کالا' },
                { id: 'campsite', label: '🏕️ حس کمپینگ', desc: 'زندگی در طبیعت' }
              ].map((styleItem) => (
                <button
                  key={styleItem.id}
                  type="button"
                  onClick={() => setVisualStyle(styleItem.id as any)}
                  className={`p-1.5 rounded-lg border text-right transition-all cursor-pointer ${
                    visualStyle === styleItem.id
                      ? 'bg-teal-950/80 border-teal-500 text-teal-200 ring-1 ring-teal-500/50'
                      : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-850'
                  }`}
                >
                  <div className="text-[11px] font-bold">{styleItem.label}</div>
                  <div className="text-[9px] text-stone-500">{styleItem.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Smart Prompt Suggestions */}
          {promptSuggestions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-teal-400/90 font-medium block">
                ایده‌های هوشمند برای این مقاله (کلیک برای درج خودکار):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {promptSuggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setImagePrompt(sug)}
                    className="px-2 py-1 bg-stone-900 hover:bg-teal-950 hover:border-teal-700 text-stone-300 hover:text-teal-200 border border-stone-800 rounded-lg text-[10px] transition-colors text-right cursor-pointer"
                  >
                    + {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-stone-300">
              توصیف صحنه دلخواه (یا خالی بگذارید تا هوش مصنوعی بر اساس موضوع انتخاب کند):
            </label>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={2}
              placeholder="مثال: عکس واقعی از کیسه خواب پر حرفه‌ای باز شده رو به منظره قله‌های برفی و طلوع آفتاب..."
              className="w-full px-3 py-2 bg-stone-900 rounded-xl border border-stone-700 text-xs text-stone-200 focus:outline-none focus:border-teal-500 placeholder:text-stone-500"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={isGeneratingImage}
              className="w-full py-2.5 bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 hover:from-teal-500 hover:to-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {isGeneratingImage ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>در حال تحلیل موضوع و فراخوانی تصاویر واقع‌گرایانه...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-teal-200" />
                  <span>تولید و دریافت تصاویر هوشمند و متناسب</span>
                </>
              )}
            </button>
          </div>

          {/* AI Scene Caption Note */}
          {aiSceneCaption && (
            <div className="p-2.5 bg-stone-900 border border-stone-800 rounded-xl text-[11px] text-stone-300 flex items-center gap-2">
              <Compass className="w-4 h-4 text-teal-400 shrink-0" />
              <span><strong>تحلیل بصری هوش مصنوعی:</strong> {aiSceneCaption}</span>
            </div>
          )}

          {/* Multi-Variation Gallery */}
          {imageVariations.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-800">
              <label className="block text-[11px] font-bold text-teal-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>گزینه‌های تصویری متنوع متناسب با مقاله (یکی را برای شاخص انتخاب کنید):</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {imageVariations.map((v) => {
                  const isCurrent = (featuredImage === v.url) || (generatedPreviewUrl === v.url);
                  return (
                    <div
                      key={v.id}
                      onClick={() => {
                        setGeneratedPreviewUrl(v.url);
                        onUpdateFeaturedImage(v.url);
                      }}
                      className={`group relative rounded-xl overflow-hidden border p-2 cursor-pointer transition-all flex flex-col justify-between ${
                        isCurrent
                          ? 'bg-teal-950/60 border-teal-400 ring-2 ring-teal-500'
                          : 'bg-stone-900 border-stone-800 hover:border-stone-700 hover:bg-stone-850'
                      }`}
                    >
                      <div className="relative aspect-video rounded-lg overflow-hidden bg-stone-950 mb-1.5">
                        <img
                          src={v.url}
                          alt={v.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute top-1 right-1 bg-stone-900/80 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                          {v.perspective.split('(')[0]}
                        </span>
                        {isCurrent && (
                          <div className="absolute inset-0 bg-teal-900/40 flex items-center justify-center">
                            <span className="bg-teal-500 text-stone-950 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                              <Check className="w-3 h-3" />
                              تصویر شاخص
                            </span>
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-stone-200 line-clamp-1">
                          {v.title}
                        </div>
                        <p className="text-[10px] text-stone-400 line-clamp-2 mt-0.5">
                          {v.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGeneratedPreviewUrl(v.url);
                          onUpdateFeaturedImage(v.url);
                        }}
                        className={`mt-2 w-full py-1 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 transition-colors ${
                          isCurrent
                            ? 'bg-teal-500 text-stone-950'
                            : 'bg-stone-800 hover:bg-teal-700 hover:text-white text-stone-300'
                        }`}
                      >
                        {isCurrent ? 'انتخاب شده ✓' : 'انتخاب به عنوان شاخص'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current Active Image Banner if no variations generated yet */}
          {imageVariations.length === 0 && (generatedPreviewUrl || featuredImage) && (
            <div className="flex items-center gap-3 p-2 bg-stone-900 rounded-xl border border-stone-800">
              <div className="w-20 h-14 rounded-lg overflow-hidden bg-stone-800 shrink-0 border border-stone-700">
                <img
                  src={generatedPreviewUrl || featuredImage}
                  alt="پیش‌نمایش تصویر"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold text-white block truncate">
                  تصویر شاخص فعال مقاله
                </span>
                <span className="text-[10px] text-stone-400 block truncate" dir="ltr">
                  {(generatedPreviewUrl || featuredImage).slice(0, 50)}...
                </span>
              </div>
              <button
                type="button"
                onClick={() => onUpdateFeaturedImage(generatedPreviewUrl || featuredImage)}
                className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>تایید</span>
              </button>
            </div>
          )}

          {imageFeedback && (
            <div className="p-2.5 bg-teal-950/80 border border-teal-800 rounded-xl text-xs text-teal-300 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-teal-400" />
              <span>{imageFeedback}</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
