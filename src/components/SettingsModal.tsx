import { useState } from 'react';
import { Settings, X, KeyRound, Globe, Check, AlertCircle, RefreshCw, ExternalLink, Download, ShieldCheck } from 'lucide-react';
import { SiteSettings, WPPost } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SiteSettings;
  onSaveSettings: (settings: SiteSettings) => void;
  posts: WPPost[];
}

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  posts
}: SettingsModalProps) {
  const [siteUrl, setSiteUrl] = useState(settings.siteUrl || 'https://madanicamp.com');
  const [username, setUsername] = useState(settings.username || '');
  const [appPassword, setAppPassword] = useState(settings.appPassword || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/wp/status?siteUrl=${encodeURIComponent(siteUrl)}`);
      const data = await res.json();
      if (data.connected) {
        setTestResult({
          success: true,
          message: `اتصال برقرار است! پاسخ در ${data.responseTimeMs} میلی‌ثانیه (${data.totalPosts || posts.length} پست در سایت موجود است)`
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || 'پاسخی از سرور وردپرس دریافت نشد.'
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'خطا در شبکه'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    onSaveSettings({
      siteUrl: siteUrl.trim(),
      username: username.trim(),
      appPassword: appPassword.trim(),
      autoSync: true
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleExportBackup = () => {
    const jsonBlob = new Blob([JSON.stringify(posts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(jsonBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `madanicamp-blog-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div 
        id="settings-modal" 
        className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-stone-200 max-h-[92vh] overflow-y-auto"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">تنظیمات اتصال به وردپرس مدنی کمپ</h3>
              <p className="text-xs text-stone-500">پیکربندی انتشار مستقیم و همگام‌سازی وبلاگ</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Site URL */}
          <div>
            <label className="block font-semibold text-stone-700 mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-stone-500" />
              <span>آدرس اصلی سایت (WordPress URL):</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                dir="ltr"
                className="flex-1 px-3 py-2 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800 font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting}
                className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-medium flex items-center gap-1.5 transition-colors"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>تست اتصال</span>
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* WordPress Auth */}
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
              <KeyRound className="w-4 h-4 text-emerald-600" />
              <span>احراز هویت وردپرس جهت انتشار خودکار مستقیم (اختیاری):</span>
            </div>
            <p className="text-stone-500 text-[11px] leading-relaxed">
              اگر می‌خواهید مقالات مستقیماً با یک کلیک روی سایت <span dir="ltr" className="font-mono">madanicamp.com</span> منتشر یا بروزرسانی شوند، مشخصات زیر را وارد کنید. بدون این اطلاعات، مقالات در پنل پیش‌نویس شده و می‌توانید آن‌ها را کپی یا به صورت فایل دریافت کنید.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-medium text-stone-700 mb-1">نام کاربری وردپرس:</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  dir="ltr"
                  placeholder="admin یا نام کاربری شما"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">رمز کاربردی (Application Password):</label>
                <input
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  dir="ltr"
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800 font-mono"
                />
              </div>
            </div>

            {/* Guide on Application Passwords */}
            <div className="text-[11px] text-stone-600 bg-white p-3 rounded-lg border border-stone-200">
              <span className="font-semibold text-stone-800">نحوه دریافت رمز عبور کاربردی در وردپرس:</span>
              <ol className="list-decimal list-inside space-y-1 mt-1 text-stone-600">
                <li>وارد پیشخوان وردپرس سایت مدنی کمپ شوید.</li>
                <li>از منوی کناری به مسیر <strong>کاربران &larr; شناسنامه شما</strong> بروید.</li>
                <li>صفحه را پایین بکشید تا به بخش <strong>«رمزهای عبور کاربردی»</strong> برسید.</li>
                <li>یک نام دلخواه مانند «Madani Manager» بنویسید و روی دکمه افزودن کلیک کنید.</li>
                <li>رمز ۱۶ حرفی ایجاد شده را در کادر بالا کپی کنید.</li>
              </ol>
            </div>
          </div>

          {/* Backup Section */}
          <div className="flex items-center justify-between p-3.5 bg-stone-50 border border-stone-200 rounded-xl">
            <div>
              <span className="font-semibold text-stone-900 block">پشتیبان‌گیری از کل مقالات:</span>
              <span className="text-[11px] text-stone-500">دانلود فایل JSON شامل تمامی پست‌ها و متون مقالات</span>
            </div>
            <button
              type="button"
              onClick={handleExportBackup}
              className="px-3 py-1.5 bg-white border border-stone-300 hover:border-stone-400 rounded-lg text-stone-700 font-medium flex items-center gap-1.5 hover:bg-stone-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>دانلود نسخه پشتیبان ({posts.length})</span>
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-stone-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-stone-600 hover:text-stone-900 rounded-xl hover:bg-stone-100 transition-colors text-xs font-semibold"
          >
            بستن
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 text-xs font-bold"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>ذخیره شد!</span>
              </>
            ) : (
              <span>ذخیره تنظیمات</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
