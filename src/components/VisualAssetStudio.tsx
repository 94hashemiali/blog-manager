import { useState, useEffect } from 'react';
import { ImageAsset, ImageType, ManagedSite } from '../types';
import {
  Image,
  Sparkles,
  RefreshCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Eye,
  Camera,
  Layers,
  Copy,
  Check,
  Compass,
  FileCheck,
  AlertCircle
} from 'lucide-react';

interface VisualAssetStudioProps {
  activeSite: ManagedSite;
  onApplyImageToPost?: (imageUrl: string) => void;
}

const IMAGE_TYPES: { type: ImageType; label: string; desc: string }[] = [
  { type: 'HERO', label: 'بنر سینمایی شاخص (Hero)', desc: 'کادر باز ۱۶:۹ سینمایی برای تصویر اصلی بالای مقاله' },
  { type: 'ARTICLE', label: 'تصویر متنی و زمینه (Article)', desc: 'نمایش تجهیزات در شرایط میدانی و داستان‌سرایی محتوا' },
  { type: 'PRODUCT', label: 'کلوزآپ و بافت محصول (Product)', desc: 'عکاسی ماکرو از دوخت‌ها، زیپ‌ها، زیره ویبرام و متریال ضدآب' },
  { type: 'COMPARISON', label: 'مقایسه تصویری (Comparison)', desc: 'مقایسه کنار هم دو ابزار، سایز یا دو فناوری رقیب' },
  { type: 'TUTORIAL', label: 'آموزش گام‌به‌گام (Tutorial)', desc: 'راهنمای تصویری کاربردی نحوه استفاده و تنظیم استاندارد' }
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

  // Generation form
  const [selectedType, setSelectedType] = useState<ImageType>('HERO');
  const [promptTopic, setPromptTopic] = useState('');
  const [userCustomInstructions, setUserCustomInstructions] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3' | '1:1' | '9:16'>('16:9');

  // Rejection modal
  const [rejectingImage, setRejectingImage] = useState<ImageAsset | null>(null);
  const [rejectionReason, setRejectionReason] = useState('خیلی کلیشه‌ای است (Too generic)');
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
          topic: promptTopic.trim() || activeSite.profile?.niche || 'تجهیزات کوهنوردی و کمپینگ',
          aspectRatio,
          userInstructions: userCustomInstructions.trim()
        })
      });
      const data = await res.json();
      if (data.image) {
        setImages((prev) => [data.image, ...prev]);
        setSelectedImage(data.image);
        setPromptTopic('');
        setUserCustomInstructions('');
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
    try {
      const res = await fetch(`/api/ai/visual-assets/${rejectingImage.imageId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          reason: rejectionReason
        })
      });
      const data = await res.json();
      if (data.image) {
        setImages((prev) => [data.image, ...prev.map((img) => (img.imageId === rejectingImage.imageId ? { ...img, status: 'rejected' } : img))]);
        setSelectedImage(data.image);
        setRejectingImage(null);
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
    return img.imageType === selectedTypeFilter;
  });

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900 text-base flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600" />
            <span>استودیوی تصاویر هوشمند و ارزیابی تمایز بصری (Visual Asset Studio)</span>
          </h3>
          <p className="text-xs text-stone-500">
            تولید ۵ نوع تصویر هدفمند (Hero, Article, Product, Comparison, Tutorial) با امتیاز نوآوری بصری (Novelty Score) و جلوگیری از تکرار
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700"
          >
            <option value="all">همه تایپ‌های تصویر ({images.length})</option>
            {IMAGE_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Generation Form */}
      <form onSubmit={handleGenerate} className="p-5 rounded-xl border border-stone-200 bg-white shadow-xs space-y-4">
        <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span>تولید هوشمند دارایی بصری برای «{activeSite.name}»</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Image Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">نوع تصویر (Image Type) *</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ImageType)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 text-stone-800 focus:outline-hidden focus:border-emerald-600"
            >
              {IMAGE_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-stone-400 mt-1 block">
              {IMAGE_TYPES.find((t) => t.type === selectedType)?.desc}
            </span>
          </div>

          {/* Subject / Equipment */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">موضوع یا تجهیز هدف</label>
            <input
              type="text"
              value={promptTopic}
              onChange={(e) => setPromptTopic(e.target.value)}
              placeholder="مثال: چادر ۴ فصل ژئودزیک در طوفان برف"
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
            />
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">نسبت ابعاد (Aspect Ratio)</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 text-stone-800"
            >
              <option value="16:9">۱۶:۹ افقی عریض (پیش‌فرض بنر و وبلاگ)</option>
              <option value="4:3">۴:۳ استاندارد محتوای متنی</option>
              <option value="1:1">۱:۱ مربع (صفحه محصول یا گالری)</option>
              <option value="9:16">۹:۱۶ عمودی (استوری و بنر موبایل)</option>
            </select>
          </div>

          {/* Instructions */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-stone-700 mb-1">دستورالعمل تکمیلی نورپردازی یا پرسپکتیو (اختیاری)</label>
            <input
              type="text"
              value={userCustomInstructions}
              onChange={(e) => setUserCustomInstructions(e.target.value)}
              placeholder="مثال: نور گرم طلایی زمان غروب (Golden Hour)، فوکوس شارپ روی دوخت‌های ضدآب و زیپ‌های YKK"
              className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isGenerating}
            className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'در حال خلق تصویر با هوش مصنوعی...' : 'تولید تصویر اختصاصی با آزمون تمایز'}</span>
          </button>
        </div>
      </form>

      {/* Main Studio Workspace (Split View: Selected Image & Thumbnails) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left/Main Column: Selected Image Inspector */}
        <div className="lg:col-span-2 space-y-4">
          {selectedImage ? (
            <div className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs">
              <div className="relative bg-stone-950 flex items-center justify-center min-h-[340px]">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.semanticDescription}
                  className="max-h-[460px] w-full object-contain"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute top-3 right-3 bg-stone-900/80 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-md">
                  {selectedImage.imageType}
                </span>
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
                    <h4 className="font-bold text-stone-900 text-sm">{selectedImage.semanticDescription}</h4>
                    <span className="text-xs text-stone-500 font-mono">
                      پرسپکتیو: {selectedImage.perspective || 'زاویه سینمایی میدانی'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyUrl(selectedImage.url)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-stone-200 hover:bg-stone-50 flex items-center gap-1.5 transition-colors"
                    >
                      {copiedUrl === selectedImage.url ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>کپی شد!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>کپی لینک عکس</span>
                        </>
                      )}
                    </button>

                    {onApplyImageToPost && (
                      <button
                        onClick={() => onApplyImageToPost(selectedImage.url)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>انتخاب برای مقاله فعال</span>
                      </button>
                    )}

                    <button
                      onClick={() => setRejectingImage(selectedImage)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 flex items-center gap-1.5 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>رد و بازتولید (Reject & Diff)</span>
                    </button>
                  </div>
                </div>

                {/* Novelty & Hash Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">امتیاز نوآوری (Novelty)</span>
                    <strong className="text-emerald-700 font-extrabold text-sm">{selectedImage.noveltyScore}٪</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">شاخص واقع‌گرایی</span>
                    <strong className="text-stone-800 font-bold text-sm">{selectedImage.quality?.realism || 9}/10</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">دقت تجهیزات و ارگونومی</span>
                    <strong className="text-stone-800 font-bold text-sm">{selectedImage.quality?.equipmentAccuracy || 9}/10</strong>
                  </div>
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                    <span className="text-stone-400 block text-[10px]">هش تمایز (dHash)</span>
                    <code className="text-stone-600 font-mono text-[10px]">{selectedImage.perceptualHash || '7a8f3b2c...'}</code>
                  </div>
                </div>

                {/* Prompt Details */}
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-100 text-xs">
                  <span className="font-bold text-stone-700 block mb-1">پرامپت مهندسی شده عکاسی:</span>
                  <p className="text-stone-600 font-mono text-[11px] leading-relaxed" dir="ltr">
                    {selectedImage.prompt}
                  </p>
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
          <h4 className="font-bold text-stone-800 text-xs flex items-center justify-between">
            <span>آرشیو دارایی‌های بصری ({filteredImages.length})</span>
            <button onClick={fetchImages} className="text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              <span>بروزرسانی</span>
            </button>
          </h4>

          {filteredImages.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-stone-200 text-stone-400 text-xs">
              تصویری یافت نشد. با فرم بالا اولین تصویر را خلق کنید.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredImages.map((img) => {
                const isSelected = selectedImage?.imageId === img.imageId;
                return (
                  <button
                    key={img.imageId}
                    onClick={() => setSelectedImage(img)}
                    className={`relative rounded-xl overflow-hidden border text-right transition-all group aspect-4/3 ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-600/30'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.semanticDescription}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent flex flex-col justify-end p-2">
                      <span className="text-[10px] font-bold text-white line-clamp-1">{img.semanticDescription}</span>
                      <span className="text-[9px] text-emerald-300 font-mono">{img.imageType}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rejection Feedback Modal */}
      {rejectingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-md p-6 space-y-4 text-stone-900 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-base text-stone-900">حلقه بازخورد و اصلاح تصویر (Rejection Loop)</h4>
                <p className="text-xs text-stone-500">دلیل رد تصویر را مشخص کنید تا زاویه و متغیرها تغییر کنند</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-stone-700">دلیل رد تصویر فعلی:</label>
              {[
                'خیلی کلیشه‌ای است (Too generic)',
                'زاویه دوربین و پرسپکتیو مناسب نیست (Wrong camera angle)',
                'واقع‌گرایی کافی ندارد (Not realistic enough)',
                'تجهیزات و دوخت‌ها دقیق نیستند (Inaccurate gear details)',
                'بیش از حد به تصویر قبلی شبیه است (Too similar to existing image)'
              ].map((r, i) => (
                <label key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-stone-200 hover:bg-stone-50 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="rejectionReason"
                    checked={rejectionReason === r}
                    onChange={() => setRejectionReason(r)}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>{r}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setRejectingImage(null)}
                className="px-4 py-2 rounded-lg text-xs text-stone-600 hover:bg-stone-100"
              >
                انصراف
              </button>
              <button
                onClick={handleRejectAndRegenerate}
                disabled={isRegeneratingVariation}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRegeneratingVariation ? 'animate-spin' : ''}`} />
                <span>{isRegeneratingVariation ? 'در حال بازتولید با زاویه نو...' : 'ثبت بازخورد و بازتولید عکس'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
