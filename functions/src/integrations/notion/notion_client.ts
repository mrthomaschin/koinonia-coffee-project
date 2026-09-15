import { Client } from "@notionhq/client";

const notionInstances = new Map<string, Client>();

/** Lazily creates a shared Notion client for the requested API version. */
export const getNotionClient = (notionVersion?: string): Client => {
  const cacheKey = notionVersion || "default";
  const existing = notionInstances.get(cacheKey);
  if (existing) return existing;

  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not configured");
  const client = notionVersion
    ? new Client({ auth: token, notionVersion })
    : new Client({ auth: token });
  notionInstances.set(cacheKey, client);
  return client;
};
