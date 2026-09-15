/** Reads visible text from a Notion rich-text/title array. */
export const notionText = (items: any[] | undefined): string =>
  (items || []).map((item: any) => item.plain_text || item.text?.content || "").join("");

/** Reads the text-like Notion property types used by the website calendar. */
export const notionPropertyText = (property: any): string => {
  if (!property) return "";
  if (property.type === "title") return notionText(property.title);
  if (property.type === "rich_text") return notionText(property.rich_text);
  if (property.type === "select") return property.select?.name || "";
  if (property.type === "url") return property.url || "";
  return "";
};
