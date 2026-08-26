import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { getFirestore } from "firebase-admin/firestore";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Client } from "@notionhq/client";
import { Request, Response } from "express";
import { createLogger } from "../logger";

const logger = createLogger("accounts");
const scrypt = promisify(scryptCallback);
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_DURATION_MS = 5 * 60 * 1000;

const database = () => {
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  return getFirestore();
};

export interface AccountProfile {
  id: string;
  user: { firstName: string; lastName: string; email: string };
  username: string;
}

interface StoredAccount extends AccountProfile {
  passwordHash: string;
}

interface Order {
  id: string;
  accountId: string;
  totalAmount: number;
  date: string;
  status: "pending" | "completed" | "cancelled";
}

let notionInstance: Client | null = null;

const getNotion = (): Client => {
  if (!notionInstance) {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error("NOTION_TOKEN is not configured");
    notionInstance = new Client({ auth: token });
  }
  return notionInstance;
};

const accountDatabaseId = (): string => {
  const databaseId = process.env.NOTION_ACCOUNTS_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_ACCOUNTS_DATABASE_ID is not configured");
  return databaseId;
};

const text = (property: any): string => {
  if (!property) return "";
  if (property.type === "email") return property.email || "";
  if (property.type === "title") return property.title?.map((value: any) => value.plain_text).join("") || "";
  return property.rich_text?.map((value: any) => value.plain_text).join("") || "";
};

const status = (property: any): Order["status"] => {
  const value = (property?.status?.name || property?.select?.name || "").toLowerCase();
  if (["paid", "completed", "delivered", "shipped"].includes(value)) return "completed";
  if (["cancelled", "canceled", "refunded"].includes(value)) return "cancelled";
  return "pending";
};

const createPasswordHash = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
};

const passwordMatches = async (password: string, storedHash: string): Promise<boolean> => {
  const [algorithm, salt, expected] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
};

const cacheAccount = async (account: StoredAccount): Promise<void> => {
  await database().collection("account_cache").doc(account.id).set({ ...account, cachedAt: Date.now() });
};

const mapAccount = (page: any): StoredAccount => {
  const properties = page.properties || {};
  return {
    // Use the app-level ID when present; retain the Notion page ID for accounts
    // created before this property was introduced.
    id: text(properties["Account ID"]) || page.id,
    user: {
      firstName: text(properties["First Name"]),
      lastName: text(properties["Last Name"]),
      email: text(properties.Email).toLowerCase(),
    },
    username: text(properties.Username),
    passwordHash: text(properties["Password Hash"]),
  };
};

const findAccount = async (username: string): Promise<StoredAccount | null> => {
  const response = await getNotion().databases.query({ database_id: accountDatabaseId() });
  const accountPage = response.results.find((page: any) =>
    "properties" in page && text(page.properties.Username).toLowerCase() === username.toLowerCase());
  if (!accountPage) return null;
  const account = mapAccount(accountPage);
  await cacheAccount(account);
  return account;
};

const publicProfile = (account: StoredAccount): AccountProfile => ({
  id: account.id,
  user: account.user,
  username: account.username,
});

const issueSession = async (account: StoredAccount): Promise<string> => {
  const token = randomBytes(32).toString("base64url");
  await database().collection("account_sessions").doc(token).set({
    accountId: account.id,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  return token;
};

const sessionAccount = async (req: Request): Promise<AccountProfile | null> => {
  const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const session = await database().collection("account_sessions").doc(token).get();
  const data = session.data();
  if (!session.exists || !data || data.expiresAt < Date.now()) {
    if (session.exists) await session.ref.delete();
    return null;
  }
  const account = await database().collection("account_cache").doc(data.accountId).get();
  const accountData = account.data() as StoredAccount | undefined;
  if (!accountData) return null;
  return publicProfile(accountData);
};

export class AccountService {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required." });
        return;
      }
      const account = await findAccount(username);
      if (!account || !(await passwordMatches(password, account.passwordHash))) {
        res.status(401).json({ error: "Invalid username or password." });
        return;
      }
      res.json({ account: publicProfile(account), token: await issueSession(account) });
    } catch (error: unknown) {
      logger.error("Unable to log in", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to log in right now." });
    }
  }

  static async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const firstName = String(req.body?.firstName || "").trim();
      const lastName = String(req.body?.lastName || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const username = String(req.body?.username || email).trim();
      const password = String(req.body?.password || "");
      if (!firstName || !lastName || !email || !username || password.length < 8 || !/^\S+@\S+\.\S+$/.test(email)) {
        res.status(400).json({ error: "Enter a name, valid email, username, and password of at least 8 characters." });
        return;
      }
      const existing = await findAccount(username);
      if (existing) {
        res.status(409).json({ error: "That username is already in use." });
        return;
      }
      const notion = getNotion();
      const accountId = `acct_${randomUUID()}`;
      const page = await notion.pages.create({
        parent: { database_id: accountDatabaseId() },
        properties: {
          "Name": { title: [{ text: { content: `${firstName} ${lastName}` } }] },
          "First Name": { rich_text: [{ text: { content: firstName } }] },
          "Last Name": { rich_text: [{ text: { content: lastName } }] },
          "Email": { email },
          "Username": { rich_text: [{ text: { content: username } }] },
          "Account ID": { rich_text: [{ text: { content: accountId } }] },
          "Password Hash": { rich_text: [{ text: { content: await createPasswordHash(password) } }] },
        },
      });
      const account = mapAccount(page);
      await cacheAccount(account);
      res.status(201).json({ account: publicProfile(account), token: await issueSession(account) });
    } catch (error: unknown) {
      logger.error("Unable to create account", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to create an account right now." });
    }
  }

  static async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const account = await sessionAccount(req);
      if (!account) {
        res.status(401).json({ error: "Your session has expired. Please log in again." });
        return;
      }
      const cacheRef = database().collection("account_order_cache").doc(account.id);
      const cached = await cacheRef.get();
      const cachedData = cached.data();
      if (cachedData && Date.now() - cachedData.cachedAt < CACHE_DURATION_MS) {
        res.json({ orders: cachedData.orders });
        return;
      }
      const response = await getNotion().databases.query({
        database_id: process.env.NOTION_ONLINE_ORDERS_DATABASE_ID!,
        filter: { property: "Email", email: { equals: account.user.email } },
        sorts: [{ property: "Order created", direction: "descending" }],
      });
      const orders: Order[] = response.results.map((page: any) => {
        const properties = page.properties || {};
        return {
          id: text(properties["Order #"]) || page.id,
          accountId: account.id,
          totalAmount: properties.Total?.number || 0,
          date: properties["Order created"]?.date?.start || page.created_time,
          status: status(properties.Status),
        };
      });
      await cacheRef.set({ orders, cachedAt: Date.now() });
      res.json({ orders });
    } catch (error: unknown) {
      logger.error("Unable to get account orders", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to load orders right now." });
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const token = req.header("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token) await database().collection("account_sessions").doc(token).delete();
    res.status(204).send();
  }
}
