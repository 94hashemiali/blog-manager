import type {
  CannibalizationAction,
  IndexedArticle,
  OverlapKind,
  SearchIntent
} from './types.js';
import { inferIntent, jaccard, normalizeTitle, tokenize, tokenOverlapCount } from './text.js';

export interface CannibalizationMatch {
  id: string | number;
  title: string;
  reason: string;
  overlapType: OverlapKind;
  similarity: number;
}

export interface CannibalizationResult {
  isDuplicate: boolean;
  cannibalizationRisk: 'none' | 'low' | 'moderate' | 'severe';
  similarityScore: number;
  matchedArticles: CannibalizationMatch[];
  verdictMessage: string;
  decision: CannibalizationAction;
  decisionReason: string;
}

function overlapKind(params: {
  exactTitle: boolean;
  titleSim: number;
  keywordOverlap: boolean;
  sameIntent: boolean;
  sameCluster: boolean;
  proposedIntent: SearchIntent;
  existingIntent: SearchIntent;
}): OverlapKind {
  if (params.exactTitle) return 'exact_duplicate';
  if (params.titleSim >= 80) return 'near_duplicate';
  if (params.keywordOverlap && params.sameIntent) return 'same_primary_keyword';
  if (params.keywordOverlap && params.titleSim >= 30) return 'semantic_duplicate';
  if (params.sameIntent && params.titleSim >= 45) return 'same_search_intent';
  if (params.titleSim >= 50 && !params.sameIntent) return 'same_topic_different_intent';
  if (params.sameCluster && params.titleSim >= 25) return 'cluster_sibling';
  if (params.titleSim >= 35) return 'semantic_duplicate';
  return 'supporting';
}

export function decideAction(kind: OverlapKind, proposedIntent: SearchIntent): CannibalizationAction {
  if (kind === 'exact_duplicate' || kind === 'near_duplicate') return 'update_existing';
  if (kind === 'same_primary_keyword' || kind === 'same_search_intent') return 'do_not_create';
  if (kind === 'same_topic_different_intent') {
    if (proposedIntent === 'informational') return 'create_tutorial';
    if (proposedIntent === 'commercial') return 'create_commercial_investigation';
    return 'create_different_intent';
  }
  if (kind === 'cluster_sibling') return 'create_supporting';
  if (kind === 'semantic_duplicate') return 'merge_with_existing';
  return 'create_new';
}

export function evaluateCannibalization(params: {
  siteId: string;
  title: string;
  keyword?: string;
  searchIntent?: SearchIntent | string;
  clusterId?: string;
  articles: IndexedArticle[];
}): CannibalizationResult {
  const proposedIntent = (params.searchIntent as SearchIntent) || inferIntent(params.title);
  const inputTitle = normalizeTitle(params.title);
  const inputTokens = tokenize(params.title);
  const keywordTokens = tokenize(params.keyword || '');
  const matches: CannibalizationMatch[] = [];
  let maxSim = 0;

  for (const article of params.articles) {
    if (article.siteId && article.siteId !== params.siteId) continue;
    const existingTitle = normalizeTitle(article.title);
    const existingTokens = tokenize(article.title);
    const titleSim = inputTitle === existingTitle ? 100 : jaccard(inputTokens, existingTokens);
    const keywordOverlap =
      Boolean(params.keyword) &&
      (normalizeTitle(article.fingerprint.primaryKeyword) === normalizeTitle(params.keyword || '') ||
        tokenOverlapCount(keywordTokens, existingTokens) >= 2 ||
        tokenOverlapCount(keywordTokens, tokenize(article.fingerprint.primaryKeyword)) >= 2);
    const sameIntent = article.fingerprint.searchIntent === proposedIntent;
    const sameCluster = Boolean(params.clusterId && article.fingerprint.contentClusterId === params.clusterId);
    const kind = overlapKind({
      exactTitle: inputTitle === existingTitle,
      titleSim,
      keywordOverlap,
      sameIntent,
      sameCluster,
      proposedIntent,
      existingIntent: article.fingerprint.searchIntent
    });

    if (titleSim > maxSim) maxSim = titleSim;
    if (titleSim >= 25 || keywordOverlap || kind === 'exact_duplicate') {
      matches.push({
        id: article.id,
        title: article.title,
        similarity: Math.round(titleSim),
        overlapType: kind,
        reason:
          kind === 'exact_duplicate'
            ? 'عنوان نرمال‌شده یکسان است.'
            : kind === 'same_topic_different_intent'
              ? `موضوع نزدیک است اما نیت جستجو متفاوت است (${article.fingerprint.searchIntent} در برابر ${proposedIntent}).`
              : kind === 'cluster_sibling'
                ? 'مقالهٔ مکمل در همان خوشه محتوایی است.'
                : `شباهت عنوان ${Math.round(titleSim)}٪ و هم‌پوشانی کلیدواژه/نیت.`
      });
    }
  }

  matches.sort((a, b) => b.similarity - a.similarity);
  const top = matches[0];
  const kind = top?.overlapType || 'supporting';
  const decision = top ? decideAction(kind, proposedIntent) : 'create_new';
  const rounded = Math.round(maxSim);
  let risk: CannibalizationResult['cannibalizationRisk'] = 'none';
  if (kind === 'exact_duplicate' || rounded >= 80) risk = 'severe';
  else if (kind === 'same_primary_keyword' || kind === 'same_search_intent' || rounded >= 50) risk = 'moderate';
  else if (rounded >= 25) risk = 'low';

  const verdict =
    decision === 'create_new'
      ? 'موضوع متمایز است و می‌توان مقالهٔ جدید ساخت.'
      : decision === 'create_supporting' || decision === 'create_tutorial' || decision === 'create_different_intent'
        ? 'موضوع مرتبط است اما نیت یا قالب متفاوت است؛ مقالهٔ مکمل مجاز است.'
        : 'خطر هم‌نوع‌خواری؛ بهتر است مقالهٔ موجود به‌روزرسانی یا ادغام شود.';

  return {
    isDuplicate: risk === 'severe' || decision === 'do_not_create' || decision === 'update_existing',
    cannibalizationRisk: risk,
    similarityScore: rounded,
    matchedArticles: matches.slice(0, 8),
    verdictMessage: verdict,
    decision,
    decisionReason: top ? `${top.reason} توصیه: ${decision}` : 'مقالهٔ مشابهی در ایندکس این سایت پیدا نشد.'
  };
}
