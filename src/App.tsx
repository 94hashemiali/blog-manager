import { useState, useEffect } from 'react';
import Header from './components/Header';
import PostList from './components/PostList';
import PostEditor from './components/PostEditor';
import PostPreviewModal from './components/PostPreviewModal';
import AIPostGeneratorModal from './components/AIPostGeneratorModal';
import SettingsModal from './components/SettingsModal';
import ExplanationModal from './components/ExplanationModal';
import { WPPost, WPCategory, SiteSettings } from './types';

const STORAGE_KEY_SETTINGS = 'madani_blog_settings';
const STORAGE_KEY_LOCAL_POSTS = 'madani_local_posts';

export default function App() {
  const [posts, setPosts] = useState<WPPost[]>([]);
  const [categories, setCategories] = useState<WPCategory[]>([]);
  const [siteStatus, setSiteStatus] = useState<{
    connected: boolean;
    siteUrl?: string;
    responseTimeMs?: number;
    totalPosts?: number;
    message?: string;
  }>({
    connected: true,
    siteUrl: 'https://madanicamp.com',
    totalPosts: 3
  });

  const [isLoading, setIsLoading] = useState(true);
  const [selectedPostForPreview, setSelectedPostForPreview] = useState<WPPost | null>(null);
  const [editingPost, setEditingPost] = useState<WPPost | null>(null);

  // Modals
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  // Settings
  const [settings, setSettings] = useState<SiteSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      siteUrl: 'https://madanicamp.com',
      username: '',
      appPassword: '',
      autoSync: true
    };
  });

  // Fetch status and posts
  const fetchAllData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // 1. Status
      const statusRes = await fetch(`/api/wp/status?siteUrl=${encodeURIComponent(settings.siteUrl)}`);
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setSiteStatus(sData);
      }

      // 2. Categories
      const catRes = await fetch(`/api/wp/categories?siteUrl=${encodeURIComponent(settings.siteUrl)}`);
      if (catRes.ok) {
        const cData = await catRes.json();
        if (cData.categories) setCategories(cData.categories);
      }

      // 3. Posts (Include credentials if configured to fetch remote drafts too)
      const queryParams = new URLSearchParams({
        refresh: forceRefresh ? 'true' : 'false',
        siteUrl: settings.siteUrl,
        ...(settings.username ? { username: settings.username } : {}),
        ...(settings.appPassword ? { appPassword: settings.appPassword } : {})
      });

      const postsRes = await fetch(`/api/wp/posts?${queryParams.toString()}`);
      if (postsRes.ok) {
        const pData = await postsRes.json();
        let serverPosts: WPPost[] = pData.posts || [];

        // Merge with locally stored drafts from localStorage
        try {
          const localDraftsRaw = localStorage.getItem(STORAGE_KEY_LOCAL_POSTS);
          if (localDraftsRaw) {
            const localDrafts: WPPost[] = JSON.parse(localDraftsRaw);
            const merged = [...serverPosts];
            for (const ld of localDrafts) {
              const existsIndex = merged.findIndex(
                (mp) => mp.id === ld.id || (mp.slug && ld.slug && mp.slug === ld.slug)
              );
              if (existsIndex >= 0) {
                if (ld.local_updated_at && (!merged[existsIndex].local_updated_at || ld.local_updated_at > merged[existsIndex].local_updated_at)) {
                  merged[existsIndex] = ld;
                }
              } else {
                merged.push(ld);
              }
            }
            serverPosts = merged;
          }
        } catch {}

        setPosts(serverPosts);
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [settings.siteUrl, settings.username, settings.appPassword]);

  const handleSaveSettings = (newSettings: SiteSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
    } catch {}
  };

  const handleSavePost = async (updatedPost: WPPost) => {
    setPosts((prev) => {
      const exists = prev.findIndex((p) => p.id === updatedPost.id);
      let nextList: WPPost[];
      if (exists >= 0) {
        nextList = [...prev];
        nextList[exists] = updatedPost;
      } else {
        nextList = [updatedPost, ...prev];
      }

      // Persist local posts
      try {
        const localOnly = nextList.filter((p) => p.is_local || p.status !== 'publish');
        localStorage.setItem(STORAGE_KEY_LOCAL_POSTS, JSON.stringify(localOnly));
      } catch {}

      return nextList;
    });

    if (editingPost && editingPost.id === updatedPost.id) {
      setEditingPost(updatedPost);
    }

    // Sync to server memory so it persists across refreshes
    try {
      await fetch('/api/wp/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: updatedPost })
      });
    } catch (e) {
      console.warn('Could not sync draft to server memory:', e);
    }
  };

  const handleDeletePost = async (postId: number | string) => {
    setPosts((prev) => {
      const nextList = prev.filter((p) => p.id !== postId);
      try {
        const localOnly = nextList.filter((p) => p.is_local || p.status !== 'publish');
        localStorage.setItem(STORAGE_KEY_LOCAL_POSTS, JSON.stringify(localOnly));
      } catch {}
      return nextList;
    });

    if (editingPost && editingPost.id === postId) {
      setEditingPost(null);
    }

    try {
      await fetch(`/api/wp/posts/${postId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Error deleting post on server:', e);
    }
  };

  const handlePostGeneratedFromAI = (partialPost: Partial<WPPost>) => {
    const newPost: WPPost = {
      id: partialPost.id || `ai-draft-${Date.now()}`,
      date: new Date().toISOString(),
      slug: partialPost.slug || 'new-camping-article',
      status: 'local_draft',
      title: partialPost.title || { rendered: 'مقاله جدید مدنی کمپ' },
      content: partialPost.content || { rendered: '' },
      excerpt: partialPost.excerpt || { rendered: '' },
      featured_media_url: partialPost.featured_media_url || '',
      categories: [1],
      category_names: partialPost.category_names || ['مقالات'],
      tags: [],
      tag_names: partialPost.tag_names || ['مدنی کمپ', 'کمپینگ'],
      author_name: 'مدنی کمپ',
      is_local: true,
      local_updated_at: new Date().toISOString()
    };

    handleSavePost(newPost);
    setEditingPost(newPost);
  };

  const handleCreateNewPost = () => {
    const blankPost: WPPost = {
      id: `draft-${Date.now()}`,
      date: new Date().toISOString(),
      slug: '',
      status: 'local_draft',
      title: { rendered: '' },
      content: { rendered: '' },
      excerpt: { rendered: '' },
      featured_media_url: '',
      categories: [1],
      category_names: ['مقالات'],
      tags: [],
      tag_names: [],
      author_name: 'مدنی کمپ',
      is_local: true
    };
    setEditingPost(blankPost);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      {/* Header */}
      <Header
        siteStatus={siteStatus}
        isLoading={isLoading}
        onRefresh={() => fetchAllData(true)}
        onOpenAIModal={() => setIsAIModalOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExplanation={() => setIsExplanationOpen(true)}
        onCreateNewPost={handleCreateNewPost}
      />

      {/* Main workspace */}
      <main className="flex-1">
        {editingPost ? (
          <PostEditor
            post={editingPost}
            categories={categories}
            settings={settings}
            onSave={handleSavePost}
            onBack={() => setEditingPost(null)}
          />
        ) : (
          <PostList
            posts={posts}
            categories={categories}
            onSelectPost={(post) => setSelectedPostForPreview(post)}
            onEditPost={(post) => setEditingPost(post)}
            onCreateNew={handleCreateNewPost}
            onOpenAI={() => setIsAIModalOpen(true)}
            onDeletePost={handleDeletePost}
          />
        )}
      </main>

      {/* Modals */}
      <PostPreviewModal
        post={selectedPostForPreview}
        isOpen={Boolean(selectedPostForPreview)}
        onClose={() => setSelectedPostForPreview(null)}
        onEdit={(post) => {
          setSelectedPostForPreview(null);
          setEditingPost(post);
        }}
      />

      <AIPostGeneratorModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onPostGenerated={handlePostGeneratedFromAI}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        posts={posts}
      />

      <ExplanationModal
        isOpen={isExplanationOpen}
        onClose={() => setIsExplanationOpen(false)}
        siteStatus={siteStatus}
      />
    </div>
  );
}
