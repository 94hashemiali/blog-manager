import { Mountain, Sparkles, RefreshCw, Settings, HelpCircle, ExternalLink, Globe2, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  siteStatus: {
    connected: boolean;
    siteUrl?: string;
    responseTimeMs?: number;
    totalPosts?: number;
    message?: string;
  };
  isLoading: boolean;
  onRefresh: () => void;
  onOpenAIModal: () => void;
  onOpenSettings: () => void;
  onOpenExplanation: () => void;
  onCreateNewPost: () => void;
}

export default function Header({
  siteStatus,
  isLoading,
  onRefresh,
  onOpenAIModal,
  onOpenSettings,
  onOpenExplanation,
  onCreateNewPost
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Site Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center shadow-md shadow-emerald-900/10">
              <Mountain className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-extrabold text-stone-900 tracking-tight">
                  مدنی کمپ
                </h1>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-md">
                  Blog Project
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <a
                  href="https://madanicamp.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-stone-500 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  <span className="font-mono text-[11px]">madanicamp.com</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Center Connection Status Pill */}
          <div className="hidden md:flex items-center gap-2">
            <div 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                siteStatus.connected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {siteStatus.connected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span>دیتابیس آنلاین</span>
                  {siteStatus.totalPosts !== undefined && (
                    <span className="bg-emerald-200/60 text-emerald-900 px-1.5 py-0.2 rounded text-[10px]">
                      {siteStatus.totalPosts} مقاله فعال
                    </span>
                  )}
                  {siteStatus.responseTimeMs && (
                    <span className="text-stone-400 text-[10px]" dir="ltr">
                      {siteStatus.responseTimeMs}ms
                    </span>
                  )}
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                  <span>دیتابیس در حالت کش</span>
                </>
              )}
            </div>

            <button
              onClick={onOpenExplanation}
              className="text-xs text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              title="توضیح درباره خطای ۴۰۴ قبلی"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>چرا پیج قبلی ۴۰۴ شد؟</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-2 sm:px-3 sm:py-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors border border-stone-200 flex items-center gap-1.5 text-xs font-medium"
              title="تازه سازی مقالات از دیتابیس سایت"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden sm:inline">تازه سازی</span>
            </button>

            <button
              onClick={onOpenSettings}
              className="p-2 sm:px-3 sm:py-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors border border-stone-200 flex items-center gap-1.5 text-xs font-medium"
              title="تنظیمات اتصال به وردپرس"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">تنظیمات اتصال</span>
            </button>

            <button
              onClick={onOpenAIModal}
              className="px-3 sm:px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-200" />
              <span>تولید مقاله با هوش مصنوعی</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
