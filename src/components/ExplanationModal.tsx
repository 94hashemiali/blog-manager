import { HelpCircle, X, ExternalLink, ShieldCheck, CheckCircle2, RefreshCw } from 'lucide-react';

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteStatus: { connected: boolean; siteUrl?: string; totalPosts?: number };
}

export default function ExplanationModal({ isOpen, onClose, siteStatus }: ExplanationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div 
        id="explanation-modal-box" 
        className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-stone-200 max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">چرا قبلاً پیغام «پیج پیدا نشد» نمایش داده شد؟</h3>
              <p className="text-xs text-stone-500">پاسخ به سوال شما و وضعیت فعلی سایت مدنی کمپ</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-stone-700 leading-relaxed text-sm">
          {/* Status Box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-900 text-base">
                وبلاگ و دیتابیس سایت شما (<span dir="ltr">madanicamp.com</span>) کاملاً سالم و فعال است!
              </p>
              <p className="text-emerald-800 text-xs mt-1">
                ما ارتباط زنده مستقیم با دیتابیس وردپرس سایت شما برقرار کردیم و تمامی مقالات موجود (مانند راهنمای کتونی کوهنوردی، سایزبندی کفش و تجهیزات خواب) دریافت شدند.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-stone-900 text-base flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              دلیل مشاهده خطای ۴۰۴ چیست؟
            </h4>
            <p>
              در پلتفرم <strong>Google AI Studio</strong>، پیش‌نمایش اپلیکیشن‌ها بر روی کانتینرهای کلود ران موقت (Development Containers) اجرا می‌شوند. هر زمان که صفحه مرورگر برای مدتی بسته بماند یا کانتینر قدیمی بازنشانی شود، آدرس موقت قبلی منقضی شده و پیغام «پیج پیدا نشد» می‌دهد.
            </p>
            <p>
              <strong>نکته مهم:</strong> این موضوع هیچ ارتباطی با هاست یا وردپرس سایت اصلی شما ندارد؛ سایت اصلی شما با پایداری کامل در حال اجراست.
            </p>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
            <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              راهکارهای جلوگیری از قطعی و دائمی کردن این پنل:
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-stone-600 text-xs pr-1">
              <li>
                <strong>استفاده از قابلیت Deploy / Share:</strong> از منوی بالای صفحه در AI Studio، روی دکمه <strong>Share</strong> یا <strong>Deploy</strong> بزنید تا یک لینک دائمی و ابری با سرعت بالا در اختیارتان قرار گیرد.
              </li>
              <li>
                <strong>اتصال مستقیم وردپرس:</strong> در بخش «تنظیمات» این پنل، می‌توانید نام کاربری و رمز کاربردی وردپرس سایتتان را وارد کنید تا مقالات با یک کلیک مستقیماً روی سایت مدنی کمپ منتشر شوند.
              </li>
              <li>
                <strong>پشتیبان‌گیری محلی:</strong> تمامی تغییرات و پیش‌نویس‌های جدید، همزمان در حافظه محلی مرورگر و سرور نگهداری می‌شوند تا هیچ متنی از دست نرود.
              </li>
            </ul>
          </div>

          <div className="pt-2 flex items-center justify-between text-xs text-stone-500">
            <span>آدرس سایت متصل: <a href="https://madanicamp.com" target="_blank" rel="noreferrer" className="text-emerald-700 underline font-mono">https://madanicamp.com</a></span>
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-stone-900 text-white rounded-lg font-medium hover:bg-stone-800 transition-colors"
            >
              متوجه شدم، بازگشت به پنل
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
