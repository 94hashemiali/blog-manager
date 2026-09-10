import { generateJsonContent } from '../aiClient.js';
import { normalizeTitle } from '../intelligence/text.js';
import { asObject, requireString, schemaFailure } from './schema.js';
import { parseMarkdownSections, sectionsToMarkdown } from './draft.js';
import type { ArticleDraft, ContentBrief, ResearchPacket } from './types.js';

export const SECTION_EDIT_ACTIONS = [
  'improve_clarity',
  'make_more_practical',
  'make_more_technical',
  'shorten',
  'expand',
  'add_examples',
  'improve_seo',
  'fix_repetition',
  'rewrite_introduction',
  'rewrite_conclusion',
  'improve_faq',
  'improve_comparison'
] as const;

export type SectionEditAction = (typeof SECTION_EDIT_ACTIONS)[number];

const ACTION_INSTRUCTIONS: Record<SectionEditAction, string> = {
  improve_clarity: 'همان اطلاعات را روشن‌تر و کوتاه‌جمله‌تر بنویس؛ چیزی به اطلاعات اضافه نکن.',
  make_more_practical: 'به دستورهای عملی و قابل اجرا تبدیل کن؛ از جملات کلی پرهیز کن.',
  make_more_technical: 'دقت فنی را بالا ببر، اما فقط با فکت‌های تأییدشدهٔ فهرست‌شده.',
  shorten: 'حجم را حدود ۴۰٪ کم کن و هیچ نکتهٔ کلیدی را حذف نکن.',
  expand: 'با جزئیات عملی گسترش بده؛ هیچ عدد یا مشخصهٔ جدیدی نساز.',
  add_examples: 'مثال‌های میدانی مشخص اضافه کن که با فکت‌های تأییدشده در تناقض نباشند.',
  improve_seo: 'کلیدواژهٔ اصلی و فرعی را طبیعی در متن جای بده و سرتیتر را توصیفی‌تر کن.',
  fix_repetition: 'جملات و ایده‌های تکراری را حذف یا ادغام کن.',
  rewrite_introduction: 'مقدمه را بازنویسی کن تا مسئلهٔ مخاطب در دو جملهٔ اول روشن شود.',
  rewrite_conclusion: 'جمع‌بندی را بازنویسی کن تا به یک تصمیم و گام بعدی مشخص برسد.',
  improve_faq: 'پرسش‌ها را به سوالات واقعی مخاطب نزدیک کن و پاسخ‌ها را کوتاه و دقیق بنویس.',
  improve_comparison: 'مقایسه را بر اساس معیارهای روشن و یکسان بازسازی کن.'
};

export function findSectionIndex(draft: ArticleDraft, heading: string): number {
  const target = normalizeTitle(heading);
  return draft.sections.findIndex((section) => normalizeTitle(section.heading) === target);
}

/**
 * Rewrites a single section. Only that section, the brief essentials and the
 * verified evidence are sent to the model — never the whole app state — and
 * only that section is replaced in the draft.
 */
export async function editDraftSection(params: {
  draft: ArticleDraft;
  brief: ContentBrief;
  research?: ResearchPacket;
  sectionHeading: string;
  action: SectionEditAction;
  userInstruction?: string;
}): Promise<{ draft: ArticleDraft; previousContent: string; newContent: string }> {
  const index = findSectionIndex(params.draft, params.sectionHeading);
  if (index < 0) {
    throw new Error(`بخشی با عنوان «${params.sectionHeading}» در پیش‌نویس پیدا نشد.`);
  }

  const section = params.draft.sections[index];
  const briefSection = params.brief.outline.find(
    (row) => normalizeTitle(row.heading) === normalizeTitle(section.heading)
  );
  const verified = (params.research?.evidence || []).filter((item) => item.verified).slice(0, 12);

  const prompt = `ARTICLE TITLE: ${params.draft.title}
PRIMARY KEYWORD: ${params.brief.primaryKeyword}
SECONDARY KEYWORDS: ${params.brief.secondaryKeywords.join('، ') || '(none)'}
AUDIENCE: ${params.brief.targetAudience || '(unspecified)'}
SECTION HEADING: ${section.heading}
SECTION PURPOSE: ${briefSection?.purpose || params.brief.articleGoal}

VERIFIED FACTS YOU MAY USE:
${verified.map((item) => `- ${item.claim}`).join('\n') || '- (none)'}

YOU MUST NOT STATE ANY OF THESE AS FACT:
${params.brief.mustNotFabricate.map((risk) => `- ${risk}`).join('\n')}

TASK: ${ACTION_INSTRUCTIONS[params.action]}
${params.userInstruction ? `USER INSTRUCTION: ${params.userInstruction}` : ''}

CURRENT SECTION (markdown, without its heading):
${section.content}

Rewrite only this section. Keep the heading unchanged. Do not add new headings
above "###". Return JSON only:
{"heading": "${section.heading}", "content": "rewritten markdown"}`;

  const result = await generateJsonContent({
    stage: 'section_edit',
    systemInstruction:
      'You revise one section of an existing article. You never introduce statistics, prices, specifications or sources that were not given to you. Return JSON only.',
    prompt
  });

  let newContent: string;
  try {
    const data = asObject(result.data, 'section_edit');
    newContent = requireString(data.content, 'content', { minLength: 60 });
  } catch (err) {
    throw schemaFailure('section_edit', err);
  }

  const sections = [...params.draft.sections];
  sections[index] = { heading: section.heading, content: newContent };
  const content = sectionsToMarkdown(params.draft.title, sections);

  return {
    draft: {
      ...params.draft,
      content,
      sections: parseMarkdownSections(content),
      source: 'user_edited'
    },
    previousContent: section.content,
    newContent
  };
}
