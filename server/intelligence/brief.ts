import type { ArticleBrief, IndexedArticle, TopicOpportunityRecord } from './types.js';
import { evaluateCannibalization } from './duplication.js';
import { inferArticleKind } from './text.js';
import { linksForTopic } from './linking.js';

export function validateArticleBrief(input: unknown): ArticleBrief | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.topic !== 'string' || !raw.topic.trim()) return null;
  if (typeof raw.primaryKeyword !== 'string') return null;
  return {
    topic: raw.topic.trim(),
    primaryKeyword: String(raw.primaryKeyword),
    secondaryKeywords: Array.isArray(raw.secondaryKeywords) ? raw.secondaryKeywords.map(String) : [],
    searchIntent: (raw.searchIntent as ArticleBrief['searchIntent']) || 'informational',
    audience: String(raw.audience || ''),
    articleType: String(raw.articleType || 'informational'),
    uniqueAngle: String(raw.uniqueAngle || ''),
    contentCluster: String(raw.contentCluster || ''),
    businessGoal: String(raw.businessGoal || ''),
    productsToMention: Array.isArray(raw.productsToMention) ? raw.productsToMention.map(String) : [],
    internalLinks: Array.isArray(raw.internalLinks)
      ? raw.internalLinks.map((item: any) => ({
          articleTitle: String(item.articleTitle || ''),
          slug: item.slug ? String(item.slug) : undefined,
          anchorText: String(item.anchorText || ''),
          reason: String(item.reason || '')
        }))
      : [],
    competitorDifferentiation: String(raw.competitorDifferentiation || ''),
    requiredSections: Array.isArray(raw.requiredSections) ? raw.requiredSections.map(String) : [],
    forbiddenOverlap: Array.isArray(raw.forbiddenOverlap) ? raw.forbiddenOverlap.map(String) : [],
    evidenceLevel: (raw.evidenceLevel as ArticleBrief['evidenceLevel']) || 'calculated',
    siteId: String(raw.siteId || ''),
    opportunityId: raw.opportunityId ? String(raw.opportunityId) : undefined,
    visualIntent: raw.visualIntent && typeof raw.visualIntent === 'object'
      ? {
          visualPurpose: String((raw.visualIntent as any).visualPurpose || ''),
          mainSubjectHint: String((raw.visualIntent as any).mainSubjectHint || ''),
          thingsToAvoid: Array.isArray((raw.visualIntent as any).thingsToAvoid)
            ? (raw.visualIntent as any).thingsToAvoid.map(String)
            : []
        }
      : undefined
  };
}

export function buildArticleBrief(params: {
  siteId: string;
  opportunity?: TopicOpportunityRecord;
  topic?: string;
  audience?: string;
  articles: IndexedArticle[];
  competitorAngles?: string[];
}): ArticleBrief {
  const topic = params.opportunity?.title || params.topic || '';
  const keyword = params.opportunity?.primaryKeyword || topic;
  const intent = params.opportunity?.searchIntent || 'informational';
  const cannibalization = evaluateCannibalization({
    siteId: params.siteId,
    title: topic,
    keyword,
    searchIntent: intent,
    clusterId: params.opportunity?.clusterId,
    articles: params.articles
  });
  const links = linksForTopic(params.articles, topic, params.opportunity?.clusterId);
  const uniqueAngle =
    params.opportunity?.contentType === 'comparison'
      ? 'A controlled comparison with decision criteria, not a “best of 2026” rewrite.'
      : cannibalization.matchedArticles[0]
        ? `Different intent/angle from “${cannibalization.matchedArticles[0].title}”: ${cannibalization.decision}.`
        : 'Cover a specific job-to-be-done that current articles do not.';

  const requiredSections = [
    'مقدمه و مسئله مخاطب',
    'معیارهای تصمیم‌گیری',
    params.opportunity?.contentType === 'tutorial' ? 'مراحل عملی' : 'بررسی گزینه‌ها',
    'اشتباهات رایج',
    'جمع‌بندی و گام بعدی'
  ];

  return {
    topic,
    primaryKeyword: keyword,
    secondaryKeywords: params.opportunity?.secondaryKeywords || [],
    searchIntent: intent,
    audience: params.audience || '',
    articleType: inferArticleKind(topic),
    uniqueAngle,
    contentCluster: params.opportunity?.clusterName || '',
    businessGoal: params.opportunity?.whyThisArticle || 'Strengthen topical coverage without cannibalizing existing URLs.',
    productsToMention: params.opportunity?.productsToMention || [],
    internalLinks: links.map((l) => ({
      articleTitle: l.targetTitle,
      anchorText: l.anchorText,
      reason: l.reason
    })),
    competitorDifferentiation:
      params.competitorAngles?.[0] ||
      'Do not clone a generic “best hiking boots” list; specify terrain, season, fit, or local conditions.',
    requiredSections,
    forbiddenOverlap: cannibalization.matchedArticles.map((m) => m.title),
    evidenceLevel: 'calculated',
    siteId: params.siteId,
    opportunityId: params.opportunity?.id,
    visualIntent: {
      visualPurpose: uniqueAngle,
      mainSubjectHint: (params.opportunity?.productsToMention || [])[0] || keyword,
      thingsToAvoid: [
        'generic mountain sunset postcard',
        ...cannibalization.matchedArticles.slice(0, 3).map((m) => `visually cloning “${m.title}”`)
      ]
    }
  };
}
