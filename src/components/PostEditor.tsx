import { useState } from 'react';
import { 
  ArrowRight, Save, Send, Sparkles, Eye, Code, Check, 
  AlertCircle, Image as ImageIcon, Tag, Folder, Compass, 
  HelpCircle, Wand2, Copy, FileText, CheckCircle2, Loader2, ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { WPPost, WPCategory, SiteSettings } from '../types';
import AutoSeoAdvisor from './AutoSeoAdvisor';
import AIWritingStudio from './AIWritingStudio';

interface PostEditorProps {
  post: WPPost;
  categories: WPCategory[];
  settings: SiteSettings;
  onSave: (updatedPost: WPPost) => void;
  onBack: () => void;
}

export default function PostEditor({
  post,
  categories,
  settings,
  onSave,
  onBack
}: PostEditorProps) {
  const [title, setTitle] = useState(post.title.rendered || '');
  const [slug, setSlug] = useState(post.slug || '');
  const [excerpt, setExcerpt] = useState(post.excerpt?.rendered || '');
  const [content, setContent] = useState(post.content.rendered || '');
  const [featuredImage, setFeaturedImage] = useState(post.featured_media_url || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    post.category_names?.[0] || 'مقالات'
  );
  const [tagsInput, setTagsInput] = useState(post.tag_names?.join('، ') || '');
  const [status, setStatus] = useState(post.status);
  
  // UI Tabs
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'seo' | 'auto-seo' | 'ai-studio'>('editor');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // AI assist state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [isQuickImageLoading, setIsQuickImageLoading] = useState(false);
  const [quickImageVariations, setQuickImageVariations] = useState<any[]>([]);

  // Quick stats
  const plainText = content.replace(/<[^>]+>/g, ' ').replace(/[#*_`]/g, ' ');
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(words / 200));

  // SEO Score items
  const hasH2 = content.includes('## ') || content.includes('<h2');
  const hasGoodTitle = title.length >= 25 && title.length <= 80;
  const hasExcerpt = excerpt.length >= 40;
  const hasImage = Boolean(featuredImage);
  const hasGoodLength = words >= 300;

  const handleApplyTitle = (newTitle: string) => {
    setTitle(newTitle);
  };

  const handleApplyMeta = (newMeta: string) => {
    setExcerpt(newMeta);
  };

  const handleApplyKeywords = (newKeywords: string[]) => {
    const existing = tagsInput
      .split(/[,،]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const combined = Array.from(new Set([...existing, ...newKeywords]));
    setTagsInput(combined.join('، '));
  };

  const handleApplySlug = (newSlug: string) => {
    setSlug(newSlug);
  };

  const handleInsertH2Heading = (heading: string) => {
    setContent((prev) => prev + `\n\n## ${heading}\nتوضیحات و نکات تخصصی این بخش را اینجا بنویسید...\n`);
  };

  const handleUpdateContent = (newContent: string) => {
    setContent(newContent);
  };

  const handleAppendContent = (additionalContent: string) => {
    setContent((prev) => prev + additionalContent);
  };

  const handleUpdateFeaturedImage = (imageUrl: string) => {
    setFeaturedImage(imageUrl);
  };

  const handleSaveLocal = () => {
    const updated: WPPost = {
      ...post,
      title: { rendered: title },
      slug: slug || title.replace(/\s+/g, '-'),
      excerpt: { rendered: excerpt },
      content: { rendered: content },
      featured_media_url: featuredImage,
      category_names: [selectedCategory],
      tag_names: tagsInput.split(/[,،]+/).map((t) => t.trim()).filter(Boolean),
      status: status,
      is_local: true,
      local_updated_at: new Date().toISOString()
    };
    onSave(updated);
    setPublishMessage({
      type: 'success',
      text: 'مقاله در حافظه پنل با موفقیت ذخیره شد.'
    });
    setTimeout(() => setPublishMessage(null), 3000);
  };

  const handlePublishToWordPress = async () => {
    setIsPublishing(true);
    setPublishMessage(null);

    const postPayload: WPPost = {
      ...post,
      title: { rendered: title },
      slug: slug || title.replace(/\s+/g, '-'),
      excerpt: { rendered: excerpt },
      content: { rendered: content },
      featured_media_url: featuredImage,
      category_names: [selectedCategory],
      tag_names: tagsInput.split(/[,،]+/).map((t) => t.trim()).filter(Boolean),
      status: 'publish'
    };

    try {
      const response = await fetch('/api/wp/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteUrl: settings.siteUrl,
          username: settings.username,
          appPassword: settings.appPassword,
          post: postPayload
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'خطا در ارسال پست به وردپرس');
      }

      onSave({
        ...postPayload,
        status: settings.username && settings.appPassword ? 'publish' : 'local_draft',
        is_local: !(settings.username && settings.appPassword)
      });

      setPublishMessage({
        type: 'success',
        text: data.message || 'پست با موفقیت ثبت شد.'
      });
    } catch (err: any) {
      setPublishMessage({
        type: 'error',
        text: err.message || 'خطا در انتشار به وردپرس'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = document.getElementById('content-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const replacement = before + (selectedText || 'متن دلخواه') + after;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + replacement.length - after.length);
    }, 50);
  };

  // AI helper actions
  const handleAiAction = async (action: 'catchy_titles' | 'meta_description' | 'faq_generation' | 'improve_persian' | 'generate_intro' | 'generate_conclusion') => {
    setIsAiLoading(true);
    setAiSuggestions(null);
    try {
      const res = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          title,
          content
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطای هوش مصنوعی');

      if (action === 'catchy_titles') {
        try {
          const list = JSON.parse(data.result);
          if (Array.isArray(list)) setAiSuggestions(list);
          else setAiSuggestions([data.result]);
        } catch {
          setAiSuggestions([data.result]);
        }
      } else if (action === 'meta_description') {
        setExcerpt(data.result.replace(/^"|"$/g, ''));
      } else if (action === 'faq_generation') {
        setContent((prev) => prev + '\n\n## سوالات متداول خریداران و طبیعت‌گردان\n' + data.result);
      } else if (action === 'improve_persian') {
        setContent(data.result);
      } else if (action === 'generate_intro') {
        setContent((prev) => data.result + '\n\n' + prev);
      } else if (action === 'generate_conclusion') {
        setContent((prev) => prev + '\n\n## جمع‌بندی و راهنمای خرید\n' + data.result);
      }
    } catch (err: any) {
      setPublishMessage({
        type: 'error',
        text: err.message || 'خطا در ارتباط با هوش مصنوعی'
      });
      setTimeout(() => setPublishMessage(null), 5000);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleQuickGenerateImage = async () => {
    if (!title && !content) {
      setPublishMessage({
        type: 'error',
        text: 'برای ساخت هوشمند تصویر، ابتدا عنوان یا متنی برای مقاله وارد کنید.'
      });
      setTimeout(() => setPublishMessage(null), 4000);
      return;
    }

    setIsQuickImageLoading(true);
    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: content.slice(0, 500),
          style: 'realistic',
          aspectRatio: '16:9'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'خطا در ساخت تصویر');

      if (data.imageUrl) {
        setFeaturedImage(data.imageUrl);
        if (Array.isArray(data.variations)) {
          setQuickImageVariations(data.variations);
        }
        setPublishMessage({
          type: 'success',
          text: data.persianCaption ? `تصویر شاخص هوشمند انتخاب شد: ${data.persianCaption}` : 'تصویر شاخص هوشمند با موفقیت انتخاب شد.'
        });
        setTimeout(() => setPublishMessage(null), 6000);
      }
    } catch (err: any) {
      setPublishMessage({
        type: 'error',
        text: err.message || 'خطا در دریافت تصویر هوشمند'
      });
      setTimeout(() => setPublishMessage(null), 5000);
    } finally {
      setIsQuickImageLoading(false);
    }
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 rounded-xl border border-stone-200 transition-colors"
            title="بازگشت به لیست مقالات"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <span className="text-xs text-stone-400 font-mono">
              {post.id ? `پست شماره #${post.id}` : 'پست جدید'}
            </span>
            <h2 className="text-xl font-extrabold text-stone-900 line-clamp-1">
              {title || 'بدون عنوان'}
            </h2>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyContent}
            className="px-3 py-2 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'کپی شد!' : 'کپی متن'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveLocal}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>ذخیره پیش‌نویس</span>
          </button>

          <button
            type="button"
            onClick={handlePublishToWordPress}
            disabled={isPublishing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال اتصال به وردپرس...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>انتشار در madanicamp.com</span>
              </>
            )}
          </button>
        </div>
      </div>

      {publishMessage && (
        <div
          className={`mb-6 p-4 rounded-xl border text-xs flex items-center gap-2 ${
            publishMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {publishMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{publishMessage.text}</span>
        </div>
      )}

      {/* Tabs bar */}
      <div className="flex items-center justify-between border-b border-stone-200 mb-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>ویرایشگر محتوا</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('auto-seo')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'auto-seo'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>دستیار هوشمند سئو (Auto SEO)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-100 text-emerald-800 font-black">
              هوشمند
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai-studio')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'ai-studio'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Wand2 className="w-4 h-4 text-teal-600" />
            <span>استودیو نگارش و تصویر AI</span>
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-teal-100 text-teal-800 font-black">
              متن + تصویر
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>پیش‌نمایش وبلاگ</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seo')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'seo'
                ? 'border-emerald-600 text-emerald-800'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>چک‌لیست سلامت سئو</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] ${hasGoodLength && hasH2 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {words} کلمه
            </span>
          </button>
        </div>

        {/* AI quick bar */}
        <div className="flex items-center gap-1.5 pb-2">
          <button
            type="button"
            onClick={() => handleAiAction('catchy_titles')}
            disabled={isAiLoading}
            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
          >
            <Sparkles className="w-3 h-3 text-amber-600" />
            <span>پیشنهاد عنوان با AI</span>
          </button>

          <button
            type="button"
            onClick={() => handleAiAction('meta_description')}
            disabled={isAiLoading}
            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
          >
            <Wand2 className="w-3 h-3 text-emerald-600" />
            <span>نوشتن متای سئو</span>
          </button>

          <button
            type="button"
            onClick={() => handleAiAction('faq_generation')}
            disabled={isAiLoading}
            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="w-3 h-3 text-blue-600" />
            <span>تولید سوالات متداول</span>
          </button>
        </div>
      </div>

      {/* Suggested titles popover if available */}
      {aiSuggestions && (
        <div className="mb-5 p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              عناوین پیشنهادی هوش مصنوعی برای این مقاله (برای اعمال کلیک کنید):
            </span>
            <button
              onClick={() => setAiSuggestions(null)}
              className="text-amber-700 hover:text-amber-950 text-xs"
            >
              بستن
            </button>
          </div>
          <div className="space-y-1.5">
            {aiSuggestions.map((sug, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setTitle(sug.replace(/^\d+[\.\-\s]+/, '').replace(/^"|"$/g, ''));
                  setAiSuggestions(null);
                }}
                className="w-full text-right p-2 bg-white hover:bg-amber-100/50 rounded-lg border border-amber-200 text-xs text-stone-800 font-medium transition-colors"
              >
                {sug}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Editor */}
      {activeTab === 'editor' && (
        <div className="space-y-6">
          {/* Quick Auto SEO Advisor Banner inside Editor for immediate access */}
          <AutoSeoAdvisor
            title={title}
            content={content}
            currentExcerpt={excerpt}
            currentSlug={slug}
            onApplyTitle={handleApplyTitle}
            onApplyMeta={handleApplyMeta}
            onApplyKeywords={handleApplyKeywords}
            onApplySlug={handleApplySlug}
            onInsertH2Heading={handleInsertH2Heading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main 2 cols: inputs & content */}
            <div className="lg:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  عنوان اصلی مقاله (H1):
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان مقاله..."
                  className="w-full px-4 py-2.5 bg-white rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-900 font-bold text-base"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  توضیحات کوتاه / متای مقاله (Excerpt):
                </label>
                <textarea
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={2}
                  placeholder="خلاصه ترغیب‌کننده برای پیش‌نمایش در شبکه‌های اجتماعی و نتایج گوگل..."
                  className="w-full px-3 py-2 bg-white rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800 text-xs leading-relaxed"
                />
              </div>

            {/* Markdown / HTML toolbar */}
            <div className="bg-stone-100 p-2 rounded-t-xl border border-stone-200 flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => insertMarkdown('## ', '\n')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded font-bold text-stone-700"
                title="سرتیتر سطح ۲"
              >
                H2
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('### ', '\n')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded font-bold text-stone-700"
                title="سرتیتر سطح ۳"
              >
                H3
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('**', '**')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded font-bold text-stone-700"
                title="متن ضخیم"
              >
                B
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('*', '*')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded italic text-stone-700"
                title="متن مایل"
              >
                I
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('- ', '\n')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded text-stone-700"
                title="لیست بالت‌دار"
              >
                • لیست
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('> ', '\n')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded text-stone-700"
                title="نقل قول"
              >
                " نقل‌قول
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('\n> ⛺ **نکته طلایی مدنی کمپ:** ', '\n\n')}
                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded font-semibold text-[11px]"
                title="کادر نکته کمپینگ"
              >
                ⛺ نکته کمپینگ
              </button>
              <button
                type="button"
                onClick={() => insertMarkdown('[عنوان لینک](', ')')}
                className="px-2 py-1 bg-white hover:bg-stone-200 rounded text-stone-700"
                title="لینک"
              >
                🔗 لینک
              </button>

              <span className="text-stone-300">|</span>

              <button
                type="button"
                onClick={() => handleAiAction('generate_intro')}
                disabled={isAiLoading}
                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded font-semibold text-[11px] flex items-center gap-1"
                title="نوشتن خودکار مقدمه جذاب"
              >
                <Sparkles className="w-3 h-3 text-amber-600" />
                <span>+ مقدمه AI</span>
              </button>

              <button
                type="button"
                onClick={() => handleAiAction('generate_conclusion')}
                disabled={isAiLoading}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded font-semibold text-[11px] flex items-center gap-1"
                title="نوشتن خودکار جمع‌بندی و نتیجه‌گیری"
              >
                <Wand2 className="w-3 h-3 text-blue-600" />
                <span>+ جمع‌بندی AI</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ai-studio')}
                className="px-2 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                title="ورود به استودیوی کامل نگارش هوشمند و تولید تصویر"
              >
                <Sparkles className="w-3 h-3 text-emerald-200" />
                <span>استودیو متن و تصویر AI</span>
              </button>

              <div className="mr-auto text-stone-400 text-[11px]">
                {words} کلمه | ~{readTime} دقیقه
              </div>
            </div>

            <textarea
              id="content-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={18}
              placeholder="متن کامل مقاله به زبان فارسی یا Markdown..."
              className="w-full px-4 py-3 bg-white rounded-b-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-stone-800 text-sm leading-loose font-mono"
            />
          </div>

          {/* Right sidebar: Settings & Metadata */}
          <div className="space-y-4">
            {/* Featured Image */}
            <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span>تصویر شاخص مقاله:</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleQuickGenerateImage}
                    disabled={isQuickImageLoading}
                    className="px-2 py-0.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                    title="تحلیل خودکار محتوا و انتخاب تصویر واقع‌گرایانه مرتبط"
                  >
                    {isQuickImageLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin text-white" />
                    ) : (
                      <Sparkles className="w-3 h-3 text-emerald-200" />
                    )}
                    <span>{isQuickImageLoading ? 'در حال ساخت...' : 'تولید هوشمند'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ai-studio')}
                    className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md text-[10px] font-medium flex items-center gap-1 transition-colors"
                    title="تنظیم دقیق سبک و پرامپت در استودیو"
                  >
                    <span>استودیو</span>
                  </button>
                </div>
              </div>
              <input
                type="url"
                value={featuredImage}
                onChange={(e) => setFeaturedImage(e.target.value)}
                placeholder="https://madanicamp.com/wp-content/..."
                dir="ltr"
                className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-300 focus:outline-none text-stone-800 text-xs font-mono"
              />
              {featuredImage ? (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden border border-stone-200 h-36 bg-stone-100 relative group">
                    <img
                      src={featuredImage}
                      alt="پیش‌نمایش تصویر"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-stone-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleQuickGenerateImage}
                        disabled={isQuickImageLoading}
                        className="px-2.5 py-1 bg-white text-stone-900 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-stone-100 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>تولید مجدد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('ai-studio')}
                        className="px-2.5 py-1 bg-teal-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-teal-500 cursor-pointer"
                      >
                        <span>گالری تنوع</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick variations switcher if available */}
                  {quickImageVariations.length > 1 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-stone-500 font-medium block">
                        تغییر زاویه و پرسپکتیو تصویر:
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {quickImageVariations.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setFeaturedImage(v.url)}
                            className={`relative aspect-video rounded-md overflow-hidden border transition-all cursor-pointer ${
                              featuredImage === v.url
                                ? 'border-teal-500 ring-2 ring-teal-500/50'
                                : 'border-stone-200 opacity-75 hover:opacity-100'
                            }`}
                            title={v.title}
                          >
                            <img
                              src={v.url}
                              alt={v.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            {featuredImage === v.url && (
                              <div className="absolute inset-0 bg-teal-900/30 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div 
                  onClick={handleQuickGenerateImage}
                  className="h-28 border-2 border-dashed border-stone-200 hover:border-emerald-400 rounded-lg flex flex-col items-center justify-center text-stone-400 hover:text-emerald-700 text-xs cursor-pointer transition-colors bg-stone-50/50 hover:bg-emerald-50/30 p-3 text-center"
                >
                  {isQuickImageLoading ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                      <span className="font-semibold text-stone-700">در حال جستجو و تولید تصویر هوشمند...</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6 mb-1 text-emerald-600" />
                      <span className="font-bold text-stone-700">کلیک برای تولید هوشمند تصویر شاخص</span>
                      <span className="text-[10px] text-stone-500 mt-0.5">مطابق با موضوع مقاله، کاملاً واقع‌گرایانه</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Category & Slug */}
            <div className="bg-white p-4 rounded-xl border border-stone-200 space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-stone-500" />
                  <span>دسته‌بندی در وبلاگ:</span>
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-300 text-stone-800 text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} ({c.count} نوشته)
                    </option>
                  ))}
                  <option value="تجهیزات کمپینگ">تجهیزات کمپینگ</option>
                  <option value="کوهنوردی و کفش">کوهنوردی و کفش</option>
                  <option value="کیسه خواب و چادر">کیسه خواب و چادر</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-stone-500" />
                  <span>برچسب‌ها (با کاما جدا کنید):</span>
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="کفش کوهنوردی، چادر مسافرتی، مدنی کمپ"
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-300 text-stone-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800 mb-1">
                  پیوند یکتا (Slug URL):
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="slug-url"
                  dir="ltr"
                  className="w-full px-3 py-2 bg-stone-50 rounded-lg border border-stone-300 text-stone-800 text-xs font-mono"
                />
              </div>
            </div>

            {/* Publishing Target Site */}
            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2 text-xs">
              <span className="font-bold text-stone-800 block">مقصد انتشار:</span>
              <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>سایت اصلی: madanicamp.com</span>
              </div>
              <p className="text-[11px] text-stone-500">
                {settings.username && settings.appPassword
                  ? 'احراز هویت وردپرس فعال است. با زدن دکمه انتشار، پست مستقیماً روی سایت بارگذاری می‌شود.'
                  : 'در صورت تمایل می‌توانید در تنظیمات بالا، رمز عبور کاربردی وردپرس را ست کنید تا بدون نیاز به ورود مجدد، پست در سایت ارسال شود.'}
              </p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Tab: Preview */}
      {activeTab === 'preview' && (
        <div className="bg-white p-8 rounded-2xl border border-stone-200 max-w-4xl mx-auto space-y-6">
          {featuredImage && (
            <div className="rounded-xl overflow-hidden max-h-80 w-full bg-stone-100 border border-stone-200">
              <img
                src={featuredImage}
                alt={title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-stone-400 border-b border-stone-100 pb-3">
            <span>نویسنده: مدنی کمپ</span>
            <span>•</span>
            <span>دسته: {selectedCategory}</span>
            <span>•</span>
            <span>مدت مطالعه: {readTime} دقیقه</span>
          </div>

          <h1 className="text-3xl font-black text-stone-900 leading-tight">
            {title || 'بدون عنوان'}
          </h1>

          {excerpt && (
            <div className="p-4 bg-emerald-50/70 border-r-4 border-emerald-600 rounded-lg text-stone-700 text-sm italic">
              {excerpt}
            </div>
          )}

          {/* Render Markdown or HTML */}
          <div className="prose prose-stone max-w-none text-stone-800 text-sm leading-loose space-y-4 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-stone-900 [&>h2]:mt-6 [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-stone-800 [&>h3]:mt-4 [&>ul]:list-disc [&>ul]:pr-5 [&>ol]:list-decimal [&>ol]:pr-5 [&>p]:mb-3 [&>blockquote]:p-3 [&>blockquote]:bg-stone-50 [&>blockquote]:border-r-4 [&>blockquote]:border-emerald-600 [&>blockquote]:rounded-lg">
            {content.includes('<') && content.includes('>') ? (
              <div dangerouslySetInnerHTML={{ __html: content }} />
            ) : (
              <ReactMarkdown>{content}</ReactMarkdown>
            )}
          </div>
        </div>
      )}

      {/* Tab: SEO & Content Quality */}
      {activeTab === 'seo' && (
        <div className="bg-white p-6 rounded-2xl border border-stone-200 max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-stone-900">بررسی کیفیت سئو و خوانایی محتوا</h3>
              <p className="text-xs text-stone-500">منطبق بر استانداردهای رتبه‌بندی گوگل برای وبلاگ مدنی کمپ</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-600">
                {[hasGoodTitle, hasExcerpt, hasH2, hasImage, hasGoodLength].filter(Boolean).length * 20}%
              </span>
              <span className="text-xs text-stone-400 block">امتیاز کلی</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl border flex items-center justify-between text-xs bg-stone-50">
              <div className="flex items-center gap-2">
                {hasGoodTitle ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 block">طول عنوان مقاله (H1):</span>
                  <span className="text-stone-500 text-[11px]">
                    طول فعلی: {title.length} کاراکتر (استاندارد بین ۳۰ تا ۷۰ کاراکتر)
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold ${hasGoodTitle ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {hasGoodTitle ? 'مناسب' : 'نیازمند اصلاح'}
              </span>
            </div>

            <div className="p-3 rounded-xl border flex items-center justify-between text-xs bg-stone-50">
              <div className="flex items-center gap-2">
                {hasExcerpt ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 block">توضیحات متا (Meta Description):</span>
                  <span className="text-stone-500 text-[11px]">
                    {hasExcerpt ? `${excerpt.length} کاراکتر` : 'توضیحات کوتاه یا متا ثبت نشده است'}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold ${hasExcerpt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {hasExcerpt ? 'مناسب' : 'ناقص'}
              </span>
            </div>

            <div className="p-3 rounded-xl border flex items-center justify-between text-xs bg-stone-50">
              <div className="flex items-center gap-2">
                {hasH2 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 block">سرتیترهای فرعی (عناوین H2 و H3):</span>
                  <span className="text-stone-500 text-[11px]">
                    {hasH2 ? 'مقاله دارای ساختار بخش‌بندی شده با عناوین داخلی است' : 'هیچ سرتیتر داخلی (H2) یافت نشد'}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold ${hasH2 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {hasH2 ? 'عالی' : 'پیشنهاد افزودن H2'}
              </span>
            </div>

            <div className="p-3 rounded-xl border flex items-center justify-between text-xs bg-stone-50">
              <div className="flex items-center gap-2">
                {hasGoodLength ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 block">تعداد کلمات و عمق محتوا:</span>
                  <span className="text-stone-500 text-[11px]">
                    {words} کلمه (حداقل ۳۰۰ کلمه برای سئوی مناسب مقالات کمپینگ)
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold ${hasGoodLength ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {hasGoodLength ? 'کافی' : 'کوتاه'}
              </span>
            </div>

            <div className="p-3 rounded-xl border flex items-center justify-between text-xs bg-stone-50">
              <div className="flex items-center gap-2">
                {hasImage ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <span className="font-semibold text-stone-800 block">تصویر شاخص:</span>
                  <span className="text-stone-500 text-[11px]">
                    {hasImage ? 'تصویر شاخص مشخص شده است' : 'تصویر شاخص درج نشده'}
                  </span>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded font-bold ${hasImage ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {hasImage ? 'تایید' : 'پیشنهاد درج تصویر'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Dedicated Auto SEO Suite */}
      {activeTab === 'auto-seo' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <AutoSeoAdvisor
            title={title}
            content={content}
            currentExcerpt={excerpt}
            currentSlug={slug}
            onApplyTitle={handleApplyTitle}
            onApplyMeta={handleApplyMeta}
            onApplyKeywords={handleApplyKeywords}
            onApplySlug={handleApplySlug}
            onInsertH2Heading={handleInsertH2Heading}
          />
        </div>
      )}

      {/* Tab: Dedicated AI Writing & Image Studio */}
      {activeTab === 'ai-studio' && (
        <div className="max-w-5xl mx-auto space-y-6">
          <AIWritingStudio
            title={title}
            content={content}
            featuredImage={featuredImage}
            onUpdateContent={handleUpdateContent}
            onAppendContent={handleAppendContent}
            onUpdateFeaturedImage={handleUpdateFeaturedImage}
          />
        </div>
      )}
    </div>
  );
}
