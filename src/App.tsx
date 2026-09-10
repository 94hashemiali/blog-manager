import { useState, useEffect } from 'react';
import Header from './components/Header';
import PostList from './components/PostList';
import PostEditor from './components/PostEditor';
import PostPreviewModal from './components/PostPreviewModal';
import AIPostGeneratorModal from './components/AIPostGeneratorModal';
import SettingsModal from './components/SettingsModal';
import ExplanationModal from './components/ExplanationModal';
import SiteSelectorModal from './components/SiteSelectorModal';
import SeoIntelligenceCenter from './components/SeoIntelligenceCenter';
import ContentPlannerCalendar from './components/ContentPlannerCalendar';
import VisualAssetStudio from './components/VisualAssetStudio';
import ContentStudio from './components/ContentStudio';
import PerformanceDashboard from './components/PerformanceDashboard';
import OpsOverview from './components/OpsOverview';
import JobCenter from './components/JobCenter';
import { WPPost, WPCategory, SiteSettings, ManagedSite, KeywordOpportunity } from './types';
import { normalizePost } from './utils/postUtils';
import type { AppView } from './components/Header';
import {
  DEMO_SITE_SEED,
  STORAGE_KEY_ACTIVE_SITE_ID,
  STORAGE_KEY_LOCAL_POSTS,
  STORAGE_KEY_SETTINGS
} from './demo/seedSite';
import { useActiveJobs } from './hooks/useActiveJobs';

const DEFAULT_SITE: ManagedSite = DEMO_SITE_SEED;

export default function App() {
  // Navigation View includes ops overview
  const [currentView, setCurrentView] = useState<AppView>('posts');
  const [pendingProductionJobId, setPendingProductionJobId] = useState<string | null>(null);
  const [jobCenterOpen, setJobCenterOpen] = useState(false);

  // Sites state
  const [sites, setSites] = useState<ManagedSite[]>([DEFAULT_SITE]);
  const [activeSiteId, setActiveSiteId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_SITE_ID) || 'site-madanicamp';
  });
  const { activeCount } = useActiveJobs(activeSiteId, true);

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
  const [isSiteSelectorOpen, setIsSiteSelectorOpen] = useState(false);

  // AI Modal Prefill State
  const [aiModalPrefill, setAiModalPrefill] = useState<{
    topic?: string;
    keyword?: string;
    intent?: string;
    oppId?: string;
  }>({});

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

  // Fetch sites list from server
  const fetchSites = async () => {
    try {
      const res = await fetch('/api/sites');
      const data = await res.json();
      if (data.sites && Array.isArray(data.sites) && data.sites.length > 0) {
        setSites(data.sites);
      }
    } catch (e) {
      console.warn('Failed to load sites:', e);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const activeSite = sites.find((s) => s.id === activeSiteId) || sites[0] || DEFAULT_SITE;

  // Fetch status and posts
  const fetchAllData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      const targetUrl = activeSite.url || settings.siteUrl;

      // 1. Status
      const statusRes = await fetch(`/api/wp/status?siteUrl=${encodeURIComponent(targetUrl)}`);
      if (statusRes.ok) {
        const sData = await statusRes.json();
        setSiteStatus(sData);
      }

      // 2. Categories
      const catRes = await fetch(`/api/wp/categories?siteUrl=${encodeURIComponent(targetUrl)}`);
      if (catRes.ok) {
        const cData = await catRes.json();
        if (cData.categories) setCategories(cData.categories);
      }

      // 3. Posts
      const queryParams = new URLSearchParams({
        refresh: forceRefresh ? 'true' : 'false',
        siteUrl: targetUrl,
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

        setPosts(serverPosts.map(normalizePost));
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [activeSite.url, settings.username, settings.appPassword]);

  const handleSelectSite = (siteId: string) => {
    setActiveSiteId(siteId);
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SITE_ID, siteId);
    } catch {}
    const chosen = sites.find((s) => s.id === siteId);
    if (chosen) {
      setSettings((prev) => ({
        ...prev,
        siteUrl: chosen.url,
        username: chosen.wordpress?.username || '',
        appPassword: chosen.wordpress?.applicationPassword || ''
      }));
    }
  };

  const handleSiteAdded = (newSite: ManagedSite) => {
    setSites((prev) => [...prev, newSite]);
    handleSelectSite(newSite.id);
  };

  const handleSiteUpdated = (updatedSite: ManagedSite) => {
    setSites((prev) => prev.map((s) => (s.id === updatedSite.id ? updatedSite : s)));
  };

  const handleSiteDeleted = async (siteId: string) => {
    try {
      await fetch(`/api/sites/${siteId}`, { method: 'DELETE' });
      setSites((prev) => prev.filter((s) => s.id !== siteId));
      if (activeSiteId === siteId) {
        handleSelectSite('site-madanicamp');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveSettings = (newSettings: SiteSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
    } catch {}
  };

  const handleSavePost = async (updatedPost: WPPost) => {
    const cleanPost = normalizePost(updatedPost);

    setPosts((prev) => {
      const exists = prev.findIndex((p) => p.id === cleanPost.id);
      let nextList: WPPost[];
      if (exists >= 0) {
        nextList = [...prev];
        nextList[exists] = cleanPost;
      } else {
        nextList = [cleanPost, ...prev];
      }

      // Persist local posts
      try {
        const localOnly = nextList.filter((p) => p.is_local || p.status !== 'publish');
        localStorage.setItem(STORAGE_KEY_LOCAL_POSTS, JSON.stringify(localOnly));
      } catch {}

      return nextList;
    });

    if (editingPost && editingPost.id === cleanPost.id) {
      setEditingPost(cleanPost);
    }

    // Sync to server memory
    try {
      await fetch('/api/wp/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post: cleanPost, siteId: activeSite.id })
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
    const rawPost: WPPost = {
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
      author_name: activeSite.name,
      is_local: true,
      local_updated_at: new Date().toISOString(),
      versions: partialPost.versions
    };

    const newPost = normalizePost(rawPost);

    handleSavePost(newPost);
    setEditingPost(newPost);
    setCurrentView('posts');
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
      author_name: activeSite.name,
      is_local: true
    };
    setEditingPost(blankPost);
    setCurrentView('posts');
  };

  // Launch AI generator from SEO Center or Planner
  const handleSelectTopicForGeneration = (
    topic: string,
    keyword: string,
    intent: string,
    oppId?: string
  ) => {
    setAiModalPrefill({ topic, keyword, intent, oppId });
    setIsAIModalOpen(true);
  };

  const handleAddTopicToPlanner = async (opp: KeywordOpportunity) => {
    try {
      await fetch('/api/planner/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSite.id,
          title: opp.topic,
          primaryKeyword: opp.keyword,
          searchIntent: opp.searchIntent,
          reason: opp.reason
        })
      });
      // Switch view to planner to show added item
      setCurrentView('planner');
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyImageToPost = (imageUrl: string) => {
    if (editingPost) {
      const updated = { ...editingPost, featured_media_url: imageUrl };
      handleSavePost(updated);
      setCurrentView('posts');
    } else {
      // Create new draft with this image
      const newPost: WPPost = {
        id: `draft-${Date.now()}`,
        date: new Date().toISOString(),
        slug: '',
        status: 'local_draft',
        title: { rendered: 'پیش‌نویس جدید با تصویر شاخص' },
        content: { rendered: '' },
        excerpt: { rendered: '' },
        featured_media_url: imageUrl,
        categories: [1],
        category_names: ['مقالات'],
        tags: [],
        tag_names: [],
        author_name: activeSite.name,
        is_local: true
      };
      setEditingPost(newPost);
      setCurrentView('posts');
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900">
      {/* Header with Site Switcher & View Tabs */}
      <Header
        siteStatus={siteStatus}
        isLoading={isLoading}
        onRefresh={() => fetchAllData(true)}
        onOpenAIModal={() => {
          setAiModalPrefill({});
          setIsAIModalOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExplanation={() => setIsExplanationOpen(true)}
        onCreateNewPost={handleCreateNewPost}
        activeSite={activeSite}
        onOpenSiteSelector={() => setIsSiteSelectorOpen(true)}
        currentView={currentView}
        activeJobCount={activeCount}
        onOpenJobs={() => setJobCenterOpen(true)}
        onChangeView={(view) => {
          setCurrentView(view);
          if (view !== 'posts') {
            setEditingPost(null);
          }
        }}
      />

      <JobCenter
        siteId={activeSiteId}
        open={jobCenterOpen}
        onClose={() => setJobCenterOpen(false)}
      />

      {/* Main Workspace based on View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'overview' && (
          <OpsOverview
            activeSite={activeSite}
            onOpenView={(view) => setCurrentView(view === 'research' ? 'production' : view)}
          />
        )}

        {currentView === 'posts' && (
          editingPost ? (
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
              onOpenAI={() => {
                setAiModalPrefill({});
                setIsAIModalOpen(true);
              }}
              onDeletePost={handleDeletePost}
            />
          )
        )}

        {currentView === 'production' && (
          <ContentStudio
            activeSite={activeSite}
            onOpenVisuals={() => setCurrentView('visuals')}
            initialJobId={pendingProductionJobId}
            onInitialJobConsumed={() => setPendingProductionJobId(null)}
          />
        )}

        {currentView === 'performance' && (
          <PerformanceDashboard
            activeSite={activeSite}
            onOpenUpdateJob={(jobId) => {
              setPendingProductionJobId(jobId);
              setCurrentView('production');
            }}
          />
        )}

        {currentView === 'seo' && (
          <SeoIntelligenceCenter
            activeSite={activeSite}
            onSelectTopicForGeneration={handleSelectTopicForGeneration}
            onAddTopicToPlanner={handleAddTopicToPlanner}
          />
        )}

        {currentView === 'planner' && (
          <ContentPlannerCalendar
            activeSite={activeSite}
            onSelectTopicForGeneration={handleSelectTopicForGeneration}
          />
        )}

        {currentView === 'visuals' && (
          <VisualAssetStudio
            activeSite={activeSite}
            onApplyImageToPost={handleApplyImageToPost}
          />
        )}
      </main>

      {/* Modals */}
      <SiteSelectorModal
        isOpen={isSiteSelectorOpen}
        onClose={() => setIsSiteSelectorOpen(false)}
        sites={sites}
        activeSiteId={activeSiteId}
        onSelectSite={handleSelectSite}
        onSiteAdded={handleSiteAdded}
        onSiteUpdated={handleSiteUpdated}
        onSiteDeleted={handleSiteDeleted}
      />

      <PostPreviewModal
        post={selectedPostForPreview}
        isOpen={Boolean(selectedPostForPreview)}
        onClose={() => setSelectedPostForPreview(null)}
        onEdit={(post) => {
          setSelectedPostForPreview(null);
          setEditingPost(post);
          setCurrentView('posts');
        }}
      />

      <AIPostGeneratorModal
        isOpen={isAIModalOpen}
        onClose={() => {
          setIsAIModalOpen(false);
          setAiModalPrefill({});
        }}
        onPostGenerated={handlePostGeneratedFromAI}
        activeSite={activeSite}
        initialTopic={aiModalPrefill.topic}
        initialKeyword={aiModalPrefill.keyword}
        initialIntent={aiModalPrefill.intent}
        oppId={aiModalPrefill.oppId}
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
