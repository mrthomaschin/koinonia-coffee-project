/**
 * Converts a Notion page's blocks into a small, typed content tree the website can render
 * (see src/components/notion on the frontend, which mirrors these types).
 *
 * - Only content under the "Website Description" h1 is published; pages without it publish nothing.
 *   Inside that section, h2 / h3 / h4 render as headings (h2 also starts a new section).
 * - Rich text keeps bold / italic / underline / strikethrough / code / links.
 * - Images are copied to Cloud Storage at web size (see image_variants.ts). This also matters for
 *   images uploaded to Notion, whose file URLs expire after about an hour.
 */
import { getNotionClient } from "../integrations/notion/notion_client";
import { getImageVariants } from "./image_variants";
import { createLogger } from "../logger";

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
    | { type: "heading"; level: 2 | 3 | 4; text: RichTextSpan[] }
    | { type: "paragraph"; text: RichTextSpan[] }
    | { type: "list"; ordered: boolean; items: ListItem[] }
    | { type: "quote"; text: RichTextSpan[]; children: ContentBlock[] }
    | { type: "callout"; icon?: string; text: RichTextSpan[]; children: ContentBlock[] }
    | { type: "toggle"; summary: RichTextSpan[]; children: ContentBlock[] }
    | { type: "code"; language: string; code: string }
    | { type: "image"; url: string; caption: RichTextSpan[] }
    | { type: "columns"; columns: ContentBlock[][] }
    | { type: "divider" };

const logger = createLogger("NotionContent");

const WEBSITE_SECTION_TITLE = /^website description$/i;
const MAX_DEPTH = 5;

// The Notion SDK block union is large; the converter only reads a few well-known fields.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionBlock = any;

const notion = () => getNotionClient("2022-06-28");

/** Lists every direct child block of a page or block, following pagination. */
export const listChildBlocks = async (blockId: string): Promise<NotionBlock[]> => {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
        const response = await notion().blocks.children.list({ block_id: blockId, start_cursor: cursor });
        blocks.push(...response.results);
        cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);
    return blocks;
};

const plainText = (richText: NotionBlock[] = []): string => richText.map((t) => t.plain_text).join("");

const toSpans = (richText: NotionBlock[] = []): RichTextSpan[] =>
    richText
        .filter((t) => t.plain_text)
        .map((t) => {
            const a = t.annotations || {};
            const span: RichTextSpan = { text: t.plain_text };
            if (a.bold) span.bold = true;
            if (a.italic) span.italic = true;
            if (a.underline) span.underline = true;
            if (a.strikethrough) span.strikethrough = true;
            if (a.code) span.code = true;
            if (t.href) span.href = t.href;
            return span;
        });

/** Picks the blocks to publish: only the "Website Description" h1 section. */
export const selectWebsiteBlocks = async (blocks: NotionBlock[]): Promise<NotionBlock[]> => {
    const isH1 = (block: NotionBlock) => block.type === "heading_1";
    const start = blocks.findIndex((block) => isH1(block) && WEBSITE_SECTION_TITLE.test(plainText(block.heading_1.rich_text).trim()));

    if (start === -1) return [];

    const heading = blocks[start];
    // A toggleable h1 keeps its section content as children.
    if (heading.heading_1.is_toggleable && heading.has_children) return listChildBlocks(heading.id);

    const rest = blocks.slice(start + 1);
    const end = rest.findIndex(isH1);
    return end === -1 ? rest : rest.slice(0, end);
};

const childrenOf = async (block: NotionBlock, depth: number): Promise<ContentBlock[]> =>
    block.has_children && depth < MAX_DEPTH ? convertBlocks(await listChildBlocks(block.id), depth + 1) : [];

const convertBlock = async (block: NotionBlock, depth: number): Promise<ContentBlock | null> => {
    const value = block[block.type] || {};
    switch (block.type) {
    case "paragraph": {
        const text = toSpans(value.rich_text);
        return text.length ? { type: "paragraph", text } : null;
    }
    // h2 is the highest heading used inside the published section; h1 marks private/public sections.
    case "heading_1":
    case "heading_2":
        return { type: "heading", level: 2, text: toSpans(value.rich_text) };
    case "heading_3":
        return { type: "heading", level: 3, text: toSpans(value.rich_text) };
    case "heading_4":
        return { type: "heading", level: 4, text: toSpans(value.rich_text) };
    case "quote":
        return { type: "quote", text: toSpans(value.rich_text), children: await childrenOf(block, depth) };
    case "callout":
        return {
            type: "callout",
            icon: value.icon?.type === "emoji" ? value.icon.emoji : undefined,
            text: toSpans(value.rich_text),
            children: await childrenOf(block, depth),
        };
    case "toggle":
        return { type: "toggle", summary: toSpans(value.rich_text), children: await childrenOf(block, depth) };
    case "code":
        return { type: "code", language: value.language || "", code: plainText(value.rich_text) };
    case "divider":
        return { type: "divider" };
    case "image": {
        // Notion file URLs expire, so uploaded images are keyed by block + edit time; both kinds get a web-sized copy.
        const source = value.type === "file" ? value.file?.url : value.external?.url;
        if (!source) return null;
        const cacheKey = value.type === "file" ? `notion:${block.id}:${block.last_edited_time}` : source;
        const { large } = await getImageVariants(source, cacheKey);
        // An uploaded image whose resize failed would fall back to an expiring URL, so skip it instead.
        if (value.type === "file" && large === source) return null;
        return { type: "image", url: large, caption: toSpans(value.caption) };
    }
    case "column_list": {
        const columns = await listChildBlocks(block.id);
        const converted = await Promise.all(columns.map((column) => childrenOf(column, depth)));
        return { type: "columns", columns: converted.filter((column) => column.length > 0) };
    }
    default:
        // Unknown block types still show their text instead of disappearing.
        return value.rich_text?.length ? { type: "paragraph", text: toSpans(value.rich_text) } : null;
    }
};

/** Converts sibling blocks, grouping consecutive list items into one list. */
export const convertBlocks = async (blocks: NotionBlock[], depth = 0): Promise<ContentBlock[]> => {
    const result: ContentBlock[] = [];
    for (const block of blocks) {
        if (block.type === "bulleted_list_item" || block.type === "numbered_list_item" || block.type === "to_do") {
            const ordered = block.type === "numbered_list_item";
            const item: ListItem = { text: toSpans(block[block.type].rich_text), children: await childrenOf(block, depth) };
            const previous = result[result.length - 1];
            if (previous?.type === "list" && previous.ordered === ordered) previous.items.push(item);
            else result.push({ type: "list", ordered, items: [item] });
            continue;
        }
        const converted = await convertBlock(block, depth);
        if (converted) result.push(converted);
    }
    return result;
};

/** Fetches a page and returns its published "Website Description" content as typed blocks. */
export const fetchWebsiteContent = async (pageId: string, topLevelBlocks?: NotionBlock[]): Promise<ContentBlock[]> => {
    try {
        const blocks = topLevelBlocks ?? await listChildBlocks(pageId);
        return convertBlocks(await selectWebsiteBlocks(blocks));
    } catch (error) {
        logger.error("Failed to convert Notion page content", { pageId, error: (error as Error).message });
        return [];
    }
};
