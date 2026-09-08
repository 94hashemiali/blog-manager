import { useState } from 'react';
import { 
  Sparkles, Search, Check, Copy, Wand2, 
  ArrowDownRight, Loader2, Lightbulb, RefreshCw, Layers
} from 'lucide-react';
import { AutoSeoSuggestions } from '../types';

interface AutoSeoAdvisorProps {
  title: string;
  content: string;
  currentExcerpt: string;
  currentSlug: string;
  onApplyTitle: (newTitle: string) => void;
  onApplyMeta: (newMeta: string) => void;
  onApplyKeywords: (keywords: string[]) => void;
  onApplySlug: (newSlug: string) => void;
  onInsertH2Heading: (heading: string) => void;
}

export default function AutoSeoAdvisor({
  title,
  content,
  currentExcerpt,
  currentSlug,
  onApplyTitle,
  onApplyMeta,
  onApplyKeywords,
  onApplySlug,
  onInsertH2Heading
}: AutoSeoAdvisorProps) {
  const [focusKeyword, setFocusKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AutoSeoSuggestions | null>(null);
  const [copiedMeta, setCopiedMeta] = useState(false);
  const [appliedTitles, setAppliedTitles] = useState<Record<number, boolean>>({});

  const handleGenerateSeo = async () => {
    setIsLoading(true);
    setError(null);
    setAppliedTitles({});

    try {
      const response = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_seo_suite',
          title: title || 'مقاله کمپینگ و کوهنوردی',
          content: content || '',
          focusKeyword: focusKeyword.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'خطا در دریافت پیشنهادات هوشمند سئو');
      }

      if (data.result) {
        setSuggestions(data.result);
      }
    } catch (err: any) {
      setError(err.message || 'خطا در ارتباط با هوش مصنوعی');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyAll = () => {
    if (!suggestions) return;
    if (suggestions.titles && suggestions.titles[0]) {
      onApplyTitle(suggestions.titles[0]);
    }
    if (suggestions.metaDescription) {
      onApplyMeta(suggestions.metaDescription);
    }
    const combinedKeywords = [
      ...(suggestions.primaryKeywords || []),
      ...(suggestions.secondaryKeywords || [])
    ];
    if (combinedKeywords.length > 0) {
      onApplyKeywords(combinedKeywords);
    }
    if (suggestions.suggestedSlug) {
      onApplySlug(suggestions.suggestedSlug);
    }
  };

  const copyMetaToClipboard = () => {
    if (!suggestions?.metaDescription) return;
    navigator.clipboard.writeText(suggestions.metaDescription);
    setCopiedMeta(true);
    setTimeout(() => setCopiedMeta(false), 2000);
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50/70 via-white to-stone-50 rounded-2xl border border-emerald-200/80 p-5 shadow-xs transition-all">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-emerald-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-4 h-4 text-emerald-200" />
          </div>
          <div>
            <h4 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
              دستیار هوشمند سئو و رتبه‌بندی محتوا (Auto SEO Advisor)
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                هوش مصنوعی
              </span>
            </h4>
            <p className="text-[11px] text-stone-500">
              پیشنهاد خودکار کلمات کلیدی، عناوین کلیک‌خور و توضیحات متای بهینه برای مدنی کمپ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {suggestions && (
            <button
              type="button"
              onClick={handleApplyAll}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="اعمال همزمان عنوان اول، توضیحات متا و کلمات کلیدی"
            >
              <Check className="w-3.5 h-3.5" />
              <span>اعمال همه‌جانبه سئو</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleGenerateSeo}
            disabled={isLoading}
            className="px-3.5 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                <span>در حال تحلیل سئو با AI...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>{suggestions ? 'تحلیل مجدد سئو' : 'تولید خودکار بسته سئو'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Focus keyword input */}
      <div className="flex flex-wrap items-center gap-2 mb-4 bg-white/80 p-2.5 rounded-xl border border-stone-200/80">
        <span className="text-xs font-bold text-stone-700 flex items-center gap-1">
          <Search className="w-3.5 h-3.5 text-stone-400" />
          کلمه کلیدی هدف یا موضوع کانونی (اختیاری):
        </span>
        <input
          type="text"
          value={focusKeyword}
          onChange={(e) => setFocusKeyword(e.target.value)}
          placeholder="مثال: خرید کیسه خواب، کفش کوهنوردی یا خالی بگذارید تا خودکار تشخیص دهد"
          className="flex-1 min-w-[220px] px-3 py-1.5 bg-stone-50 rounded-lg border border-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="button"
          onClick={handleGenerateSeo}
          disabled={isLoading}
          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
        >
          <Wand2 className="w-3 h-3 text-emerald-600" />
          <span>پیشنهاد هوشمند</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-600 font-bold hover:underline">
            بستن
          </button>
        </div>
      )}

      {/* Loading placeholder */}
      {isLoading && (
        <div className="py-8 text-center space-y-2">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto" />
          <p className="text-xs font-medium text-stone-600">
            هوش مصنوعی در حال بررسی چگالی کلمات، قصد کاربر (Search Intent) و تدوین بسته جامع سئو است...
          </p>
        </div>
      )}

      {/* Suggestion Results */}
      {suggestions && !isLoading && (
        <div className="space-y-4">
          {/* Readability & SEO Feedback Alert */}
          {suggestions.readabilityFeedback && (
            <div className="p-3 bg-emerald-100/60 border border-emerald-300/80 rounded-xl text-xs text-emerald-950 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">توصیه ارتقای رتبه گوگل:</span>
                <span>{suggestions.readabilityFeedback}</span>
              </div>
            </div>
          )}

          {/* 1. Meta Description */}
          <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-stone-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                توضیحات متای پیشنهادی (Meta Description):
                <span className="text-[10px] text-stone-400 font-normal">
                  ({suggestions.metaDescription.length} کاراکتر - ایده‌آل برای گوگل)
                </span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={copyMetaToClipboard}
                  className="px-2 py-1 text-[11px] text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-md flex items-center gap-1 transition-colors"
                >
                  {copiedMeta ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedMeta ? 'کپی شد' : 'کپی'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onApplyMeta(suggestions.metaDescription)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md flex items-center gap-1 transition-colors ${
                    currentExcerpt === suggestions.metaDescription
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {currentExcerpt === suggestions.metaDescription ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>اعمال شده</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="w-3 h-3" />
                      <span>اعمال در توضیحات متای پست</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Google Search Snippet Preview */}
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 font-sans text-right space-y-1">
              <div className="text-[11px] text-stone-500 flex items-center gap-1" dir="ltr">
                <span>https://madanicamp.com › blog › {suggestions.suggestedSlug || 'camping-guide'}</span>
              </div>
              <div className="text-xs font-bold text-blue-800 hover:underline cursor-pointer">
                {title || suggestions.titles[0]} | مدنی کمپ
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                {suggestions.metaDescription}
              </p>
            </div>
          </div>

          {/* 2. Suggested Catchy Titles */}
          <div className="bg-white p-3.5 rounded-xl border border-stone-200 shadow-2xs space-y-2">
            <span className="text-xs font-extrabold text-stone-800 block">
              عناوین پرکلیک و سئو شده برای تیتر مقاله (H1):
            </span>
            <div className="space-y-1.5">
              {suggestions.titles.map((suggestedTitle, index) => {
                const isCurrent = title.trim() === suggestedTitle.trim();
                return (
                  <div
                    key={index}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                      isCurrent
                        ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
                        : 'bg-stone-50/60 hover:bg-stone-100/80 border-stone-200 text-stone-800'
                    }`}
                  >
                    <span className="flex-1 line-clamp-1 ml-2">
                      <span className="text-stone-400 font-mono ml-2">#{index + 1}</span>
                      {suggestedTitle}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyTitle(suggestedTitle);
                        setAppliedTitles((prev) => ({ ...prev, [index]: true }));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors shrink-0 ${
                        isCurrent
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white hover:bg-emerald-50 border border-stone-200 text-stone-700 hover:text-emerald-800'
                      }`}
                    >
                      {isCurrent ? <Check className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isCurrent ? 'عنوان انتخابی' : 'انتخاب عنوان'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Primary & Secondary Keywords */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Primary Keywords */}
            <div className="bg-white p-3 rounded-xl border border-stone-200 space-y-2">
              <span className="text-xs font-extrabold text-stone-800 block">
                کلمات کلیدی اصلی (Primary Keywords):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.primaryKeywords.map((kw, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onApplyKeywords([kw])}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="کلیک برای افزودن به برچسب‌های پست"
                  >
                    <span>+</span>
                    <span>{kw}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Secondary & LSI Keywords */}
            <div className="bg-white p-3 rounded-xl border border-stone-200 space-y-2">
              <span className="text-xs font-extrabold text-stone-800 block">
                کلمات کلیدی مکمل و دم‌دراز (LSI & Long-tail):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.secondaryKeywords.map((kw, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onApplyKeywords([kw])}
                    className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                    title="کلیک برای افزودن به برچسب‌های پست"
                  >
                    <span>+</span>
                    <span>{kw}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4. Suggested H2 headings for content enhancement */}
          {suggestions.h2Headings && suggestions.h2Headings.length > 0 && (
            <div className="bg-white p-3.5 rounded-xl border border-stone-200 space-y-2">
              <span className="text-xs font-extrabold text-stone-800 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                سرتیترهای پیشنهادی H2 برای افزایش جامعیت و سئوی متن:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {suggestions.h2Headings.map((heading, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onInsertH2Heading(heading)}
                    className="p-2 text-right bg-stone-50 hover:bg-emerald-50 border border-stone-200 hover:border-emerald-300 rounded-lg text-xs text-stone-800 transition-colors flex items-center justify-between gap-1 group"
                    title="کلیک برای درج این سرتیتر در متن مقاله"
                  >
                    <span className="font-semibold line-clamp-1">{heading}</span>
                    <span className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 font-bold">
                      + درج
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
