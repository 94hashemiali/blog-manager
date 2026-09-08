import { useState, useEffect } from 'react';
import { KeywordOpportunity, Competitor, ManagedSite } from '../types';
import { extractString } from '../utils/postUtils';
import {
  TrendingUp,
  Search,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Compass,
  FileText,
  Calendar,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react';

interface SeoIntelligenceCenterProps {
  activeSite: ManagedSite;
  onSelectTopicForGeneration: (topic: string, keyword: string, intent: string) => void;
  onAddTopicToPlanner: (opp: KeywordOpportunity) => void;
}

export default function SeoIntelligenceCenter({
  activeSite,
  onSelectTopicForGeneration,
  onAddTopicToPlanner
}: SeoIntelligenceCenterProps) {
  const [activeTab, setActiveTab] = useState<'keywords' | 'competitors' | 'duplication' | 'clusters'>('keywords');

  // Keyword Opportunities State
  const [opportunities, setOpportunities] = useState<KeywordOpportunity[]>([]);
  const [isLoadingOpps, setIsLoadingOpps] = useState(false);
  const [selectedIntentFilter, setSelectedIntentFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [customSeedTopic, setCustomSeedTopic] = useState('');

  // Competitors State
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoadingComps, setIsLoadingComps] = useState(false);
  const [newCompetitorDomain, setNewCompetitorDomain] = useState('');

  // Duplication Checker State
  const [dupTitleInput, setDupTitleInput] = useState('');
  const [dupKeywordInput, setDupKeywordInput] = useState('');
  const [isCheckingDup, setIsCheckingDup] = useState(false);
  const [dupResult, setDupResult] = useState<any>(null);

  // Fetch opportunities
  const fetchOpportunities = async (seedTopic?: string) => {
    setIsLoadingOpps(true);
    try {
      const url = `/api/seo/opportunities?siteId=${activeSite.id}${seedTopic ? `&seedTopic=${encodeURIComponent(seedTopic)}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.opportunities) {
        setOpportunities(data.opportunities);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingOpps(false);
    }
  };

  // Fetch competitors
  const fetchCompetitors = async () => {
    setIsLoadingComps(true);
    try {
      const res = await fetch(`/api/seo/competitors?siteId=${activeSite.id}`);
      const data = await res.json();
      if (data.competitors) {
        setCompetitors(data.competitors);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingComps(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
    fetchCompetitors();
  }, [activeSite.id]);

  const handleRunDuplicationCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dupTitleInput.trim()) return;
    setIsCheckingDup(true);
    try {
      const res = await fetch('/api/seo/check-duplication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          title: dupTitleInput.trim(),
          keyword: dupKeywordInput.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.result) {
        setDupResult(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCheckingDup(false);
    }
  };

  const handleScanCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompetitorDomain.trim()) return;
    setIsLoadingComps(true);
    try {
      const res = await fetch('/api/seo/analyze-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          customDomain: newCompetitorDomain.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.competitors) {
        setCompetitors(data.competitors);
        setNewCompetitorDomain('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingComps(false);
    }
  };

  // Filter opportunities
  const filteredOpps = opportunities.filter((opp) => {
    const matchesIntent = selectedIntentFilter === 'all' || opp.searchIntent === selectedIntentFilter;
    const matchesSearch =
      !searchTerm ||
      opp.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.keyword.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesIntent && matchesSearch;
  });

  const intentLabels: Record<string, { label: string; bg: string; text: string }> = {
    commercial: { label: 'بررسی و تحقیق تجاری', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
    informational: { label: 'اطلاعاتی و راهنما', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
    transactional: { label: 'قصد خرید مستقیم', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
    navigational: { label: 'ناوبری و برند', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700' }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('keywords')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'keywords'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>فرصت‌های کلیدواژه و سئو ({opportunities.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('competitors')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'competitors'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>تحلیل رقبا و شکاف بازار ({competitors.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('duplication')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'duplication'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>محافظت از همنوع‌خواری محتوا (Cannibalization Guard)</span>
          </button>
          <button
            onClick={() => setActiveTab('clusters')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'clusters'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>خوشه‌های موضوعی (Clusters)</span>
          </button>
        </div>

        {/* Global indicator */}
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>پایش زنده برای: <strong className="text-stone-800">{activeSite.name}</strong></span>
        </div>
      </div>

      {/* TAB 1: KEYWORD OPPORTUNITIES */}
      {activeTab === 'keywords' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder="جستجو در کلیدواژه‌ها یا عناوین پیشنهادی..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs pr-9 pl-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              {/* Intent Filter */}
              <select
                value={selectedIntentFilter}
                onChange={(e) => setSelectedIntentFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700"
              >
                <option value="all">همه نیت‌ها (All Intents)</option>
                <option value="commercial">بررسی تجاری (Commercial)</option>
                <option value="informational">راهنما و آموزش (Informational)</option>
                <option value="transactional">خرید مستقیم (Transactional)</option>
              </select>
            </div>

            {/* Custom Seed Topic */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="محور موضوعی دلخواه (مثلاً: چادر ۴ فصل)"
                value={customSeedTopic}
                onChange={(e) => setCustomSeedTopic(e.target.value)}
                className="text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600 w-48 sm:w-60"
              />
              <button
                onClick={() => fetchOpportunities(customSeedTopic)}
                disabled={isLoadingOpps}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1 shadow-xs whitespace-nowrap"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isLoadingOpps ? 'animate-spin' : ''}`} />
                <span>کشف فرصت‌ها</span>
              </button>
            </div>
          </div>

          {/* Scoring Formula Hint */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-stone-800">فرمول اولویت‌بندی چندبعدی فرصت‌ها: </span>
              امتیاز اولویت (Priority Score) بر اساس ارزش تجاری (×1.5) + پتانسیل ترافیک (×1.2) + نرخ تبدیل (×1.3) + گپ رقبا (×1.5) منهای سطح رقابت و خطر کپی محاسبه شده است.
              تمامی مقادیر علامت‌گذاری شده به عنوان <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-semibold text-[10px]">تخمین هوش مصنوعی (AI Estimate)</span> هستند.
            </div>
          </div>

          {/* Opportunities Cards Grid */}
          {isLoadingOpps ? (
            <div className="text-center py-12 bg-white rounded-xl border border-stone-200">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
              <p className="text-sm font-semibold text-stone-700">در حال جستجوی زمینه‌های پرتقاضای سئو با Gemini...</p>
              <p className="text-xs text-stone-400 mt-1">تحلیل نیازهای مخاطبان و فیلتر کردن عناوین تکراری</p>
            </div>
          ) : filteredOpps.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-stone-200 text-stone-500 text-xs">
              هیچ فرصت متناسبی یافت نشد. می‌توانید با دکمه «کشف فرصت‌ها» زمینه‌های جدید را استخراج کنید.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredOpps.map((opp) => {
                const intentInfo = intentLabels[opp.searchIntent] || intentLabels.commercial;

                return (
                  <div
                    key={opp.id}
                    className="p-5 rounded-xl border border-stone-200 bg-white hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${intentInfo.bg} ${intentInfo.text}`}>
                          {intentInfo.label}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded font-mono">
                            فصل: {opp.seasonality}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                            امتیاز: {opp.priorityScore}/100
                          </span>
                        </div>
                      </div>

                      {/* Main Title / Topic */}
                      <h4 className="font-bold text-stone-900 text-sm leading-snug mb-1">
                        {opp.topic}
                      </h4>

                      {/* Focus Keyword */}
                      <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-3">
                        <span className="font-semibold text-stone-700">کلیدواژه کانونی:</span>
                        <code className="bg-stone-100 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold">
                          {opp.keyword}
                        </code>
                      </div>

                      {/* Multi-Dimensional Metrics Bar */}
                      <div className="grid grid-cols-4 gap-1.5 p-2 bg-stone-50 rounded-lg text-center text-[10px] mb-3">
                        <div className="p-1 rounded bg-white border border-stone-100">
                          <span className="text-stone-400 block">ارزش تجاری</span>
                          <strong className="text-stone-800 font-bold text-xs">{opp.businessValue}/10</strong>
                        </div>
                        <div className="p-1 rounded bg-white border border-stone-100">
                          <span className="text-stone-400 block">پتانسیل ترافیک</span>
                          <strong className="text-stone-800 font-bold text-xs">{opp.trafficPotential}/10</strong>
                        </div>
                        <div className="p-1 rounded bg-white border border-stone-100">
                          <span className="text-stone-400 block">نرخ تبدیل</span>
                          <strong className="text-stone-800 font-bold text-xs">{opp.conversionPotential}/10</strong>
                        </div>
                        <div className="p-1 rounded bg-white border border-stone-100">
                          <span className="text-stone-400 block">شکاف رقبا</span>
                          <strong className="text-stone-800 font-bold text-xs">{opp.contentGap}/10</strong>
                        </div>
                      </div>

                      {/* Reason */}
                      <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
                        {opp.reason}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onAddTopicToPlanner(opp)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5 text-stone-500" />
                        <span>افزودن به تقویم</span>
                      </button>

                      <button
                        onClick={() => onSelectTopicForGeneration(opp.topic, opp.keyword, opp.searchIntent)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>تولید آنی مقاله با استراتژی</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPETITORS INTELLIGENCE */}
      {activeTab === 'competitors' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-stone-900 text-sm">هوش رقابتی و تحلیل مقالات رقبای ارگانیک گوگل</h4>
              <p className="text-xs text-stone-500">یافتن شکاف‌های محتوایی (Content Gaps) که رقبا ضعیف پوشش داده‌اند</p>
            </div>

            <form onSubmit={handleScanCompetitor} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="دامنه رقیب (مثال: competitor.com)"
                value={newCompetitorDomain}
                onChange={(e) => setNewCompetitorDomain(e.target.value)}
                dir="ltr"
                className="text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
              />
              <button
                type="submit"
                disabled={isLoadingComps}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1 shadow-xs whitespace-nowrap"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>اسکن رقیب</span>
              </button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map((comp) => (
              <div key={comp.id} className="p-5 rounded-xl border border-stone-200 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center font-bold text-stone-700">
                      {comp.name.slice(0, 1)}
                    </div>
                    <div>
                      <h5 className="font-bold text-stone-900 text-sm">{comp.name}</h5>
                      <span className="text-xs text-stone-500 font-mono" dir="ltr">{comp.domain}</span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                    رقیب ارگانیک
                  </span>
                </div>

                {/* Covered Categories */}
                <div>
                  <span className="text-[11px] font-semibold text-stone-500 block mb-1">دسته‌های زیر پوشش رقیب:</span>
                  <div className="flex flex-wrap gap-1">
                    {comp.coveredCategories?.map((cat, i) => (
                      <span key={i} className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Strengths */}
                {comp.strengths?.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-stone-500 block mb-1">نقاط قوت محتوایی:</span>
                    <ul className="text-xs text-stone-600 space-y-1 list-disc list-inside">
                      {comp.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Opportunity / Advantage */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-950">
                  <span className="font-bold text-emerald-900 block mb-1">مزیت رقابتی ما برای شکست رقیب:</span>
                  <p className="leading-relaxed">
                    {(comp as any).contentGapAdvantage || 'انتشار مقالات جامع تصویری و راهنماهای گام‌به‌گام با تست محصول.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CANNIBALIZATION & DUPLICATION GUARD */}
      {activeTab === 'duplication' && (
        <div className="space-y-6">
          <div className="p-5 bg-white rounded-xl border border-stone-200 shadow-xs">
            <h4 className="font-bold text-stone-900 text-sm mb-1 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-600" />
              <span>ارزیابی همپوشانی و پیشگیری از هم‌نوع‌خواری سئو (Keyword Cannibalization)</span>
            </h4>
            <p className="text-xs text-stone-500 mb-4">
              قبل از نگارش یا انتشار هر مقاله، عنوان یا کلیدواژه را اینجا تست کنید تا مطمئن شوید با مقالات قبلی وب‌سایت همپوشانی مخرب ندارد.
            </p>

            <form onSubmit={handleRunDuplicationCheck} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">عنوان پیشنهادی مقاله *</label>
                  <input
                    type="text"
                    value={dupTitleInput}
                    onChange={(e) => setDupTitleInput(e.target.value)}
                    placeholder="مثال: راهنمای انتخاب و خرید چادر کوهنوردی"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">کلمه کلیدی کانونی</label>
                  <input
                    type="text"
                    value={dupKeywordInput}
                    onChange={(e) => setDupKeywordInput(e.target.value)}
                    placeholder="مثال: چادر کوهنوردی"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCheckingDup}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{isCheckingDup ? 'در حال بررسی مقالات موجود...' : 'بررسی خطر تکرار و همپوشانی'}</span>
              </button>
            </form>
          </div>

          {/* Results Display */}
          {dupResult && (
            <div
              className={`p-5 rounded-xl border transition-all ${
                dupResult.cannibalizationRisk === 'severe'
                  ? 'bg-rose-50 border-rose-300'
                  : dupResult.cannibalizationRisk === 'moderate'
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-emerald-50 border-emerald-300'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                  {dupResult.cannibalizationRisk === 'severe' ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  ) : dupResult.cannibalizationRisk === 'moderate' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  )}
                  <div>
                    <h5 className="font-bold text-sm text-stone-900">
                      سطح ریسک: {dupResult.cannibalizationRisk === 'severe' ? 'خطر بالا (همپوشانی شدید)' : dupResult.cannibalizationRisk === 'moderate' ? 'خطر متوسط' : 'ایمن و بدون ریسک'}
                    </h5>
                    <span className="text-xs text-stone-600">{dupResult.verdictMessage}</span>
                  </div>
                </div>

                <div className="text-left font-mono">
                  <span className="text-xs text-stone-500 block">درصد شباهت</span>
                  <span className="text-lg font-extrabold text-stone-900">{dupResult.similarityScore}٪</span>
                </div>
              </div>

              {dupResult.matchedArticles?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-200/60 space-y-2">
                  <span className="text-xs font-bold text-stone-800 block">مقالات با شباهت نزدیک در سایت:</span>
                  {dupResult.matchedArticles.map((m: any, i: number) => (
                    <div key={i} className="p-2.5 rounded-lg bg-white/80 border border-stone-200 text-xs flex items-center justify-between">
                      <span className="font-medium text-stone-800">{extractString(m.title)}</span>
                      <span className="text-[11px] text-stone-500">{m.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONTENT CLUSTERS */}
      {activeTab === 'clusters' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <h4 className="font-bold text-stone-900 text-sm">ساختار خوشه‌ای مقالات (Hub and Spoke Content Clusters)</h4>
            <p className="text-xs text-stone-500">
              سازماندهی مقالات ستون و زیرشاخه‌ها برای ایجاد اعتبار موضوعی بالا (Topical Authority) در گوگل
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSite.profile?.contentClusters?.map((cluster) => (
              <div key={cluster.id} className="p-5 rounded-xl border border-stone-200 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-stone-900 text-sm">{cluster.name}</h5>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-md">
                    {cluster.existingArticlesCount} موجود / {cluster.missingArticlesCount} غایب
                  </span>
                </div>

                <div className="p-3 bg-stone-50 rounded-lg border border-stone-100 text-xs">
                  <span className="text-stone-500 block mb-0.5">مقاله ستون اصلی (Pillar Article):</span>
                  <strong className="text-stone-900 font-bold">{cluster.pillarTopic}</strong>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-stone-500 block">مقالات زیرمجموعه (Cluster Spoke):</span>
                  {cluster.topics.map((t, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg border border-stone-100 bg-white text-xs flex items-center justify-between"
                    >
                      <span className="text-stone-800">{t.title}</span>
                      {t.status === 'existing' ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                          منتشر شده
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectTopicForGeneration(t.title, t.keyword, 'informational')}
                          className="text-[10px] bg-amber-50 text-amber-800 hover:bg-amber-100 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>تولید این گپ</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
