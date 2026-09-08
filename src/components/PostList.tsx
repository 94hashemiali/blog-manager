import { useState, useMemo } from 'react';
import { 
  Search, Filter, ExternalLink, Edit3, Eye, Calendar, 
  Clock, Plus, Sparkles, Folder, CheckCircle, Clock3, Tag, Trash2,
  X, RotateCcw, ArrowUpDown, Layers, SlidersHorizontal
} from 'lucide-react';
import { WPPost, WPCategory } from '../types';
import { extractString } from '../utils/postUtils';

interface PostListProps {
  posts: WPPost[];
  categories: WPCategory[];
  onSelectPost: (post: WPPost) => void;
  onEditPost: (post: WPPost) => void;
  onCreateNew: () => void;
  onOpenAI: () => void;
  onDeletePost?: (postId: number | string) => void;
}

export default function PostList({
  posts,
  categories,
  onSelectPost,
  onEditPost,
  onCreateNew,
  onOpenAI,
  onDeletePost
}: PostListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'publish' | 'local_draft'>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'title'>('date_desc');

  // Dynamically extract all available categories and count matching posts
  const categoryOptions = useMemo(() => {
    const map = new Map<string, number>();

    // Add categories from props
    categories.forEach((c) => {
      if (c.name && c.name.trim()) {
        map.set(c.name.trim(), 0);
      }
    });

    // Add and count categories present across all posts
    posts.forEach((post) => {
      if (post.category_names && Array.isArray(post.category_names)) {
        post.category_names.forEach((name) => {
          const trimmed = name?.trim();
          if (trimmed) {
            map.set(trimmed, (map.get(trimmed) || 0) + 1);
          }
        });
      }
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [categories, posts]);

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const q = searchTerm.trim().toLowerCase();
      const titleText = extractString(post.title).toLowerCase();
      const excerptText = extractString(post.excerpt).toLowerCase();
      const contentText = extractString(post.content).toLowerCase();

      const matchesSearch =
        !q ||
        titleText.includes(q) ||
        excerptText.includes(q) ||
        contentText.includes(q) ||
        (post.slug || '').toLowerCase().includes(q) ||
        post.tag_names?.some((t) => t.toLowerCase().includes(q)) ||
        post.category_names?.some((c) => c.toLowerCase().includes(q));

      const matchesCategory =
        selectedCat === 'all' ||
        post.category_names?.some((c) => c.trim().toLowerCase() === selectedCat.trim().toLowerCase());

      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'publish' && post.status === 'publish') ||
        (selectedStatus === 'local_draft' && post.status !== 'publish');

      return matchesSearch && matchesCategory && matchesStatus;
    }).sort((a, b) => {
      if (sortBy === 'title') {
        return extractString(a.title).localeCompare(extractString(b.title), 'fa');
      }
      const timeA = new Date(a.date || a.local_updated_at || 0).getTime();
      const timeB = new Date(b.date || b.local_updated_at || 0).getTime();
      return sortBy === 'date_asc' ? timeA - timeB : timeB - timeA;
    });
  }, [posts, searchTerm, selectedCat, selectedStatus, sortBy]);

  const livePostsCount = posts.filter((p) => p.status === 'publish').length;
  const draftPostsCount = posts.filter((p) => p.status !== 'publish').length;
  const isFilterActive = searchTerm.trim() !== '' || selectedCat !== 'all' || selectedStatus !== 'all';

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCat('all');
    setSelectedStatus('all');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" dir="rtl">
      
      {/* Top Banner / Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-stone-500 block">مقالات زنده در سایت</span>
            <span className="text-2xl sm:text-3xl font-black text-stone-900 mt-1 block">
              {livePostsCount}
            </span>
            <span className="text-[11px] text-emerald-700 font-medium">همگام با madanicamp.com</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-stone-500 block">پیش‌نویس‌ها در پنل</span>
            <span className="text-2xl sm:text-3xl font-black text-amber-700 mt-1 block">
              {draftPostsCount}
            </span>
            <span className="text-[11px] text-stone-500 font-medium">آماده ویرایش یا انتشار</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock3 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-800 to-teal-900 text-white p-5 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-emerald-200 block">تولید محتوای هوشمند</span>
            <span className="text-sm font-bold mt-1 block">نگارش سریع مقاله تخصصی</span>
            <button
              onClick={onOpenAI}
              className="mt-2 text-xs bg-emerald-700/80 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
              <span>شروع نگارش با هوش مصنوعی</span>
            </button>
          </div>
          <div className="w-12 h-12 rounded-xl bg-white/10 text-emerald-300 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar Container */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs mb-6 overflow-hidden">
        {/* Main Controls Row: Search Input + Status Filter + Sort + New Post */}
        <div className="p-4 border-b border-stone-100 flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در عنوان، متن مقاله، برچسب‌ها یا نامک (اسلاگ)..."
              className="w-full pr-10 pl-16 py-2.5 bg-stone-50 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs text-stone-800 transition-all placeholder:text-stone-400"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-full transition-colors"
                title="پاک کردن جستجو"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 font-medium">
                {filteredPosts.length} مورد
              </span>
            )}
          </div>

          {/* Status Tabs (All, Published, Drafts) */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl shrink-0 self-start sm:self-auto overflow-x-auto max-w-full">
            <button
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedStatus === 'all'
                  ? 'bg-white text-stone-900 shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              همه ({posts.length})
            </button>
            <button
              onClick={() => setSelectedStatus('publish')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedStatus === 'publish'
                  ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              منتشر شده ({livePostsCount})
            </button>
            <button
              onClick={() => setSelectedStatus('local_draft')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedStatus === 'local_draft'
                  ? 'bg-white text-amber-800 shadow-xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              پیش‌نویس‌ها ({draftPostsCount})
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 bg-stone-50 px-2.5 py-2 rounded-xl border border-stone-200 text-xs shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent focus:outline-none text-stone-700 font-medium cursor-pointer"
            >
              <option value="date_desc">جدیدترین تاریخ</option>
              <option value="date_asc">قدیمی‌ترین تاریخ</option>
              <option value="title">بر اساس عنوان (الفبا)</option>
            </select>
          </div>

          {/* New Post Button */}
          <button
            onClick={onCreateNew}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>پست جدید</span>
          </button>
        </div>

        {/* Category Filter Controls: Pills + Quick Select */}
        <div className="p-3 bg-stone-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
            <div className="flex items-center gap-1.5 text-stone-600 font-semibold shrink-0 pl-1">
              <Folder className="w-3.5 h-3.5 text-emerald-700" />
              <span>دسته‌بندی:</span>
            </div>

            {/* "All" Category Pill */}
            <button
              onClick={() => setSelectedCat('all')}
              className={`px-3 py-1 rounded-lg transition-all font-medium whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                selectedCat === 'all'
                  ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                  : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              <span>همه موضوعات</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedCat === 'all' ? 'bg-emerald-800 text-emerald-100' : 'bg-stone-100 text-stone-500'
              }`}>
                {posts.length}
              </span>
            </button>

            {/* Individual Category Pills */}
            {categoryOptions.map((cat) => (
              <button
                key={cat.name}
                onClick={() => setSelectedCat(cat.name)}
                className={`px-3 py-1 rounded-lg transition-all font-medium whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  selectedCat.toLowerCase() === cat.name.toLowerCase()
                    ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                    : 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                <span>{cat.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedCat.toLowerCase() === cat.name.toLowerCase()
                    ? 'bg-emerald-800 text-emerald-100'
                    : 'bg-stone-100 text-stone-500'
                }`}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          {/* Quick Category Dropdown for Mobile / Compact */}
          <div className="flex items-center gap-2 shrink-0 justify-end">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs">
              <Filter className="w-3 h-3 text-stone-400" />
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="bg-transparent focus:outline-none text-stone-700 font-medium cursor-pointer"
              >
                <option value="all">انتخاب از فهرست دسته‌ها ({posts.length})</option>
                {categoryOptions.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Indicators & Reset Bar */}
        {isFilterActive && (
          <div className="px-4 py-2 bg-emerald-50/60 border-t border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-emerald-900">
              <span className="font-semibold text-emerald-800">فیلترهای فعال:</span>
              
              {searchTerm && (
                <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 px-2 py-0.5 rounded-md text-emerald-800">
                  <span>جستجو: «{searchTerm}»</span>
                  <button onClick={() => setSearchTerm('')} className="hover:text-rose-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedCat !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 px-2 py-0.5 rounded-md text-emerald-800">
                  <span>دسته: {selectedCat}</span>
                  <button onClick={() => setSelectedCat('all')} className="hover:text-rose-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedStatus !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-white border border-emerald-200 px-2 py-0.5 rounded-md text-emerald-800">
                  <span>وضعیت: {selectedStatus === 'publish' ? 'منتشر شده' : 'پیش‌نویس‌ها'}</span>
                  <button onClick={() => setSelectedStatus('all')} className="hover:text-rose-600">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <span className="text-[11px] text-emerald-700">
                (نمایش {filteredPosts.length} از {posts.length} مقاله)
              </span>
            </div>

            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>پاک کردن همه فیلترها</span>
            </button>
          </div>
        )}
      </div>

      {/* Draft Notification Banner */}
      {selectedStatus === 'local_draft' && (
        <div className="mb-6 p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-900 text-xs">
          <Clock3 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block mb-1">مدیریت مقالات پیش‌نویس مدنی کمپ ({draftPostsCount} مقاله)</span>
            <p className="text-amber-800 leading-relaxed">
              این مقالات به عنوان پیش‌نویس آماده برای ویرایش، بازنویسی، بهینه‌سازی سئو و تولید تصویر در دسترس هستند. شما می‌توانید آن‌ها را ویرایش، سئو و منتشر کنید.
            </p>
          </div>
        </div>
      )}

      {/* Posts Grid */}
      {filteredPosts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-10 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-400 mx-auto flex items-center justify-center mb-4">
            <Search className="w-7 h-7 text-stone-400" />
          </div>
          <h3 className="text-base font-bold text-stone-800">مقاله‌ای با این مشخصات یافت نشد</h3>
          <p className="text-xs text-stone-500 mt-2 mb-6 leading-relaxed">
            {searchTerm && selectedCat !== 'all'
              ? `هیچ مقاله‌ای شامل عبارت «${searchTerm}» در دسته‌بندی «${selectedCat}» پیدا نشد.`
              : searchTerm
              ? `هیچ مقاله‌ای شامل عبارت «${searchTerm}» پیدا نشد.`
              : selectedCat !== 'all'
              ? `در دسته‌بندی «${selectedCat}» در حال حاضر مقاله‌ای با این فیلتر وضعیت وجود ندارد.`
              : 'هیچ مقاله‌ای برای نمایش وجود ندارد.'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            {isFilterActive && (
              <button
                onClick={handleResetFilters}
                className="w-full sm:w-auto px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>پاک کردن فیلترها و مشاهده همه</span>
              </button>
            )}

            <button
              onClick={onOpenAI}
              className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
              <span>تولید خودکار با هوش مصنوعی</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => {
            const titleStr = extractString(post.title, 'بدون عنوان');
            const contentStr = extractString(post.content, '');
            const excerptStr = extractString(post.excerpt, '');
            const plain = contentStr.replace(/<[^>]+>/g, ' ');
            const words = plain.trim().split(/\s+/).filter(Boolean).length;
            const readTime = Math.max(1, Math.ceil(words / 200));

            return (
              <div
                key={post.id}
                id={`post-card-${post.id}`}
                className="bg-white rounded-2xl border border-stone-200 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden group"
              >
                {/* Image */}
                <div className="relative h-48 w-full bg-stone-100 overflow-hidden border-b border-stone-100">
                  {post.featured_media_url ? (
                    <img
                      src={post.featured_media_url}
                      alt={titleStr}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-stone-400">
                      <Folder className="w-8 h-8 mb-1" />
                      <span className="text-[11px]">بدون تصویر شاخص</span>
                    </div>
                  )}

                  {/* Badges on image */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {post.category_names && post.category_names[0] && (
                      <span className="bg-stone-900/80 backdrop-blur-xs text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                        {post.category_names[0]}
                      </span>
                    )}
                  </div>

                  <div className="absolute top-3 left-3">
                    {post.status === 'publish' ? (
                      <span className="bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-200"></span>
                        در سایت
                      </span>
                    ) : (
                      <span className="bg-amber-600/90 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        پیش‌نویس
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-5 flex-1 flex flex-col">
                  {/* Meta info */}
                  <div className="flex items-center gap-3 text-[11px] text-stone-400 mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span dir="ltr">{new Date(post.date).toLocaleDateString('fa-IR')}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{readTime} دقیقه</span>
                    </span>
                  </div>

                  {/* Title */}
                  <h3 
                    onClick={() => onSelectPost(post)}
                    className="text-base font-bold text-stone-900 hover:text-emerald-700 transition-colors line-clamp-2 cursor-pointer leading-snug mb-2"
                  >
                    {titleStr}
                  </h3>

                  {/* Excerpt */}
                  <div 
                    className="text-xs text-stone-600 line-clamp-3 leading-relaxed mb-4 flex-1"
                    dangerouslySetInnerHTML={{ 
                      __html: (excerptStr || plain).replace(/<[^>]+>/g, '').slice(0, 160) + '...'
                    }}
                  />

                  {/* Card Bottom Actions */}
                  <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onSelectPost(post)}
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                        title="پیش‌نمایش مقاله"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {post.link && (
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="مشاهده در وب‌سایت madanicamp.com"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}

                      {onDeletePost && (post.status !== 'publish' || post.is_local) && (
                        <button
                          onClick={() => {
                            if (window.confirm('آیا از حذف این پیش‌نویس اطمینان دارید؟')) {
                              onDeletePost(post.id);
                            }
                          }}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="حذف پیش‌نویس"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => onEditPost(post)}
                      className="px-3 py-1.5 bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>ویرایش محتوا</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
