import crypto from 'crypto';
import { db } from '../db.js';
import { generateJsonContent } from '../aiClient.js';
import { asObject, objectArray, requireString, schemaFailure, stringArray } from './schema.js';
import type { ArticleDraft, ContentBrief, DraftSection, EvidenceSourceType, ResearchPacket } from './types.js';

const CONTENT_SOURCE_HINTS: EvidenceSourceType[] = [
  'wordpress',
  'product_catalog',
  'user_input',
  'official_source',
  'external_source',
  'ai_inference',
  'unknown'
];

export function contentHash(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

/** Splits markdown into `##` sections so section-level editing can address them. */
export function parseMarkdownSections(markdown: string): DraftSection[] {
  const lines = (markdown || '').split('\n');
  const sections: DraftSection[] = [];
  let heading = '';
  let buffer: string[] = [];

  const flush = () => {
    if (!heading && buffer.join('').trim() === '') return;
    sections.push({ heading: heading || 'مقدمه', content: buffer.join('\n').trim() });
  };

  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line.trim());
    if (match) {
      flush();
      heading = match[1].trim();
      buffer = [];
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections.filter((section) => section.heading || section.content);
}

export function sectionsToMarkdown(title: string, sections: DraftSection[]): string {
  const body = sections
    .map((section) => (section.heading === 'مقدمه' ? section.content : `## ${section.heading}\n\n${section.content}`))
    .join('\n\n');
  return `# ${title}\n\n${body}`.trim();
}

export interface GenerateDraftParams {
  brief: ContentBrief;
  research: ResearchPacket;
  jobId: string;
  version?: number;
  regenerationNote?: string;
  previousContent?: string;
}

/**
 * Generates the draft strictly from the brief, the verified evidence and the
 * do-not-fabricate list. If Gemini fails, the caller receives the structured
 * GeminiCallError; no placeholder article is ever synthesised here.
 */
export async function generateArticleDraft(params: GenerateDraftParams): Promise<ArticleDraft> {
  const { brief, research } = params;
  const site = db.getSiteById(brief.siteId);
  if (!site) throw new Error('Site not found');

  const version = params.version || 1;
  const verified = research.evidence.filter((item) => item.verified);

  const prompt = `BRIEF
Working title: ${brief.workingTitle}
Primary keyword: ${brief.primaryKeyword}
Secondary keywords: ${brief.secondaryKeywords.join('، ') || '(none)'}
Search intent: ${brief.searchIntent}
Audience: ${brief.targetAudience || '(unspecified)'}
User problem: ${brief.userProblem}
Goal: ${brief.articleGoal}
Angle: ${brief.recommendedAngle}
Differentiation: ${brief.differentiationStrategy}
Article type: ${brief.recommendedArticleType}

REQUIRED OUTLINE (use these as ## headings, in this order):
${brief.outline
  .map(
    (section, idx) =>
      `${idx + 1}. ${section.heading} — ${section.purpose} (~${section.targetWordCount} words)${
        section.talkingPoints.length ? `\n   points: ${section.talkingPoints.join(' | ')}` : ''
      }`
  )
  .join('\n')}

QUESTIONS THE ARTICLE MUST ANSWER:
${brief.questionsToAnswer.map((question) => `- ${question}`).join('\n')}

VERIFIED FACTS YOU MAY STATE AS FACT:
${verified.map((item) => `- ${item.claim}`).join('\n') || '- (none)'}

PRODUCTS THIS SITE ACTUALLY SELLS (only mention these by name):
${brief.productsToMention.map((product) => `- ${product}`).join('\n') || '- (none)'}

INTERNAL LINKS TO PLACE (markdown links, ${brief.seoRequirements.minInternalLinks} minimum):
${brief.internalLinks
  .map((link) => `- [${link.anchorText}](/${link.targetSlug || ''}) — ${link.placement} (${link.relationshipType})`)
  .join('\n') || '- (none available)'}

YOU MUST NOT STATE ANY OF THESE AS FACT:
${brief.mustNotFabricate.map((risk) => `- ${risk}`).join('\n')}

RULES
- Write in ${site.language || 'fa'}, tone: ${site.content?.tone || 'practical'}.
- Minimum ${brief.seoRequirements.minWordCount} words, at least ${brief.seoRequirements.minH2Count} "##" headings.
- Meta description between ${brief.seoRequirements.metaDescriptionRange[0]} and ${brief.seoRequirements.metaDescriptionRange[1]} characters.
- If a number, price, weight, temperature or standard is not in the verified list, describe it qualitatively instead of inventing a value.
- List every factual statement you made in "claims" so it can be fact-checked.
${params.regenerationNote ? `- Regeneration instruction: ${params.regenerationNote}` : ''}
${params.previousContent ? `\nPREVIOUS VERSION (change the angle, do not paraphrase):\n${params.previousContent.slice(0, 1500)}` : ''}

Return JSON only:
{
  "title": "",
  "slug": "latin-kebab-case",
  "metaDescription": "",
  "excerpt": "",
  "content": "full markdown article using ## headings",
  "tags": [""],
  "faq": [{"question": "", "answer": ""}],
  "productsMentioned": [""],
  "claims": [{"claim": "", "sourceHint": "wordpress|product_catalog|user_input|official_source|external_source|ai_inference|unknown"}]
}`;

  const result = await generateJsonContent({
    stage: 'draft',
    systemInstruction: `You are the staff writer for ${site.brand?.name || site.name}. You follow the brief exactly, never fabricate figures or sources, and return JSON only.`,
    prompt
  });

  try {
    const data = asObject(result.data, 'draft');
    const title = requireString(data.title, 'title', { minLength: 8 });
    const content = requireString(data.content, 'content', { minLength: 400 });

    const claims = objectArray(data.claims, 'claims', { max: 40 })
      .map((row) => ({
        claim: String(row.claim || '').trim(),
        sourceHint: (CONTENT_SOURCE_HINTS.includes(String(row.sourceHint) as EvidenceSourceType)
          ? (String(row.sourceHint) as EvidenceSourceType)
          : 'ai_inference') as EvidenceSourceType
      }))
      .filter((row) => row.claim.length > 0);

    const faq = objectArray(data.faq, 'faq', { max: 10 })
      .map((row) => ({
        question: String(row.question || '').trim(),
        answer: String(row.answer || '').trim()
      }))
      .filter((row) => row.question && row.answer);

    return {
      id: `draft-${brief.siteId}-${params.jobId}-v${version}`,
      siteId: brief.siteId,
      jobId: params.jobId,
      briefId: brief.id,
      version,
      title,
      slug: slugify(String(data.slug || title)),
      metaDescription: String(data.metaDescription || '').trim(),
      excerpt: String(data.excerpt || '').trim(),
      content,
      sections: parseMarkdownSections(content),
      tags: stringArray(data.tags, { max: 10 }),
      faq,
      internalLinks: brief.internalLinks,
      productsMentioned: stringArray(data.productsMentioned, { max: 12 }).filter((name) =>
        // A product that this site does not sell is dropped rather than published.
        brief.productsToMention.length === 0
          ? true
          : brief.productsToMention.some((known) => known.includes(name) || name.includes(known))
      ),
      claims,
      contentHash: contentHash(content),
      generatedAt: new Date().toISOString(),
      modelUsed: result.modelUsed,
      source: 'gemini'
    };
  } catch (err) {
    throw schemaFailure('draft', err);
  }
}

export function slugify(input: string): string {
  const latin = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70)
    .replace(/^-|-$/g, '');
  if (latin.length >= 3) return latin;
  return input
    .trim()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 70)
    .replace(/^-|-$/g, '');
}
