import { useState, useEffect } from 'react';
import { ImageAsset, ImageType, ManagedSite } from '../types';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Camera,
  Copy,
  Check,
  AlertCircle,
  Upload,
  Link,
  Info,
  ShieldCheck,
  Compass,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface VisualAssetStudioProps {
  activeSite: ManagedSite;
  onApplyImageToPost?: (imageUrl: string) => void;
}

const IMAGE_TYPES: { type: ImageType; label: string; desc: string }[] = [
  { type: 'HERO', label: 'بنر شاخص (Hero)', desc: 'ایده محوری مقاله با کادر باز و ساختار فنی باورپذیر' },
  { type: 'ARTICLE', label: 'تصویر متنی (Article)', desc: 'ثبت مستند میدانی تجهیزات در شرایط واقعی' },
  { type: 'PRODUCT', label: 'محور محصول (Product)', desc: 'کلوزآپ و بافت محصول، زیره، زیپ‌ها، متریال فنی' },
  { type: 'COMPARISON', label: 'مقایسه عینی (Comparison)', desc: 'مقایسه کنار هم دو ابزار یا متریال روی بستر یکسان' },
  { type: 'TUTORIAL', label: 'آموزش گام‌به‌گام (Tutorial)', desc: 'راهنمای تصویری دست‌ها، چیدمان و تنظیم ابزار' }
];

const REJECTION_REASONS = [
  { key: 'too_generic', label: 'خیلی کلیشه‌ای است (Too generic)' },
  { key: 'not_relevant', label: 'مرتبط با موضوع مقاله نیست (Not relevant)' },
  { key: 'wrong_equipment', label: 'تجهیزات و متریال نادرست است (Wrong equipment)' },
  { key: 'wrong_environment', label: 'محیط و لوکیشن اشتباه است (Wrong environment)' },
  { key: 'bad_composition', label: 'ترکیب‌بندی و زاویه دید نامناسب است (Bad composition)' },
  { key: 'too_cinematic', label: 'بیش از حد سینمایی و غروب کلیشه‌ای است (Too cinematic)' },
  { key: 'looks_artificial', label: 'مصنوعی یا رندر شبیه است (Looks artificial)' },
  { key: 'too_similar', label: 'بیش از حد شبیه به تصویر قبلی است (Too similar to previous)' },
  { key: 'product_not_visible', label: 'محصول در کادر به اندازه کافی واضح نیست (Product not visible enough)' },
  { key: 'human_unrealistic', label: 'فیگور یا آناتومی انسان غیرطبیعی است (Human looks unrealistic)' },
  { key: 'technical_wrong', label: 'جزئیات فنی و ایمنی کوهستان رعایت نشده (Technical details are wrong)' },
  { key: 'other', label: 'توضیحات اختصاصی دیگر (Other)' }
];

export default function VisualAssetStudio({
  activeSite,
  onApplyImageToPost
}: VisualAssetStudioProps) {
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedImage, setSelectedImage] = useState<ImageAsset | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [showPromptDetails, setShowPromptDetails] = useState(false);

  // Generation form
  const [selectedType, setSelectedType] = useState<ImageType>('HERO');
  const [promptTopic, setPromptTopic] = useState('');
  const [articleContentSample, setArticleContentSample] = useState('');
  const [userCustomInstructions, setUserCustomInstructions] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '9:16'>('16:9');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);

  // Rejection modal
  const [rejectingImage, setRejectingImage] = useState<ImageAsset | null>(null);
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0].label);
  const [customRejectionText, setCustomRejectionText] = useState('');
  const [isRegeneratingVariation, setIsRegeneratingVariation] = useState(false);

  const fetchImages = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ai/visual-assets?siteId=${activeSite.id}`);
      const data = await res.json();
      if (data.images) {
        setImages(data.images);
        if (!selectedImage && data.images.length > 0) {
          setSelectedImage(data.images[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, [activeSite.id]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setReferenceImagePreview(base64);
        setReferenceImageUrl(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const res = await fetch('/api/ai/visual-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          imageType: selectedType,
          title: promptTopic.trim() || activeSite.profile?.niche || 'تجهیزات کوهنوردی و کمپینگ',
          content: articleContentSample.trim(),
          aspectRatio,
          userInstructions: userCustomInstructions.trim(),
          productReferenceImage: referenceImageUrl.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.image) {
        setImages((prev) => [data.image, ...prev]);
        setSelectedImage(data.image);
        setPromptTopic('');
        setArticleContentSample('');
        setUserCustomInstructions('');
        setReferenceImageUrl('');
        setReferenceImagePreview(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRejectAndRegenerate = async () => {
    if (!rejectingImage) return;
    setIsRegeneratingVariation(true);
    const effectiveTargetId = rejectingImage.id || rejectingImage.imageId;
    const finalReason = customRejectionText.trim()
      ? `${rejectionReason}: ${customRejectionText.trim()}`
      : rejectionReason;

    try {
      const res = await fetch(`/api/ai/visual-assets/${effectiveTargetId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          reason: finalReason,
          userInstructions: customRejectionText.trim()
        })
      });
      const data = await res.json();
      if (data.image) {
        setImages((prev) => [
          data.image,
          ...prev.map((img) => ((img.id || img.imageId) === effectiveTargetId ? { ...img, status: 'rejected' } : img))
        ]);
        setSelectedImage(data.image);
        setRejectingImage(null);
        setCustomRejectionText('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingVariation(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const filteredImages = images.filter((img) => {
    if (selectedTypeFilter === 'all') return true;
    const type = img.type || img.imageType;
    return type === selectedTypeFilter;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Studio Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900 text-base flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600" />
            <span>استودیوی تولید تصاویر هوشمند و ارزیابی تمایز بصری</span>
          </h3>
          <p className="text-xs text-stone-500">
            تولید ۵ سیستم تصویر هدفمند (Hero, Article, Product, Comparison, Tutorial) با تحلیل کانسپت بصری، امتیاز تمایز و جلوگیری از تصاویر کلیشه‌ای
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700"
          >
            <option value="all">همه سیستم‌های تصویر ({images.length})</option>
            {IMAGE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Generation Panel */}
      <form onSubmit={handleGenerate} className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>طراحی و تولید تصویر تخصصی جدید</span>
          </h4>
          <span className="text-[11px] text-stone-400">
            سایت فعال: <strong className="text-stone-700">{activeSite.name}</strong>
          </span>
        </div>

        {/* 5 Image Systems Selector */}
        <div>
          <label className="block text-xs font-bold text-stone-800 mb-2">
            انتخاب سیستم تصویر (Image System):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {IMAGE_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => setSelectedType(t.type)}
                className={`p-2.5 rounded-lg border text-right transition-all cursor-pointer ${
                  selectedType === t.type
                    ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <div className="font-bold text-xs text-stone-900 mb-0.5">{t.label}</div>
                <div className="text-[10px] text-stone-500 leading-tight">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Topic and Context Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1">
              عنوان مقاله یا سوژه اصلی:
            </label>
            <input
              type="text"
              value={promptTopic}
              onChange={(e) => setPromptTopic(e.target.value)}
              placeholder="مثال: راهنمای خرید چادر کوهنوردی ۴ فصل، یا پوتین ترکینگ گورتکس"
              className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-stone-800 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1">
              نسبت تصویر (Aspect Ratio):
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { r: '16:9', l: 'افقی ۱۶:۹ (Hero/Article)' },
                { r: '4:3', l: 'استاندارد ۴:۳ (Product)' },
                { r: '1:1', l: 'مربع ۱:۱ (Catalog)' },
                { r: '9:16', l: 'عمودی ۹:۱۶ (Story)' }
              ].map((item) => (
                <button
                  key={item.r}
                  type="button"
                  onClick={() => setAspectRatio(item.r as any)}
                  className={`py-2 px-1 text-center rounded-lg border text-[11px] font-semibold cursor-pointer ${
                    aspectRatio === item.r
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {item.r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content Context & Reference Image */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1">
              متن بخش مرتبط از مقاله (برای تحلیل دقیق کانسپت بصری):
            </label>
            <textarea
              rows={3}
              value={articleContentSample}
              onChange={(e) => setArticleContentSample(e.target.value)}
              placeholder="پاراگراف یا نکات فنی مقاله را وارد کنید تا هوش مصنوعی تصویر را دقیقاً بر اساس اطلاعات مقاله تولید کند (نه حدس تصادفی)..."
              className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-stone-800 text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center justify-between">
              <span>تصویر مرجع محصول (اختیاری - Product Reference):</span>
              <span className="text-[10px] text-stone-400 font-normal">تضمین حفظ رنگ، لوگو و فرم کالا</span>
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={referenceImageUrl.startsWith('data:') ? 'فایل بارگذاری شده' : referenceImageUrl}
                  onChange={(e) => {
                    setReferenceImageUrl(e.target.value);
                    setReferenceImagePreview(e.target.value);
                  }}
                  placeholder="آدرس اینترنتی تصویر محصول (URL) یا بارگذاری فایل..."
                  className="flex-1 px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-stone-800 text-xs outline-none"
                />
                <label className="px-3 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer text-stone-700">
                  <Upload className="w-3.5 h-3.5" />
                  <span>آپلود</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {referenceImagePreview && (
                <div className="flex items-center gap-2 bg-stone-50 p-1.5 rounded-lg border border-stone-200">
                  <img
                    src={referenceImagePreview}
                    alt="پیش‌نمایش مرجع"
                    referrerPolicy="no-referrer"
                    className="w-8 h-8 rounded object-cover border"
                  />
                  <span className="text-[11px] text-stone-600 truncate flex-1">
                    تصویر مرجع محصول فعال شد (فرم و مشخصات عینی در سنتز حفظ خواهد شد)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceImageUrl('');
                      setReferenceImagePreview(null);
                    }}
                    className="text-stone-400 hover:text-rose-600 text-xs px-1"
                  >
                    حذف
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isGenerating || !promptTopic.trim()}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50 shadow-xs cursor-pointer transition-colors"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>در حال تحلیل کانسپت بصری و سنتز تصویر...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>تولید هوشمند تصویر با استراتژی نوین</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Main Studio Workspace (Split View) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Main Column: Selected Image Inspector */}
        <div className="lg:col-span-2 space-y-4">
          {selectedImage ? (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
              <div className="relative bg-stone-950 flex items-center justify-center min-h-[340px]">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.semanticDescription || selectedImage.prompt}
                  className="max-h-[460px] w-full object-contain"
                  referrerPolicy="no-referrer"
                />

                {/* Badges Overlay */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <span className="bg-stone-900/80 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
                    {selectedImage.type || selectedImage.imageType}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs ${
                      selectedImage.source === 'gemini'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {selectedImage.source === 'gemini' ? 'تولید اختصاصی جمینای (Gemini AI)' : 'آرشیو مستند تطبیقی (Fallback)'}
                  </span>
                </div>

                {selectedImage.status === 'rejected' && (
                  <span className="absolute top-3 left-3 bg-rose-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
                    رد شده (Rejected)
                  </span>
                )}
              </div>

              {/* Inspector Metadata & Metrics */}
              <div className="p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                  <div>
                    <h4 className="font-bold text-stone-900 text-sm">
                      {selectedImage.visualConcept?.primarySubject || selectedImage.semanticDescription || 'تصویر تجهیزات کوهنوردی'}
                    </h4>
                    <span className="text-xs text-stone-500 font-mono">
                      استراتژی: {selectedImage.strategy?.name || selectedImage.perspective || 'ثبت مستند میدانی'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyUrl(selectedImage.url)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 hover:bg-stone-50 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedUrl === selectedImage.url ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>کپی شد!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>کپی لینک</span>
                        </>
                      )}
                    </button>

                    {onApplyImageToPost && (
                      <button
                        onClick={() => onApplyImageToPost(selectedImage.url)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>انتخاب برای مقاله</span>
                      </button>
                    )}

                    <button
                      onClick={() => setRejectingImage(selectedImage)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>رد و تغییر زاویه (Reject & Diff)</span>
                    </button>
                  </div>
                </div>

                {/* Visual Concept: whatIsShown & whyItMatters */}
                {selectedImage.visualConcept && (
                  <div className="bg-stone-50 p-3.5 rounded-xl border border-stone-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                      <Compass className="w-4 h-4 text-emerald-600" />
                      <span>کانسپت بصری تصویر (Visual Concept):</span>
                    </div>
                    <div className="text-xs text-stone-700 leading-relaxed">
                      <strong className="text-stone-900">محتوای کادر: </strong>
                      {selectedImage.visualConcept.whatIsShown}
                    </div>
                    <div className="text-xs text-emerald-800 bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-100 leading-relaxed">
                      <strong>چرا این تصویر برای مقاله مهم است (Why It Matters): </strong>
                      {selectedImage.visualConcept.whyItMatters}
                    </div>
                  </div>
                )}

                {/* Difference Plan (if version > 1) */}
                {selectedImage.differencePlan && (
                  <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                      <Layers className="w-4 h-4 text-amber-700" />
                      <span>برنامه تمایز نسبت به نسخه قبل (Difference Plan):</span>
                    </div>
                    <p className="text-xs text-amber-800">
                      {selectedImage.differencePlan.reason}
                    </p>
                    <ul className="text-[11px] text-amber-800 space-y-1 list-disc list-inside">
                      {selectedImage.differencePlan.changedDimensions.map((dim, idx) => (
                        <li key={idx}>{dim}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Quality & Novelty Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">امتیاز تمایز (Novelty)</span>
                    <strong className="text-emerald-700 font-extrabold text-sm">{selectedImage.noveltyScore}٪</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">شاخص واقع‌گرایی</span>
                    <strong className="text-stone-800 font-bold text-sm">{selectedImage.quality?.realism || 9}/10</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">دقت فنی تجهیزات</span>
                    <strong className="text-stone-800 font-bold text-sm">{selectedImage.quality?.equipmentAccuracy || 9}/10</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">شاخص ارگونومی و ترکیب</span>
                    <strong className="text-stone-800 font-bold text-sm">{selectedImage.quality?.composition || 9}/10</strong>
                  </div>
                </div>

                {/* Collapsible Shot Brief / Prompt */}
                <div className="border border-stone-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowPromptDetails(!showPromptDetails)}
                    className="w-full px-3 py-2 bg-stone-50 hover:bg-stone-100 text-xs font-bold text-stone-700 flex items-center justify-between cursor-pointer"
                  >
                    <span>جزئیات پرامپت مهندسی شده و دستورالعمل‌های فنی عکاسی</span>
                    {showPromptDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showPromptDetails && (
                    <div className="p-3 bg-stone-900 text-stone-200 text-[11px] font-mono leading-relaxed" dir="ltr">
                      {selectedImage.prompt}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-xl border border-stone-200 text-stone-400 text-xs">
              تصویری انتخاب نشده است.
            </div>
          )}
        </div>

        {/* Right Column: Thumbnails Gallery */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-stone-800">
            <span>آرشیو تصاویر تولیدی ({filteredImages.length})</span>
            <button
              onClick={fetchImages}
              disabled={isLoading}
              className="text-stone-400 hover:text-stone-600 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تازه‌سازی</span>
            </button>
          </div>

          <div className="space-y-2 max-h-[750px] overflow-y-auto pr-1">
            {filteredImages.map((img) => {
              const imgId = img.id || img.imageId;
              const isSelected = (selectedImage?.id || selectedImage?.imageId) === imgId;
              return (
                <div
                  key={imgId}
                  onClick={() => setSelectedImage(img)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex gap-3 ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-500'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.semanticDescription || img.prompt}
                    referrerPolicy="no-referrer"
                    className="w-20 h-16 rounded-lg object-cover bg-stone-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-bold bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded">
                        {img.type || img.imageType}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          img.source === 'gemini' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {img.source === 'gemini' ? 'Gemini' : 'Fallback'}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-stone-800 truncate">
                      {img.visualConcept?.primarySubject || img.semanticDescription || 'تصویر کوهنوردی'}
                    </div>
                    <div className="text-[10px] text-stone-400 truncate mt-0.5">
                      امتیاز نوآوری: {img.noveltyScore}٪
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rejection & Difference Plan Modal */}
      {rejectingImage && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-stone-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>رد تصویر و بازتولید با زاویه و استراتژی نوین</span>
              </h4>
              <button
                onClick={() => setRejectingImage(null)}
                className="text-stone-400 hover:text-stone-600 text-xs"
              >
                انصراف
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              با انتخاب علت رد تصویر، موتور بصری به‌طور خودکار استراتژی فعلی را کنار گذاشته و بر اساس بازخورد شما کادربندی، زاویه نور و فوکوس کاملاً متفاوتی خلق خواهد کرد:
            </p>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1.5">
                علت رد این تصویر چیست؟
              </label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-300 text-stone-800 text-xs"
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r.key} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-800 mb-1">
                توضیحات تکمیلی برای اصلاح (اختیاری):
              </label>
              <textarea
                rows={2}
                value={customRejectionText}
                onChange={(e) => setCustomRejectionText(e.target.value)}
                placeholder="مثال: زاویه دوربین را به سطح مماس زمین تغییر بده و روی عاج‌های زیره زوم کن..."
                className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-200 text-stone-800 text-xs outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setRejectingImage(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
              >
                لغو
              </button>
              <button
                type="button"
                onClick={handleRejectAndRegenerate}
                disabled={isRegeneratingVariation}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 shadow-xs"
              >
                {isRegeneratingVariation ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال تدوین Difference Plan و بازتولید...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تولید نسخه متفاوت (Different Strategy)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
