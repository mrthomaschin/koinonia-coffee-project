/**
 * Structured Notion page content, as produced by functions/src/services/notion_content.ts.
 * Keep these types in sync with the backend.
 */
export interface RichTextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  href?: string;
}

export interface ListItem {
  text: RichTextSpan[];
  children: ContentBlock[];
}

export type ContentBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: RichTextSpan[] }
  | { type: 'paragraph'; text: RichTextSpan[] }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'quote'; text: RichTextSpan[]; children: ContentBlock[] }
  | { type: 'callout'; icon?: string; text: RichTextSpan[]; children: ContentBlock[] }
  | { type: 'toggle'; summary: RichTextSpan[]; children: ContentBlock[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'image'; url: string; caption: RichTextSpan[] }
  | { type: 'columns'; columns: ContentBlock[][] }
  | { type: 'divider' };

export interface ContentSection {
  heading: RichTextSpan[] | null;
  blocks: ContentBlock[];
}

export const spansToText = (spans: RichTextSpan[]): string => spans.map(span => span.text).join('');

/** Splits content at each h2: blocks before the first h2 form the intro (heading: null). */
export const splitIntoSections = (blocks: ContentBlock[]): ContentSection[] => {
  const sections: ContentSection[] = [{ heading: null, blocks: [] }];
  blocks.forEach(block => {
    if (block.type === 'heading' && block.level === 2) {
      sections.push({ heading: block.text, blocks: [] });
    } else {
      sections[sections.length - 1].blocks.push(block);
    }
  });
  return sections.filter(section => section.heading || section.blocks.length > 0);
};
