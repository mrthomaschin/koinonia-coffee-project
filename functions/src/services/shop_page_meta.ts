import { Request, Response } from "express";
import { createLogger } from "../logger";
import { siteUrlFor } from "../config/site";

const logger = createLogger("shopPageMeta");

const SITE_URL = siteUrlFor();
const TEMPLATE_TTL_MS = 10 * 60 * 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */
type InventoryLoader = () => Promise<{ items: any[] } | null>;

// Same rule as the client's generateSlug (src/pages/shop/shopData.ts).
const generateSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const plainText = (markdown: string): string =>
  markdown.replace(/[#*_`>[\]]|\(https?:[^)]*\)/g, "").replace(/\s+/g, " ").trim();

// Matches scripts/prerender-seo.js: the tags we replace per page.
const managedTags =
  /<meta\s[^>]*(?:name|property)="(?:description|robots|og:[^"]*|twitter:[^"]*)"[^>]*>|<link\s[^>]*rel="canonical"[^>]*>|<title>[\s\S]*?<\/title>/g;

let template: { html: string; fetchedAt: number } | null = null;

// The deployed SPA shell; static files win over rewrites, so "/" is never this function.
const loadTemplate = async (): Promise<string> => {
  if (template && Date.now() - template.fetchedAt < TEMPLATE_TTL_MS) return template.html;
  try {
    const response = await fetch(`${SITE_URL}/`);
    if (!response.ok) throw new Error(`Template fetch failed: ${response.status}`);
    template = { html: await response.text(), fetchedAt: Date.now() };
  } catch (error: unknown) {
    if (!template) throw error;
    logger.warn("Serving stale page template", { error: (error as Error).message });
  }
  return template.html;
};

const renderHead = (item: any, url: string): string => {
  const title = escapeHtml(`${item.name} | Koinonia Coffee Project`);
  const description = escapeHtml(
    plainText(item.itemDetails || item.itemSummary || "").slice(0, 160),
  );
  const image = (item.firebaseImageUrls || []).find((src: string) => src.startsWith("http"));
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}"/>`,
    "<meta name=\"robots\" content=\"index, follow\"/>",
    `<link rel="canonical" href="${url}"/>`,
    `<meta property="og:title" content="${title}"/>`,
    `<meta property="og:description" content="${description}"/>`,
    "<meta property=\"og:type\" content=\"product\"/>",
    `<meta property="og:url" content="${url}"/>`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}"/>` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}"/>`,
    `<meta name="twitter:title" content="${title}"/>`,
    `<meta name="twitter:description" content="${description}"/>`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}"/>` : "",
  ].join("");
};

/**
 * Serves /shop/<slug> (via a Hosting rewrite) as the SPA shell with that
 * product's title and social tags in <head>, for link previews that don't run
 * JavaScript (iMessage, Slack). Unknown slugs get the plain shell.
 */
export const handleShopPageMeta = (loadInventory: InventoryLoader) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const html = await loadTemplate();
      const slug = req.path.replace(/^\/shop\//, "").replace(/\/$/, "");
      const inventory = await loadInventory().catch(() => null);
      const item = inventory?.items.find((candidate) => generateSlug(candidate.name || "") === slug);

      res.set("Cache-Control", "public, max-age=300, s-maxage=600");
      res.type("html").send(
        item ?
          html.replace(managedTags, "").replace("</head>", `${renderHead(item, `${SITE_URL}/shop/${slug}`)}</head>`) :
          html,
      );
    } catch (error: unknown) {
      logger.error("Error rendering shop page meta", { error: (error as Error).message });
      res.status(503).set("Retry-After", "5").send("Something went wrong loading this page. Please refresh.");
    }
  };
/* eslint-enable @typescript-eslint/no-explicit-any */
