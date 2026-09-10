import crypto from 'crypto';
import { generateJsonContent, GeminiCallError } from './aiClient.js';
import { db } from './db.js';
import { checkDuplication } from './duplicationGuard.js';
import { buildArticleBrief, validateArticleBrief, type ArticleBrief } from './intelligence/index.js';
import { getContentIndex } from './intelligence/store.js';

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

export interface GenerateArticleParams {
  siteId: string;
  topic: string;
  tone?: string;
  targetAudience?: string;
  keywords?: string[];
  searchIntent?: string;
  includeFaq?: boolean;
  opportunityId?: string;
  brief?: ArticleBrief;
  previousVersion?: {
    version: number;
    title: string;
    content: string;
    excerpt?: string;
  };
  regenerationInstructions?: string;
}

export async function generateArticleWithDifferenceEngine(params: GenerateArticleParams) {
  const {
    siteId,
    topic,
    tone = 'educational',
    targetAudience,
    keywords = [],
    searchIntent = 'commercial',
    includeFaq = true,
    previousVersion,
    regenerationInstructions
  } = params;

  const site = db.getSiteById(siteId);
  if (!site) {
    throw new GeminiCallError('Site not found', { stage: 'article_generation', errorCode: 'site_not_found', retryable: false });
  }

  const index = getContentIndex(siteId);
  const opportunity = params.opportunityId
    ? index.opportunities.find((o) => o.id === params.opportunityId)
    : index.opportunities.find((o) => o.title === topic);
  const brief =
    validateArticleBrief(params.brief) ||
    buildArticleBrief({
      siteId,
      opportunity,
      topic,
      audience: targetAudience || site.seo?.targetAudience,
      articles: index.articles
    });

  const dupCheck = checkDuplication({ siteId, title: brief.topic, keyword: brief.primaryKeyword, searchIntent: brief.searchIntent });

  const isRegeneration = Boolean(previousVersion && previousVersion.content);
  let changedDimensions: string[] = [];
  if (isRegeneration) {
    changedDimensions = ['زاویه دید', 'ساختار سرتیترها', 'مثال‌های میدانی', 'جدول مقایسه'];
  }

  const systemPrompt = `You are the staff writer for ${site.brand?.name || site.name} (${site.url}).
Write in ${site.language || 'fa'}.
Follow the article brief exactly.
Do not invent search volume, rankings, or competitor traffic.
Do not overlap forbidden existing articles.
Return JSON only.`;

  const userPrompt = `ARTICLE BRIEF
${JSON.stringify(brief, null, 2)}

SITE PROFILE
${JSON.stringify({
  niche: site.profile?.niche,
  audience: site.profile?.audience,
  products: site.profile?.products,
  brandVoice: site.profile?.brandVoice
})}

RELATED EXISTING ARTICLES
${index.articles.slice(0, 12).map((a) => `- ${a.title} [${a.fingerprint.searchIntent}]`).join('\n')}

Tone: ${tone}
Include FAQ: ${includeFaq}
Keywords: ${(keywords.length ? keywords : [brief.primaryKeyword, ...brief.secondaryKeywords]).join('، ')}

${isRegeneration ? `Regenerate version ${previousVersion?.version} with a new angle.\nPrevious title: ${previousVersion?.title}\nPrevious excerpt:\n${previousVersion?.content.slice(0, 1200)}\n${regenerationInstructions || ''}` : ''}

Return:
{
  "title": "",
  "slug": "",
  "metaDescription": "",
  "excerpt": "",
  "content": "markdown",
  "tags": [],
  "suggestedInternalLinks": [{"articleTitle":"","anchorText":"","reason":""}],
  "suggestedProducts": [{"name":"","category":"","reason":"","suggestedAnchor":""}],
  "faq": [{"question":"","answer":""}]
}`;

  const result = await generateJsonContent({
    stage: 'article_generation',
    systemInstruction: systemPrompt,
    prompt: userPrompt
  });
  const generatedArticle = result.data;
  if (!generatedArticle?.title || !generatedArticle?.content) {
    throw new GeminiCallError('Gemini returned an incomplete article payload.', {
      stage: 'article_generation',
      errorCode: 'invalid_article_json',
      retryable: true
    });
  }

  const newVersionNumber = previousVersion ? previousVersion.version + 1 : 1;
  const contentHash = computeHash(generatedArticle.content);
  const versionRecord = {
    version: newVersionNumber,
    createdAt: new Date().toISOString(),
    title: generatedArticle.title,
    content: generatedArticle.content,
    excerpt: generatedArticle.excerpt,
    metaDescription: generatedArticle.metaDescription,
    generationStrategy: isRegeneration ? 'regeneration_difference_engine' : 'article_brief',
    changedDimensions: isRegeneration ? changedDimensions : ['brief_grounded_generation'],
    contentHash
  };

  return {
    article: {
      title: { rendered: generatedArticle.title },
      slug: generatedArticle.slug,
      content: { rendered: generatedArticle.content },
      excerpt: { rendered: generatedArticle.excerpt },
      meta_description: generatedArticle.metaDescription,
      tag_names: generatedArticle.tags || [],
      faq: generatedArticle.faq || [],
      suggested_internal_links: generatedArticle.suggestedInternalLinks || brief.internalLinks,
      suggested_products: generatedArticle.suggestedProducts || brief.productsToMention.map((name) => ({ name })),
      version: newVersionNumber,
      versions: [versionRecord],
      site_id: siteId,
      duplicate_risk: dupCheck,
      article_brief: brief,
      source: 'gemini'
    },
    brief,
    versionRecord,
    isRegeneration,
    changedDimensions
  };
}
