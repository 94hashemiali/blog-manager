import crypto from 'crypto';
import { db } from '../db.js';
import { generateJsonContent } from '../aiClient.js';
import { getContentIndex } from '../intelligence/store.js';
import { listCompetitors } from '../intelligence/competitors.js';
import { inferIntent, inferPrimaryKeyword, jaccard, tokenize, tokenOverlapCount } from '../intelligence/text.js';
import type { IndexedArticle, IndexedProduct } from '../intelligence/types.js';
import { addEvidence, mergeEvidence } from './evidence.js';
import { asObject, oneOf, schemaFailure, stringArray } from './schema.js';
import type {
  ConfidenceLevel,
  EvidenceItem,
  ResearchPacket,
  ResearchSource,
  SearchIntent
} from './types.js';

const SEARCH_INTENTS: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

function packetId(siteId: string, topic: string): string {
  return `rp-${crypto.createHash('sha1').update(`${siteId}::${topic}`).digest('hex').slice(0, 12)}`;
}

function relatedArticles(articles: IndexedArticle[], topic: string, limit: number): IndexedArticle[] {
  const tokens = tokenize(topic);
  return articles
    .map((article) => ({ article, score: jaccard(tokens, tokenize(`${article.title} ${article.normalized.headings.join(' ')}`)) }))
    .filter((row) => row.score > 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.article);
}

function relatedProducts(products: IndexedProduct[], topic: string, limit: number): IndexedProduct[] {
  const tokens = tokenize(topic);
  return products
    .map((product) => ({
      product,
      overlap: tokenOverlapCount(tokens, tokenize(`${product.name} ${product.categories.join(' ')}`))
    }))
    .filter((row) => row.overlap >= 1)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((row) => row.product);
}

/**
 * Turns what the app can actually observe (WordPress index, WooCommerce
 * catalog, user-provided facts) into evidence. Nothing here is generated.
 */
export function collectObservedEvidence(params: {
  siteId: string;
  articles: IndexedArticle[];
  products: IndexedProduct[];
  userProvidedFacts: string[];
  wordpressUrl?: string;
}): { evidence: EvidenceItem[]; sources: ResearchSource[] } {
  const evidence: EvidenceItem[] = [];
  const sources: ResearchSource[] = [];

  if (params.articles.length > 0) {
    sources.push({
      id: 'src-wordpress-index',
      label: 'ایندکس محتوای وردپرس این سایت',
      url: params.wordpressUrl,
      sourceType: 'wordpress',
      reliability: 'high',
      retrievedAt: new Date().toISOString()
    });
  }

  for (const article of params.articles) {
    evidence.push(
      addEvidence({
        siteId: params.siteId,
        claim: `این سایت مقاله‌ای با عنوان «${article.title}» دارد که ${article.normalized.headings.slice(0, 3).join('، ') || 'موضوع مرتبط'} را پوشش می‌دهد.`,
        source: article.url || `wp:${article.id}`,
        sourceType: 'wordpress',
        confidence: 'high'
      })
    );
  }

  if (params.products.length > 0) {
    sources.push({
      id: 'src-product-catalog',
      label: 'کاتالوگ محصولات ووکامرس',
      url: params.wordpressUrl,
      sourceType: 'product_catalog',
      reliability: 'high',
      retrievedAt: new Date().toISOString()
    });
  }

  for (const product of params.products) {
    const attributes = product.attributes.filter(Boolean).slice(0, 6);
    evidence.push(
      addEvidence({
        siteId: params.siteId,
        claim: `محصول «${product.name}» در دسته‌بندی ${product.categories.join('، ') || 'نامشخص'} در فروشگاه این سایت موجود است.`,
        source: product.url || `product:${product.id}`,
        sourceType: 'product_catalog',
        confidence: 'high',
        notes: attributes.length ? `ویژگی‌های ثبت‌شده: ${attributes.join('، ')}` : undefined
      })
    );
  }

  if (params.userProvidedFacts.length > 0) {
    sources.push({
      id: 'src-user-input',
      label: 'اطلاعات وارد شده توسط کاربر',
      sourceType: 'user_input',
      reliability: 'medium',
      retrievedAt: new Date().toISOString()
    });
  }

  for (const fact of params.userProvidedFacts) {
    evidence.push(
      addEvidence({
        siteId: params.siteId,
        claim: fact,
        source: 'user_input',
        sourceType: 'user_input',
        confidence: 'medium'
      })
    );
  }

  return { evidence, sources };
}

function researchConfidence(evidence: EvidenceItem[], articles: number, products: number): ConfidenceLevel {
  const verified = evidence.filter((item) => item.verified).length;
  if (verified >= 8 && (articles >= 3 || products >= 5)) return 'high';
  if (verified >= 3) return 'medium';
  return 'low';
}

export interface GenerateResearchParams {
  siteId: string;
  topic: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  searchIntent?: SearchIntent;
  targetAudience?: string;
  userProvidedFacts?: string[];
}

/**
 * Builds a ResearchPacket. Observed facts come from the local index; Gemini is
 * only asked for the reasoning parts (objective, questions, claims to verify)
 * and everything it returns is filed as ai_inference.
 */
export async function generateResearchPacket(params: GenerateResearchParams): Promise<ResearchPacket> {
  const site = db.getSiteById(params.siteId);
  if (!site) throw new Error('Site not found');

  const index = getContentIndex(params.siteId);
  const topic = params.topic.trim();
  const primaryKeyword = params.primaryKeyword?.trim() || inferPrimaryKeyword(topic);
  const searchIntent = params.searchIntent || inferIntent(topic);
  const targetAudience = params.targetAudience || site.seo?.targetAudience || site.profile?.audience?.[0] || '';

  const articles = relatedArticles(index.articles, topic, 8);
  const products = relatedProducts(index.products, topic, 10);
  const userProvidedFacts = (params.userProvidedFacts || []).map((fact) => fact.trim()).filter(Boolean);

  const observed = collectObservedEvidence({
    siteId: params.siteId,
    articles,
    products,
    userProvidedFacts,
    wordpressUrl: index.wordpressUrl || site.wordpress?.baseUrl || site.url
  });

  // Only competitors that were actually scanned and verified contribute
  // observations; unverified rows would be fabricated market data.
  const competitorObservations = listCompetitors(params.siteId)
    .filter((competitor) => competitor.verified && competitor.pagesAnalyzed > 0)
    .flatMap((competitor) =>
      competitor.topicCoverage.slice(0, 3).map((coverage) => `${competitor.domain}: ${coverage}`)
    );

  const existingSiteKnowledge = articles.flatMap((article) => article.normalized.headings.slice(0, 4));

  const prompt = `TOPIC: ${topic}
PRIMARY KEYWORD: ${primaryKeyword}
SEARCH INTENT: ${searchIntent}
AUDIENCE: ${targetAudience || 'unspecified'}
SITE NICHE: ${site.profile?.niche || site.description || ''}

WHAT THIS SITE ALREADY PUBLISHED (titles):
${articles.map((article) => `- ${article.title}`).join('\n') || '- (none indexed)'}

PRODUCTS THIS SITE ACTUALLY SELLS (names only):
${products.map((product) => `- ${product.name}`).join('\n') || '- (none indexed)'}

USER-PROVIDED FACTS:
${userProvidedFacts.map((fact) => `- ${fact}`).join('\n') || '- (none)'}

You are planning research for one article. You have no access to Google, no
analytics, and no competitor databases. Do not state search volume, rankings,
traffic, prices, weights, temperatures, certifications or dates as facts.
List anything that would need a real source under "unknownFacts".

Return JSON only:
{
  "articleObjective": "one sentence on what the reader should be able to do after reading",
  "keyQuestions": ["question the article must answer", "..."],
  "importantClaims": ["factual statement the article will likely need to make", "..."],
  "unknownFacts": ["fact that cannot be verified from the data above", "..."],
  "secondaryKeywords": ["related query", "..."],
  "searchIntent": "informational|commercial|transactional|navigational"
}`;

  let objective = '';
  let keyQuestions: string[] = [];
  let importantClaims: string[] = [];
  let unknownFacts: string[] = [];
  let secondaryKeywords = params.secondaryKeywords || [];
  let resolvedIntent = searchIntent;
  let modelUsed: string | undefined;

  const result = await generateJsonContent({
    stage: 'research',
    systemInstruction:
      'You plan article research for a WordPress publisher. You never invent statistics, sources, URLs, prices or specifications. Return JSON only.',
    prompt
  });

  try {
    const data = asObject(result.data, 'research');
    objective = String(data.articleObjective || '').trim();
    keyQuestions = stringArray(data.keyQuestions, { max: 12, field: 'keyQuestions' });
    importantClaims = stringArray(data.importantClaims, { max: 15, field: 'importantClaims' });
    unknownFacts = stringArray(data.unknownFacts, { max: 15, field: 'unknownFacts' });
    const aiSecondary = stringArray(data.secondaryKeywords, { max: 10, field: 'secondaryKeywords' });
    secondaryKeywords = [...new Set([...secondaryKeywords, ...aiSecondary])].slice(0, 10);
    resolvedIntent = oneOf(data.searchIntent, SEARCH_INTENTS, searchIntent);
    modelUsed = result.modelUsed;
  } catch (err) {
    throw schemaFailure('research', err);
  }

  if (!objective || keyQuestions.length === 0) {
    throw schemaFailure('research', new Error('Research packet is missing an objective or key questions.'));
  }

  // Everything the model asserted is inference until a real source backs it.
  const inferredEvidence = importantClaims.map((claim) =>
    addEvidence({
      siteId: params.siteId,
      claim,
      source: `gemini:${modelUsed || 'unknown-model'}`,
      sourceType: 'ai_inference',
      notes: 'ادعای مدل زبانی؛ تا تأیید منبع واقعی، تأییدشده تلقی نمی‌شود.'
    })
  );

  const evidence = mergeEvidence(observed.evidence, inferredEvidence);

  return {
    id: packetId(params.siteId, topic),
    siteId: params.siteId,
    topic,
    primaryKeyword,
    secondaryKeywords,
    searchIntent: resolvedIntent,
    targetAudience,
    articleObjective: objective,
    keyQuestions,
    importantClaims,
    productInformation: products.map((product) => ({
      name: product.name,
      category: product.categories[0],
      knownAttributes: product.attributes.filter(Boolean).slice(0, 8),
      sourceType: 'product_catalog' as const
    })),
    existingSiteKnowledge: [...new Set(existingSiteKnowledge)].slice(0, 20),
    internalContentReferences: articles.map((article) => ({
      articleId: article.id,
      title: article.title,
      slug: article.slug,
      relevance: article.fingerprint.contentClusterId
        ? `هم‌خوشه با ${article.fingerprint.contentClusterId}`
        : 'موضوع مرتبط بر اساس هم‌پوشانی واژگانی'
    })),
    competitorObservations,
    sources: observed.sources,
    evidence,
    unknownFacts,
    researchConfidence: researchConfidence(evidence, articles.length, products.length),
    generatedAt: new Date().toISOString(),
    modelUsed
  };
}
