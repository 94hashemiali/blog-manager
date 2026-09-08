import { useState, useEffect } from 'react';
import { TopicOpportunity, TopicLifecycleStatus, ManagedSite } from '../types';
import {
  Calendar,
  Plus,
  ArrowRight,
  CheckCircle,
  FileText,
  Trash2,
  Filter,
  Sparkles,
  Clock,
  Layers,
  Search,
  Check
} from 'lucide-react';

interface ContentPlannerCalendarProps {
  activeSite: ManagedSite;
  onSelectTopicForGeneration: (topic: string, keyword: string, intent: string, oppId?: string) => void;
}

const LIFECYCLE_STEPS: { key: TopicLifecycleStatus; label: string; color: string }[] = [
  { key: 'IDEA', label: 'ایده اولیه (Idea)', color: 'bg-stone-100 text-stone-700 border-stone-200' },
  { key: 'RESEARCHED', label: 'تحقیق شده (Researched)', color: 'bg-blue-50 text-blue-800 border-blue-200' },
  { key: 'APPROVED', label: 'تأیید برای تولید (Approved)', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { key: 'GENERATING', label: 'در حال نگارش (Generating)', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  { key: 'REVIEW', label: 'بازبینی ویراستار (Review)', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { key: 'APPROVED_FOR_PUBLISH', label: 'آماده انتشار (Ready)', color: 'bg-teal-50 text-teal-800 border-teal-200' },
  { key: 'PUBLISHED', label: 'منتشر شده در وردپرس', color: 'bg-emerald-600 text-white border-emerald-600' }
];

export default function ContentPlannerCalendar({
  activeSite,
  onSelectTopicForGeneration
}: ContentPlannerCalendarProps) {
  const [topics, setTopics] = useState<TopicOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [isAddingTopic, setIsAddingTopic] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newSearchIntent, setNewSearchIntent] = useState<'commercial' | 'informational' | 'transactional'>('commercial');
  const [newReason, setNewReason] = useState('');

  const fetchTopics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/planner/topics?siteId=${activeSite.id}`);
      const data = await res.json();
      if (data.topics) {
        setTopics(data.topics);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTopics();
  }, [activeSite.id]);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch('/api/planner/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          title: newTitle.trim(),
          primaryKeyword: newKeyword.trim() || newTitle.trim(),
          searchIntent: newSearchIntent,
          reason: newReason.trim()
        })
      });
      const data = await res.json();
      if (data.success && data.topic) {
        setTopics((prev) => [data.topic, ...prev]);
        setIsAddingTopic(false);
        setNewTitle('');
        setNewKeyword('');
        setNewReason('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (topicId: string, nextStatus: TopicLifecycleStatus) => {
    try {
      const res = await fetch(`/api/planner/topics/${topicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle: nextStatus })
      });
      const data = await res.json();
      if (data.success && data.topic) {
        setTopics((prev) => prev.map((t) => (t.id === topicId ? data.topic : t)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    try {
      await fetch(`/api/planner/topics/${topicId}`, { method: 'DELETE' });
      setTopics((prev) => prev.filter((t) => t.id !== topicId));
    } catch (e) {
      console.error(e);
    }
  };

  const filteredTopics = topics.filter((t) => {
    if (selectedStatusFilter === 'all') return true;
    return t.lifecycle === selectedStatusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900 text-base flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <span>تقویم و چرخه حیات محتوا (Topic Lifecycle Pipeline)</span>
          </h3>
          <p className="text-xs text-stone-500">
            مدیریت گام‌به‌گام از ایده تا نگارش، بازبینی و انتشار نهایی در سایت {activeSite.name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-stone-700"
          >
            <option value="all">تمام مراحل ({topics.length})</option>
            {LIFECYCLE_STEPS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsAddingTopic(true)}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>ثبت موضوع جدید</span>
          </button>
        </div>
      </div>

      {/* Add Topic Drawer */}
      {isAddingTopic && (
        <form onSubmit={handleCreateTopic} className="p-5 rounded-xl border border-stone-300 bg-white shadow-md space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="font-bold text-stone-900 text-sm">افزودن ایده یا موضوع جدید به تقویم</h4>
            <button
              type="button"
              onClick={() => setIsAddingTopic(false)}
              className="text-xs text-stone-400 hover:text-stone-700"
            >
              انصراف
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1">عنوان مقاله *</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثال: مقایسه ۵ سرشعله کوهنوردی پرفروش بازار"
                className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">کلیدواژه اصلی</label>
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="سرشعله کوهنوردی"
                className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">نیت سرچ (Search Intent)</label>
              <select
                value={newSearchIntent}
                onChange={(e) => setNewSearchIntent(e.target.value as any)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 text-stone-700"
              >
                <option value="commercial">بررسی و تحقیق تجاری (Commercial)</option>
                <option value="informational">آموزشی و راهنما (Informational)</option>
                <option value="transactional">خرید مستقیم (Transactional)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1">دلیل اولویت و هدف تجاری</label>
              <input
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="کلمه با جستجوی بالا در فصل بهار و دارای موجودی بالا در انبار"
                className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white focus:outline-hidden focus:border-emerald-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingTopic(false)}
              className="px-4 py-2 rounded-lg text-xs text-stone-600 hover:bg-stone-100"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
            >
              ثبت در تقویم محتوا
            </button>
          </div>
        </form>
      )}

      {/* Topics List / Kanban Pipeline */}
      {filteredTopics.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-stone-200 text-stone-500 text-xs">
          هنوز موضوعی در این مرحله ثبت نشده است. از دکمه «ثبت موضوع جدید» یا از بخش «استراتژی سئو و رقبا» ایده‌ها را به تقویم اضافه کنید.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTopics.map((topic) => {
            const currentStep = LIFECYCLE_STEPS.find((s) => s.key === topic.lifecycle) || LIFECYCLE_STEPS[0];
            const currentIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === topic.lifecycle);
            const nextStep = currentIndex < LIFECYCLE_STEPS.length - 1 ? LIFECYCLE_STEPS[currentIndex + 1] : null;

            return (
              <div
                key={topic.id}
                className="p-4 rounded-xl border border-stone-200 bg-white hover:shadow-xs transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentStep.color}`}>
                      {currentStep.label}
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono">
                      امتیاز: {topic.priorityScore}/100
                    </span>
                    <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-mono">
                      {topic.searchIntent}
                    </span>
                  </div>

                  <h4 className="font-bold text-stone-900 text-sm">{topic.title}</h4>

                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <span>کلیدواژه: <strong className="text-stone-700">{topic.primaryKeyword}</strong></span>
                    {topic.reason && <span>• {topic.reason}</span>}
                  </div>
                </div>

                {/* Actions & Lifecycle Advances */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  {/* One-click Article Generation */}
                  <button
                    onClick={() => {
                      handleUpdateStatus(topic.id, 'GENERATING');
                      onSelectTopicForGeneration(topic.title, topic.primaryKeyword, topic.searchIntent, topic.id);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>تولید مقاله با AI</span>
                  </button>

                  {/* Advance to Next Lifecycle Step */}
                  {nextStep && (
                    <button
                      onClick={() => handleUpdateStatus(topic.id, nextStep.key)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1 transition-colors"
                      title={`انتقال به مرحله ${nextStep.label}`}
                    >
                      <span>{nextStep.label.split(' ')[0]}</span>
                      <ArrowRight className="w-3 h-3 rotate-180" />
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteTopic(topic.id)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="حذف موضوع"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
