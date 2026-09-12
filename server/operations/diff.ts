import type { ContentDiffReport, ContentDiffSection } from './types.js';

function normalizeLines(text: string): string[] {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractHeadings(markdown: string): string[] {
  return normalizeLines(markdown)
    .filter((line) => /^#{1,3}\s+/.test(line) || /^<h[1-3][\s>]/i.test(line))
    .map((line) => line.replace(/^#{1,3}\s+/, '').replace(/<\/?h[1-3][^>]*>/gi, '').trim());
}

function extractParagraphs(markdown: string): string[] {
  return normalizeLines(markdown)
    .filter((line) => !/^#{1,3}\s+/.test(line))
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter((line) => line.length > 20);
}

/** Simple deterministic before/after content diff — no heavyweight library. */
export function buildContentDiff(params: {
  beforeTitle?: string;
  afterTitle?: string;
  beforeContent?: string;
  afterContent?: string;
  beforeMeta?: string;
  afterMeta?: string;
}): ContentDiffReport {
  const sections: ContentDiffSection[] = [];
  const summary: string[] = [];

  const beforeTitle = params.beforeTitle || '';
  const afterTitle = params.afterTitle || '';
  const titleChanged = beforeTitle.trim() !== afterTitle.trim();
  sections.push({
    kind: 'title',
    label: 'Title',
    before: beforeTitle,
    after: afterTitle,
    change: !beforeTitle && afterTitle ? 'added' : beforeTitle && !afterTitle ? 'removed' : titleChanged ? 'changed' : 'unchanged'
  });
  if (titleChanged) summary.push('Title changed');

  if ((params.beforeMeta || '') !== (params.afterMeta || '')) {
    sections.push({
      kind: 'meta',
      label: 'Meta description',
      before: params.beforeMeta,
      after: params.afterMeta,
      change: 'changed'
    });
    summary.push('Meta description changed');
  }

  const beforeHeadings = extractHeadings(params.beforeContent || '');
  const afterHeadings = extractHeadings(params.afterContent || '');
  const headingSet = new Set([...beforeHeadings, ...afterHeadings]);
  for (const heading of headingSet) {
    const inBefore = beforeHeadings.includes(heading);
    const inAfter = afterHeadings.includes(heading);
    if (inBefore && inAfter) continue;
    sections.push({
      kind: 'heading',
      label: heading,
      before: inBefore ? heading : undefined,
      after: inAfter ? heading : undefined,
      change: inAfter && !inBefore ? 'added' : 'removed'
    });
  }
  const addedHeadings = afterHeadings.filter((h) => !beforeHeadings.includes(h)).length;
  const removedHeadings = beforeHeadings.filter((h) => !afterHeadings.includes(h)).length;
  if (addedHeadings) summary.push(`${addedHeadings} heading(s) added`);
  if (removedHeadings) summary.push(`${removedHeadings} heading(s) removed`);

  const beforeParas = new Set(extractParagraphs(params.beforeContent || ''));
  const afterParas = extractParagraphs(params.afterContent || '');
  let addedParas = 0;
  let removedParas = 0;
  for (const para of afterParas) {
    if (!beforeParas.has(para)) {
      addedParas += 1;
      if (sections.filter((s) => s.kind === 'paragraph').length < 8) {
        sections.push({
          kind: 'paragraph',
          label: 'Paragraph',
          after: para.slice(0, 240),
          change: 'added'
        });
      }
    }
  }
  for (const para of beforeParas) {
    if (!afterParas.includes(para)) {
      removedParas += 1;
      if (sections.filter((s) => s.kind === 'paragraph').length < 12) {
        sections.push({
          kind: 'paragraph',
          label: 'Paragraph',
          before: para.slice(0, 240),
          change: 'removed'
        });
      }
    }
  }
  if (addedParas) summary.push(`${addedParas} paragraph(s) added`);
  if (removedParas) summary.push(`${removedParas} paragraph(s) removed`);
  if (!summary.length) summary.push('No textual differences detected');

  return { titleChanged, sections, summary };
}
