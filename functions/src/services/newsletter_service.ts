import { createHash } from "crypto";
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
   * Subscribes an email and, the first time it subscribes, sends the welcome
   * email with the first-order code. Checkout signups get no welcome email:
   * they have just ordered, so the code wouldn't apply.
   */
  static async subscribe(
    email: string,
    newsletters: NewsletterId[],
    context: ConsentContext,
  ): Promise<void> {
    const before = await NewsletterService.getPreferences(email);
    await NewsletterService.setSubscriptions(
      email,
      Object.fromEntries(newsletters.map((id) => [id, true])),
      context,
    );
    const newlySubscribed = before.some((newsletter) => newsletters.includes(newsletter.id) && !newsletter.subscribed);
    if (!newlySubscribed || context.source === "checkout") return;
    try {
      await NewsletterService.sendWelcome(email, siteUrlFor(context.request?.header("origin")));
    } catch (error: unknown) {
      // They're subscribed and saw the code on screen, so this doesn't fail the signup.
      logger.error("Error sending newsletter welcome email", { error: (error as Error).message });
    }
  }

  /** Thanks a new subscriber and gives them the first-order code. */
  static async sendWelcome(email: string, siteUrl: string): Promise<void> {
    await sendResendTemplate({
      to: email,
      template: RESEND_TEMPLATES.newsletterWelcome,
      variables: {
        discount_code: WELCOME_DISCOUNT.code,
        percent_off: `${WELCOME_DISCOUNT.percentOff}%`,
        shop_url: `${siteUrl}/shop`,
      },
    }, "Newsletter welcome email error");
  }

  /**
   * POST /newsletter/subscribe — the footer, About page, and checkout signups.
   * Body: { email, firstName?, lastName?, source, website? }. Subscribes right
   * away and returns the first-order code to show on screen; its rules (first
   * order only, no other discounts) are checked when it's used. Checkout
   * signups get no code, since they have just ordered.
   * `website` is a hidden field that people never fill in; requests that fill
   * it are bots.
   */
  static async handleSubscribe(req: Request, res: Response): Promise<void> {
    const source = PUBLIC_SOURCES.includes(req.body?.source) ? req.body.source as NewsletterSource : "footer";
    const discount = source === "checkout" ?
      null :
      { code: WELCOME_DISCOUNT.code, percentOff: WELCOME_DISCOUNT.percentOff };
    if (req.body?.website) {
      res.json({ ok: true, discount });
      return;
    }
    const email = normalizeNewsletterEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    try {
      await NewsletterService.subscribe(email, [DEFAULT_NEWSLETTER], {
        source,
        firstName: cleanName(req.body?.firstName),
        lastName: cleanName(req.body?.lastName),
        request: req,
      });
      res.json({ ok: true, discount });
    } catch (error: unknown) {
      logger.error("Error subscribing to newsletter", { source, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't sign you up right now. Please try again." });
    }
  }
}
