import crypto from 'crypto';
import { generateJsonContent } from '../aiClient.js';
import { inferIntent } from '../intelligence/text.js';
import { asObject, schemaFailure, stringArray } from '../content/schema.js';
import type { SearchIntent } from '../content/types.js';
import type { FreshnessRequirement, ResearchPlan, ResearchSourceKind } from './types.js';

const SEARCH_INTENTS: SearchIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

function planId(siteId: string, topic: string): string {
  return `plan-${crypto.createHash('sha1').update(`${siteId}::${topic}`).digest('hex').slice(0, 12)}`;
}

function detectHighRiskTopics(topic: string): string[] {
  const risks: Array<[RegExp, string]> = [
    [/ایمنی|safety|خطر|مرگ|خفگی/i, 'safety'],
    [/پزشکی|medical|درمان|زخم/i, 'medical'],
    [/بقا|survival|هیپوترمی/i, 'survival'],
    [/دما|temperature|کامفورت|لیمت/i, 'temperature_rating'],
    [/وزن|weight|kg|کیلو|گرم/i, 'weight_spec'],
    [/بار|load|ظرفیت|capacity/i, 'load_limit'],
    [/مواد|الیاف|گورتکس|gore-?tex|پارچه/i, 'material_spec'],
    [/سازگار|compatibility|نصب/i, 'compatibility']
  ];
  return risks.filter(([re]) => re.test(topic)).map(([, label]) => label);
}

function freshnessForTopic(topic: string, highRisk: string[]): FreshnessRequirement {
  if (/قیمت|price|موجودی|stock/i.test(topic)) return 'high';
  if (highRisk.includes('temperature_rating') || highRisk.includes('weight_spec')) return 'medium';
  if (/تاریخ|تاریخی|history/i.test(topic)) return 'low';
  return 'medium';
}

function preferredTypes(topic: string): ResearchSourceKind[] {
  if (/خرید|مقایسه|محصول|چادر|کیسه|کوله|پوتین/i.test(topic)) {
    return ['PRODUCT_MANUFACTURER', 'PRODUCT_CATALOG', 'OFFICIAL_SOURCE', 'REPUTABLE_PUBLICATION', 'WORDPRESS'];
  }
  return ['OFFICIAL_SOURCE', 'REPUTABLE_PUBLICATION', 'WORDPRESS', 'ACADEMIC'];
}

/**
 * Builds a ResearchPlan. Questions can be refined by Gemini; required facts and
 * freshness come from deterministic topic heuristics when AI is unavailable.
 */
export async function buildResearchPlan(params: {
  siteId: string;
  topic: string;
  primaryKeyword?: string;
  searchIntent?: SearchIntent;
  enrichWithAi?: boolean;
}): Promise<ResearchPlan> {
  const topic = params.topic.trim();
  const highRiskTopics = detectHighRiskTopics(topic);
  const searchIntent = params.searchIntent || inferIntent(topic);
  const freshnessRequirement = freshnessForTopic(topic, highRiskTopics);
  const preferredSourceTypes = preferredTypes(topic);

  let primaryQuestion = `${topic} چه پاسخ عملی و قابل‌اتکایی دارد؟`;
  let supportingQuestions = [
    `چه حقایق محصولی برای «${params.primaryKeyword || topic}» باید تأیید شود؟`,
    'کدام مشخصات فنی به منبع سازنده نیاز دارند؟',
    'چه نکاتی را نباید بدون مدرک در مقاله آورد؟'
  ];
  let requiredFacts = [`تعریف دقیق موضوع «${topic}» از منابع قابل‌اتکا`];
  let requiredProductFacts = highRiskTopics.includes('weight_spec')
    ? ['وزن واقعی محصول در صورت ذکر نام']
    : [];
  let requiredTechnicalFacts = highRiskTopics
    .filter((item) => item !== 'safety' && item !== 'medical')
    .map((item) => `مقدار تأییدشده برای ${item}`);
  let modelUsed: string | undefined;

  if (params.enrichWithAi !== false) {
    try {
      const result = await generateJsonContent({
        stage: 'research_plan',
        systemInstruction:
          'You write research plans only. You never invent URLs, statistics, prices or specs. Return JSON only.',
        prompt: `TOPIC: ${topic}
KEYWORD: ${params.primaryKeyword || topic}
INTENT: ${searchIntent}
HIGH_RISK: ${highRiskTopics.join(', ') || 'none'}

Return JSON:
{
  "primaryQuestion": "",
  "supportingQuestions": ["", ""],
  "requiredFacts": ["", ""],
  "requiredProductFacts": ["", ""],
  "requiredTechnicalFacts": ["", ""]
}`
      });
      const data = asObject(result.data, 'research_plan');
      primaryQuestion = String(data.primaryQuestion || primaryQuestion).trim() || primaryQuestion;
      supportingQuestions = stringArray(data.supportingQuestions, { max: 10, field: 'supportingQuestions' });
      requiredFacts = stringArray(data.requiredFacts, { max: 12, field: 'requiredFacts' });
      requiredProductFacts = stringArray(data.requiredProductFacts, { max: 10, field: 'requiredProductFacts' });
      requiredTechnicalFacts = stringArray(data.requiredTechnicalFacts, { max: 10, field: 'requiredTechnicalFacts' });
      modelUsed = result.modelUsed;
      if (!primaryQuestion || supportingQuestions.length === 0) {
        throw schemaFailure('research_plan', new Error('plan incomplete'));
      }
    } catch {
      // Deterministic fallback already set — AI enrichment is optional.
    }
  }

  return {
    id: planId(params.siteId, topic),
    siteId: params.siteId,
    topic,
    primaryQuestion,
    supportingQuestions,
    searchIntent: SEARCH_INTENTS.includes(searchIntent) ? searchIntent : 'informational',
    requiredFacts,
    requiredProductFacts,
    requiredTechnicalFacts,
    preferredSourceTypes,
    sourceExclusions: ['ai_hallucination', 'unverified_forum_rumor'],
    freshnessRequirement,
    highRiskTopics,
    generatedAt: new Date().toISOString(),
    modelUsed
  };
}
