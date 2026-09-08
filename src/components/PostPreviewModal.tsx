import { X, ExternalLink, Calendar, User, Clock, Tag, Folder, Edit3 } from 'lucide-react';
import { WPPost } from '../types';

interface PostPreviewModalProps {
  post: WPPost | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (post: WPPost) => void;
}

export default function PostPreviewModal({ post, isOpen, onClose, onEdit }: PostPreviewModalProps) {
  if (!isOpen || !post) return null;

  // Calculate read time
  const plainText = (post.content.rendered || '').replace(/<[^>]+>/g, ' ');
  const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;
  const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div 
        id="post-preview-modal" 
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-1 rounded-full">
              پیش‌نمایش مقاله
            </span>
            {post.status === 'publish' ? (
              <span className="text-xs bg-stone-100 text-stone-700 px-2.5 py-1 rounded-full">
                منتشر شده در madanicamp.com
              </span>
            ) : (
              <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                پیش‌نویس
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onEdit(post);
              }}
              className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>ویرایش محتوا</span>
            </button>
            {post.link && (
              <a
                href={post.link}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>مشاهده در سایت</span>
              </a>
            )}
            <button 
              onClick={onClose}
              className="text-stone-400 hover:text-stone-700 p-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Featured Image */}
          {post.featured_media_url && (
            <div className="rounded-xl overflow-hidden max-h-72 w-full bg-stone-100 border border-stone-200">
              <img
                src={post.featured_media_url}
                alt={post.title.rendered}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Meta bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 border-b border-stone-100 pb-4">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-stone-400" />
              <span>{post.author_name || 'مدنی کمپ'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <span dir="ltr">{new Date(post.date).toLocaleDateString('fa-IR')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              <span>زمان تقریبی مطالعه: {readTimeMinutes} دقیقه ({wordCount} کلمه)</span>
            </div>
            {post.category_names && post.category_names.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-stone-400" />
                <span>دسته: {post.category_names.join('، ')}</span>
              </div>
            )}
          </div>

          {/* Article Title */}
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 leading-tight">
            {post.title.rendered}
          </h1>

          {/* Excerpt */}
          {post.excerpt?.rendered && (
            <div 
              className="p-4 bg-emerald-50/70 border-r-4 border-emerald-600 rounded-lg text-stone-700 text-sm italic leading-relaxed"
              dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }}
            />
          )}

          {/* Article Full Body */}
          <div 
            className="prose prose-stone max-w-none text-stone-800 text-sm leading-loose space-y-4 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-stone-900 [&>h2]:mt-6 [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-stone-800 [&>h3]:mt-4 [&>ul]:list-disc [&>ul]:pr-5 [&>ol]:list-decimal [&>ol]:pr-5 [&>p]:mb-3 [&>img]:rounded-xl [&>img]:my-4"
            dangerouslySetInnerHTML={{ __html: post.content.rendered }}
          />

          {/* Tags */}
          {post.tag_names && post.tag_names.length > 0 && (
            <div className="pt-4 border-t border-stone-100 flex items-center gap-2 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-xs text-stone-500">برچسب‌ها:</span>
              {post.tag_names.map((t, idx) => (
                <span key={idx} className="text-xs bg-stone-100 text-stone-700 px-2.5 py-1 rounded-md">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-100 bg-stone-50 rounded-b-2xl flex items-center justify-between text-xs text-stone-500">
          <span>اسلاگ صفحه: <span className="font-mono text-stone-700">{post.slug}</span></span>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
