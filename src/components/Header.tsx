import { Mountain, Sparkles, RefreshCw, Settings, HelpCircle, ExternalLink, Globe2, Wifi, WifiOff, Layers, TrendingUp, Calendar, Camera, Plus, ChevronDown, Workflow, Activity, LayoutDashboard } from 'lucide-react';
import { ManagedSite } from '../types';

export type AppView = 'posts' | 'seo' | 'planner' | 'visuals' | 'production' | 'performance' | 'overview';

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
  activeSite?: ManagedSite;
  onOpenSiteSelector?: () => void;
  currentView?: AppView;
  onChangeView?: (view: AppView) => void;
  activeJobCount?: number;
  onOpenJobs?: () => void;
}

export default function Header({
  siteStatus,
  isLoading,
  onRefresh,
  onOpenAIModal,
  onOpenSettings,
  onOpenExplanation,
  onCreateNewPost,
  activeSite,
  onOpenSiteSelector,
  currentView = 'posts',
  onChangeView,
  activeJobCount = 0,
  onOpenJobs
}: HeaderProps) {
  const siteName = activeSite?.name || 'مدنی کمپ';
  const siteUrl = activeSite?.url || 'https://madanicamp.com';
  const primaryColor = activeSite?.brand?.primaryColor || '#059669';

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Site Switcher Dropdown */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenSiteSelector}
              className="flex items-center gap-2.5 p-1.5 -m-1.5 rounded-xl hover:bg-stone-100 transition-colors text-right group"
              title="تغییر یا مدیریت سایت‌ها"
            >
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl text-white flex items-center justify-center shadow-md font-bold text-base transition-transform group-hover:scale-105"
                style={{ backgroundColor: primaryColor }}
              >
                <Mountain className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                    {siteName}
                  </h1>
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-700 transition-colors" />
                </div>
                <div className="flex items-center gap-1 text-[11px] text-stone-500">
                  <Globe2 className="w-3 h-3 text-stone-400" />
                  <span className="font-mono">{siteUrl.replace(/^https?:\/\//, '')}</span>
                </div>
              </div>
            </button>
          </div>

          {/* Center Connection Status Pill */}
          <div className="hidden lg:flex items-center gap-2">
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
            {onOpenJobs && (
              <button
                onClick={onOpenJobs}
                className="hidden sm:flex px-3 py-2 text-stone-700 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors border border-stone-200 items-center gap-1.5 text-xs font-semibold"
                title="مرکز عملیات"
              >
                <Activity className="w-4 h-4 text-sky-600" />
                <span>{activeJobCount > 0 ? `${activeJobCount} عملیات` : 'عملیات'}</span>
              </button>
            )}

            <button
              onClick={onCreateNewPost}
              className="hidden sm:flex px-3 py-2 text-stone-700 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors border border-stone-200 items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>مطلب جدید</span>
            </button>

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

        {/* Navigation Tabs Bar */}
        {onChangeView && (
          <nav className="flex items-center gap-1 overflow-x-auto py-2.5 border-t border-stone-100 text-xs font-bold scrollbar-none">
            <button
              onClick={() => onChangeView('overview')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'overview'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-stone-700" />
              <span>نمای کلی (Overview)</span>
            </button>

            <button
              onClick={() => onChangeView('posts')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'posts'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>مقالات و پست‌ها (Posts)</span>
            </button>

            <button
              onClick={() => onChangeView('production')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'production'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Workflow className="w-4 h-4 text-emerald-600" />
              <span>استودیوی تولید (Production)</span>
            </button>

            <button
              onClick={() => onChangeView('seo')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'seo'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>استراتژی سئو و رقبا (SEO Center)</span>
            </button>

            <button
              onClick={() => onChangeView('planner')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'planner'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>تقویم و چرخه محتوا (Planner)</span>
            </button>

            <button
              onClick={() => onChangeView('visuals')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'visuals'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>استودیوی تصاویر هوشمند (Visuals)</span>
            </button>

            <button
              onClick={() => onChangeView('performance')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                currentView === 'performance'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              <Activity className="w-4 h-4 text-cyan-700" />
              <span>سلامت محتوا (Performance)</span>
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
