import { useState } from 'react';
import { ManagedSite } from '../types';
import {
  Globe2,
  Plus,
  Check,
  ExternalLink,
  Trash2,
  Sparkles,
  Wifi,
  ShieldCheck,
  BarChart3,
  RefreshCw,
  X,
  Layers
} from 'lucide-react';

interface SiteSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: ManagedSite[];
  activeSiteId: string;
  onSelectSite: (siteId: string) => void;
  onSiteAdded: (newSite: ManagedSite) => void;
  onSiteUpdated: (site: ManagedSite) => void;
  onSiteDeleted: (siteId: string) => void;
}

export default function SiteSelectorModal({
  isOpen,
  onClose,
  sites,
  activeSiteId,
  onSelectSite,
  onSiteAdded,
  onSiteUpdated,
  onSiteDeleted
}: SiteSelectorModalProps) {
  const [isAddingSite, setIsAddingSite] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [selectedSiteForProfile, setSelectedSiteForProfile] = useState<ManagedSite | null>(null);

  // New site form state
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newAppPassword, setNewAppPassword] = useState('');
  const [newPrimaryColor, setNewPrimaryColor] = useState('#059669');
  const [newTopics, setNewTopics] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  if (!isOpen) return null;

  const handleTestConnection = async (site: ManagedSite) => {
    setTestingId(site.id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/sites/${site.id}/test-connection`, { method: 'POST' });
      const data = await res.json();
      setTestResult({
        id: site.id,
        success: data.connected,
        message: data.message || (data.connected ? 'اتصال موفق' : 'خطا در برقراری ارتباط')
      });
    } catch (e: any) {
      setTestResult({
        id: site.id,
        success: false,
        message: e.message || 'خطا در شبکه'
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleAnalyzeSite = async (site: ManagedSite) => {
    setAnalyzingId(site.id);
    try {
      const res = await fetch(`/api/sites/${site.id}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.profile) {
        const updated = { ...site, profile: data.profile };
        onSiteUpdated(updated);
        setSelectedSiteForProfile(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) {
      setFormError('نام و آدرس اینترنتی سایت الزامی است.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);

    try {
      const payload = {
        name: newName.trim(),
        url: newUrl.trim(),
        description: newDescription.trim(),
        wordpress: {
          username: newUsername.trim(),
          applicationPassword: newAppPassword.trim()
        },
        brand: {
          name: newName.trim(),
          primaryColor: newPrimaryColor
        },
        content: {
          topics: newTopics.split('،').map((t) => t.trim()).filter(Boolean)
        }
      };

      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.site) {
        onSiteAdded(data.site);
        setIsAddingSite(false);
        // Reset form
        setNewName('');
        setNewUrl('');
        setNewDescription('');
        setNewUsername('');
        setNewAppPassword('');
        setNewTopics('');
      } else {
        setFormError(data.error || 'خطا در ثبت سایت');
      }
    } catch (err: any) {
      setFormError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeSite = sites.find((s) => s.id === activeSiteId) || sites[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-stone-900 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">مدیریت سایت‌های وردپرس (Multi-Site Engine)</h2>
              <p className="text-xs text-stone-500">مدیریت همزمان چندین وب‌سایت، اتصال API و هوش استراتژیک محتوا</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Site Banner */}
          {activeSite && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-xs"
                  style={{ backgroundColor: activeSite.brand.primaryColor || '#059669' }}
                >
                  {activeSite.name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-semibold">سایت فعال فعلی</span>
                    <h3 className="font-bold text-stone-900 text-base">{activeSite.name}</h3>
                  </div>
                  <a
                    href={activeSite.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-800 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <span>{activeSite.url}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedSiteForProfile(activeSite)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>مشاهده پروفایل هوش سئو</span>
                </button>
                <button
                  onClick={() => handleAnalyzeSite(activeSite)}
                  disabled={analyzingId === activeSite.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${analyzingId === activeSite.id ? 'animate-spin' : ''}`} />
                  <span>{analyzingId === activeSite.id ? 'در حال تحلیل...' : 'تحلیل مجدد هوش مصنوعی'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Sites Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-stone-700 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>لیست تمام وب‌سایت‌های متصل ({sites.length})</span>
              </h4>
              {!isAddingSite && (
                <button
                  onClick={() => setIsAddingSite(true)}
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>افزودن وب‌سایت وردپرسی جدید</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sites.map((site) => {
                const isActive = site.id === activeSiteId;
                const isTesting = testingId === site.id;
                const siteTest = testResult?.id === site.id ? testResult : null;

                return (
                  <div
                    key={site.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isActive
                        ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-500/20'
                        : 'border-stone-200 bg-stone-50/50 hover:bg-white hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shadow-xs"
                          style={{ backgroundColor: site.brand.primaryColor || '#059669' }}
                        >
                          {site.name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-stone-900">{site.name}</h5>
                            {site.wordpress?.hasPassword && (
                              <span title="دارای رمز عبور برنامه وردپرس" className="text-emerald-600">
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-stone-500 font-mono">{site.url.replace(/^https?:\/\//, '')}</span>
                        </div>
                      </div>

                      {isActive ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                          <Check className="w-3 h-3" />
                          <span>فعال</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            onSelectSite(site.id);
                            onClose();
                          }}
                          className="text-xs text-stone-600 hover:text-emerald-700 hover:bg-emerald-50 px-2.5 py-1 rounded-md border border-stone-200 transition-colors"
                        >
                          انتخاب و سوئیچ
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-stone-600 mt-2 line-clamp-2 leading-relaxed">
                      {site.description || site.profile?.niche || 'سایت متصل به پلتفرم استراتژی محتوا'}
                    </p>

                    {/* Test result alert */}
                    {siteTest && (
                      <div
                        className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 ${
                          siteTest.success ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <Wifi className="w-3.5 h-3.5" />
                        <span>{siteTest.message}</span>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestConnection(site)}
                          disabled={isTesting}
                          className="text-stone-500 hover:text-stone-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-stone-100 transition-colors"
                        >
                          <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                          <span>{isTesting ? 'در حال تست...' : 'تست اتصال'}</span>
                        </button>
                        <button
                          onClick={() => setSelectedSiteForProfile(site)}
                          className="text-stone-500 hover:text-emerald-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-stone-100 transition-colors"
                        >
                          <BarChart3 className="w-3 h-3" />
                          <span>پروفایل هوش</span>
                        </button>
                      </div>

                      {site.id !== 'site-madanicamp' && (
                        <button
                          onClick={() => onSiteDeleted(site.id)}
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1 rounded transition-colors"
                          title="حذف سایت"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Site Form Drawer */}
          {isAddingSite && (
            <form onSubmit={handleCreateSite} className="p-5 rounded-xl border border-stone-300 bg-stone-50 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-stone-900 text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>مشخصات وب‌سایت وردپرسی جدید</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddingSite(false)}
                  className="text-xs text-stone-500 hover:text-stone-800"
                >
                  انصراف
                </button>
              </div>

              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs">{formError}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">نام سایت یا برند *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="مثال: فروشگاه کوهستان البرز"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:border-emerald-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">آدرس اینترنتی (URL) *</label>
                  <input
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com"
                    dir="ltr"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:border-emerald-600"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-stone-700 mb-1">توضیح زمینه تخصصی و نیچ</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="مثال: مقالات و فروشگاه تخصصی صخره‌نوردی، هیمالیانوردی و غارنوردی"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">نام کاربری وردپرس (اختیاری برای انتشار)</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="admin"
                    dir="ltr"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">رمز عبور برنامه (Application Password)</label>
                  <input
                    type="password"
                    value={newAppPassword}
                    onChange={(e) => setNewAppPassword(e.target.value)}
                    placeholder="xxxx xxxx xxxx xxxx"
                    dir="ltr"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-stone-700 mb-1">موضوعات کلیدی (با کاما فارسی «،» جدا کنید)</label>
                  <input
                    type="text"
                    value={newTopics}
                    onChange={(e) => setNewTopics(e.target.value)}
                    placeholder="کوله پشتی، طناب صعود، کارابین، هارنس، چکش سنگ‌نوردی"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingSite(false)}
                  className="px-4 py-2 rounded-lg text-xs text-stone-600 hover:bg-stone-200 transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSubmitting ? 'در حال ثبت...' : 'ثبت و تحلیل هوشمند سایت'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Site Intelligence Profile Viewer Modal Section */}
          {selectedSiteForProfile && (
            <div className="p-5 rounded-xl border border-stone-300 bg-white space-y-4 shadow-sm animate-in fade-in">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  <h4 className="font-bold text-stone-900 text-sm">
                    شناسنامه هوش سئو و خوشه محتوایی «{selectedSiteForProfile.name}»
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedSiteForProfile(null)}
                  className="text-xs text-stone-400 hover:text-stone-700"
                >
                  بستن
                </button>
              </div>

              {selectedSiteForProfile.profile ? (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="font-semibold text-stone-700 block mb-1">نیچ و تخصص اصلی:</span>
                      <p className="text-stone-800 font-medium">{selectedSiteForProfile.profile.niche}</p>
                    </div>
                    <div className="p-3 bg-stone-50 rounded-lg">
                      <span className="font-semibold text-stone-700 block mb-1">لحن و صدای برند:</span>
                      <p className="text-stone-800 font-medium">{selectedSiteForProfile.profile.brandVoice}</p>
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-stone-700 block mb-1.5">مخاطبان و پرسونای هدف:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSiteForProfile.profile.audience.map((a, i) => (
                        <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-md font-medium">
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>

                  {selectedSiteForProfile.profile.contentClusters?.length > 0 && (
                    <div>
                      <span className="font-semibold text-stone-700 block mb-1.5">خوشه‌های محتوایی (Content Clusters):</span>
                      <div className="space-y-2">
                        {selectedSiteForProfile.profile.contentClusters.map((cluster) => (
                          <div key={cluster.id} className="p-2.5 rounded-lg border border-stone-200 bg-stone-50/50">
                            <div className="flex items-center justify-between font-bold text-stone-800">
                              <span>{cluster.name}</span>
                              <span className="text-[11px] text-emerald-700 font-normal">
                                {cluster.existingArticlesCount} مقاله موجود / {cluster.missingArticlesCount} موضوع غایب
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 mt-0.5">مقاله ستون: {cluster.pillarTopic}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-stone-500 text-xs">
                  پروفایل هوش برای این سایت هنوز ایجاد نشده است.
                  <button
                    onClick={() => handleAnalyzeSite(selectedSiteForProfile)}
                    className="block mx-auto mt-2 text-emerald-700 font-semibold hover:underline"
                  >
                    اجرای تحلیل اولیه با Gemini
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
