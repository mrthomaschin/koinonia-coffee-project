import { createHash, randomBytes } from "crypto";
import { Request, Response } from "express";
import { createLogger } from "../logger";
import { getDatabase } from "../integrations/firebase_admin";
import {
  DEFAULT_NEWSLETTER,
  NEWSLETTER_IDS,
  NEWSLETTER_SEGMENT_ID,
  NEWSLETTERS,
  NewsletterId,
  WELCOME_DISCOUNT,
} from "../config/newsletters";
import { siteUrlFor } from "../config/site";
import { hasPreviousOrders } from "../repositories/notion_discount_repository";
import { RESEND_TEMPLATES, sendResendTemplate } from "../integrations/email/resend_client";
import {
  addContactToSegment,
  createContact,
  findContact,
  optedInTopicIds,
  setContactUnsubscribed,
  updateContactTopics,
} from "../integrations/email/resend_contacts";

const logger = createLogger("newsletter");

/**
 * One document per subscribe or unsubscribe, never edited. It is the record of
 * when and where someone gave or withdrew consent. Resend holds the current
 * subscription state, including changes made on its hosted unsubscribe page.
 */
const CONSENT_LOG_COLLECTION = "newsletter_consent_log";

/**
 * Signups waiting for the person to click the emailed confirmation link, at
 * newsletter_confirmations/{sha256(token)}. Only the hash is stored, so
 * database access alone cannot confirm a subscription.
 */
const CONFIRMATIONS_COLLECTION = "newsletter_confirmations";
const CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// One confirmation email per address per minute, so the form can't be used to flood an inbox.
const CONFIRMATION_COOLDOWN_MS = 60 * 1000;

interface NewsletterConfirmation {
  email: string;
  newsletters: NewsletterId[];
  source: NewsletterSource;
  firstName: string | null;
  lastName: string | null;
  accountId: string | null;
  // Other emails the person has used, such as an account's earlier emails.
  // Orders under any of them make the person a past customer.
  otherEmails?: string[];
  createdAt: number;
  // Configure as a Firestore TTL field to delete expired links automatically.
  expiresAt: Date;
}

const tokenHash = (token: string): string => createHash("sha256").update(token).digest("hex");
const confirmationRef = (token: string) =>
  getDatabase().collection(CONFIRMATIONS_COLLECTION).doc(tokenHash(token));

export type NewsletterSource = "footer" | "checkout" | "about" | "account" | "email-change";
const PUBLIC_SOURCES: NewsletterSource[] = ["footer", "checkout", "about"];

export interface NewsletterPreference {
  id: NewsletterId;
  name: string;
  description: string;
  subscribed: boolean;
}

interface ConsentContext {
  source: NewsletterSource;
  firstName?: string;
  lastName?: string;
  accountId?: string;
  request?: Request;
  // Set when the person proved they own the email by clicking a confirmation link.
  confirmedByEmail?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

export const normalizeNewsletterEmail = (value: unknown): string | null => {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) ? email : null;
};

const cleanName = (value: unknown): string | undefined => {
  const name = typeof value === "string" ? value.trim().slice(0, MAX_NAME_LENGTH) : "";
  return name || undefined;
};

/** A hash rather than the raw address: enough to spot abuse without storing the IP. */
const hashedIp = (request?: Request): string | null => {
  const forwarded = request?.header("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request?.ip;
  return ip ? createHash("sha256").update(ip).digest("hex") : null;
};

const logConsent = async (
  email: string,
  changes: Partial<Record<NewsletterId, boolean>>,
  context: ConsentContext,
): Promise<void> => {
  await getDatabase().collection(CONSENT_LOG_COLLECTION).add({
    email,
    subscribed: Object.entries(changes).filter(([, on]) => on).map(([id]) => id),
    unsubscribed: Object.entries(changes).filter(([, on]) => !on).map(([id]) => id),
    source: context.source,
    accountId: context.accountId || null,
    confirmedByEmail: !!context.confirmedByEmail,
    ipHash: hashedIp(context.request),
    userAgent: context.request?.header("user-agent")?.slice(0, 300) || null,
    createdAt: new Date(),
  });
};

export class NewsletterService {
  /** Every newsletter, with whether the email currently receives it. */
  static async getPreferences(email: string): Promise<NewsletterPreference[]> {
    const contact = await findContact(email);
    const optedIn = contact && !contact.unsubscribed ? await optedInTopicIds(email) : new Set<string>();
    return NEWSLETTER_IDS.map((id) => ({
      id,
      name: NEWSLETTERS[id].name,
      description: NEWSLETTERS[id].description,
      subscribed: optedIn.has(NEWSLETTERS[id].topicId),
    }));
  }

  /**
   * Turns newsletters on (true) or off (false) for an email. Turning one on
   * also lifts an earlier "unsubscribe from all", since the person is asking
   * for email again. Turning one off leaves the others alone.
   */
  static async setSubscriptions(
    email: string,
    changes: Partial<Record<NewsletterId, boolean>>,
    context: ConsentContext,
  ): Promise<void> {
    const entries = Object.entries(changes) as [NewsletterId, boolean][];
    if (!entries.length) return;
    const topics = entries.map(([id, on]) => ({
      id: NEWSLETTERS[id].topicId,
      subscription: on ? "opt_in" as const : "opt_out" as const,
    }));
    const subscribing = entries.some(([, on]) => on);
    const contact = await findContact(email);

    if (!contact) {
      // Nobody to unsubscribe; only create a contact for someone opting in.
      if (!subscribing) return;
      await createContact({
        email,
        firstName: context.firstName,
        lastName: context.lastName,
        segmentIds: [NEWSLETTER_SEGMENT_ID],
        topics,
      });
    } else {
      if (subscribing) {
        if (contact.unsubscribed) await setContactUnsubscribed(email, false);
        await addContactToSegment(email, NEWSLETTER_SEGMENT_ID);
      }
      await updateContactTopics(email, topics);
    }

    await logConsent(email, changes, context);
    logger.info("Newsletter subscriptions updated", { source: context.source, changes });
  }

  /**
   * Moves an account's newsletters to its new email after a confirmed email
   * change: the new email is subscribed to whatever the old one received, and
   * the old one is unsubscribed. Nothing moves if the old email received none.
   */
  static async moveSubscriptions(
    fromEmail: string,
    toEmail: string,
    context: Omit<ConsentContext, "source">,
  ): Promise<void> {
    if (fromEmail === toEmail) return;
    const subscribed = (await NewsletterService.getPreferences(fromEmail))
      .filter((newsletter) => newsletter.subscribed)
      .map((newsletter) => newsletter.id);
    if (!subscribed.length) return;
    const on = Object.fromEntries(subscribed.map((id) => [id, true]));
    const off = Object.fromEntries(subscribed.map((id) => [id, false]));
    await NewsletterService.setSubscriptions(toEmail, on, { ...context, source: "email-change" });
    await NewsletterService.setSubscriptions(fromEmail, off, { ...context, source: "email-change" });
  }

  /**
   * Emails a link that subscribes the address once clicked. Nothing changes in
   * Resend until then. Skips the email when one went out in the last minute.
   * `otherEmails` are other emails the person has used; orders under them
   * count when deciding whether to offer the first-order discount.
   */
  static async requestConfirmation(
    email: string,
    newsletters: NewsletterId[],
    context: ConsentContext,
    otherEmails: string[] = [],
  ): Promise<void> {
    const collection = getDatabase().collection(CONFIRMATIONS_COLLECTION);
    const pending = await collection.where("email", "==", email).get();
    const now = Date.now();
    if (pending.docs.some((doc) => now - (doc.data() as NewsletterConfirmation).createdAt < CONFIRMATION_COOLDOWN_MS)) {
      logger.info("Skipping newsletter confirmation; one was just sent", { source: context.source });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const confirmation: NewsletterConfirmation = {
      email,
      newsletters,
      source: context.source,
      firstName: context.firstName || null,
      lastName: context.lastName || null,
      accountId: context.accountId || null,
      otherEmails: otherEmails.filter((other) => other !== email),
      createdAt: now,
      expiresAt: new Date(now + CONFIRMATION_TTL_MS),
    };
    await confirmationRef(token).set(confirmation);
    const siteUrl = siteUrlFor(context.request?.header("origin"));
    // Only people who have never ordered are offered the discount. Checkout
    // signups have just ordered, though their order may not be recorded yet.
    const offersDiscount = context.source !== "checkout" &&
      await NewsletterService.isEligibleForWelcomeDiscount([email, ...otherEmails]);
    const percentOff = `${WELCOME_DISCOUNT.percentOff}%`;
    await sendResendTemplate({
      to: email,
      template: RESEND_TEMPLATES.newsletterConfirm,
      subject: offersDiscount ?
        `Confirm your subscription for ${percentOff} off – Koinonia Coffee Project` :
        "Confirm your subscription – Koinonia Coffee Project",
      variables: {
        confirm_url: `${siteUrl}/newsletter/confirm?token=${token}`,
        headline: offersDiscount ? `One more step to get ${percentOff} off` : "One more step",
        message: offersDiscount ?
          `Thanks for signing up for our monthly newsletter! Confirm your email and we'll send you a code for ${percentOff} off your first order.` :
          "Thanks for signing up for our monthly newsletter! Confirm your email to start receiving it.",
        expires_in: "7 days",
      },
    }, "Newsletter confirmation email error");
    logger.info("Newsletter confirmation sent", { source: context.source });
  }

  /** The welcome discount is only for people who have never ordered. */
  static async isEligibleForWelcomeDiscount(emails: string[]): Promise<boolean> {
    return !(await hasPreviousOrders(emails));
  }

  /**
   * Thanks a new subscriber. With `withDiscount` the email carries the
   * first-order code; past customers get the welcome without one.
   */
  static async sendWelcome(email: string, siteUrl: string, withDiscount: boolean): Promise<void> {
    await sendResendTemplate({
      to: email,
      template: withDiscount ? RESEND_TEMPLATES.newsletterWelcome : RESEND_TEMPLATES.newsletterWelcomeBack,
      variables: {
        ...(withDiscount ? {
          discount_code: WELCOME_DISCOUNT.code,
          percent_off: `${WELCOME_DISCOUNT.percentOff}%`,
        } : {}),
        shop_url: `${siteUrl}/shop`,
      },
    }, "Newsletter welcome email error");
  }

  /**
   * POST /newsletter/subscribe — the footer, About page, and checkout signups.
   * Body: { email, firstName?, lastName?, source, website? }. Sends a
   * confirmation link; the person is subscribed once they click it.
   * `website` is a hidden field that people never fill in; requests that fill
   * it are bots. The response never says whether the email was already
   * subscribed.
   */
  static async handleSubscribe(req: Request, res: Response): Promise<void> {
    if (req.body?.website) {
      res.json({ ok: true });
      return;
    }
    const email = normalizeNewsletterEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    const source = PUBLIC_SOURCES.includes(req.body?.source) ? req.body.source as NewsletterSource : "footer";
    try {
      await NewsletterService.requestConfirmation(email, [DEFAULT_NEWSLETTER], {
        source,
        firstName: cleanName(req.body?.firstName),
        lastName: cleanName(req.body?.lastName),
        request: req,
      });
      res.json({ ok: true });
    } catch (error: unknown) {
      logger.error("Error requesting newsletter confirmation", { source, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't sign you up right now. Please try again." });
    }
  }

  /**
   * POST /newsletter/confirm — body { token } from the emailed link. Subscribes
   * the email, then sends the welcome email, with the first-order code for
   * people who have never ordered. Each link works once.
   */
  static async handleConfirm(req: Request, res: Response): Promise<void> {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    try {
      const ref = token ? confirmationRef(token) : null;
      const confirmation = ref ? (await ref.get()).data() as NewsletterConfirmation | undefined : undefined;
      const expiresAt = confirmation?.expiresAt instanceof Date
        ? confirmation.expiresAt
        : (confirmation?.expiresAt as unknown as { toDate(): Date } | undefined)?.toDate();
      if (!ref || !confirmation || !expiresAt || expiresAt.getTime() <= Date.now()) {
        res.status(400).json({ error: "This link is invalid or has expired. Sign up again and we'll send a new one." });
        return;
      }
      await NewsletterService.setSubscriptions(
        confirmation.email,
        Object.fromEntries(confirmation.newsletters.map((id) => [id, true])),
        {
          source: confirmation.source,
          firstName: confirmation.firstName || undefined,
          lastName: confirmation.lastName || undefined,
          accountId: confirmation.accountId || undefined,
          request: req,
          confirmedByEmail: true,
        },
      );
      await ref.delete();
      const withDiscount = confirmation.source !== "checkout" &&
        await NewsletterService.isEligibleForWelcomeDiscount([confirmation.email, ...(confirmation.otherEmails || [])]);
      try {
        await NewsletterService.sendWelcome(confirmation.email, siteUrlFor(req.header("origin")), withDiscount);
      } catch (error: unknown) {
        // They're subscribed and the page shows any code, so a failed welcome email doesn't fail the request.
        logger.error("Error sending newsletter welcome email", { error: (error as Error).message });
      }
      res.json({
        email: confirmation.email,
        discount: withDiscount ? { code: WELCOME_DISCOUNT.code, percentOff: WELCOME_DISCOUNT.percentOff } : null,
      });
    } catch (error: unknown) {
      logger.error("Error confirming newsletter subscription", { error: (error as Error).message });
      res.status(500).json({ error: "We couldn't confirm your subscription right now. Please try again." });
    }
  }
}
