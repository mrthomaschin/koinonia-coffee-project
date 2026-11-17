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
import {
  ensureWelcomeCode,
  isWelcomeCodeActive,
  markWelcomeReminderSent,
  WelcomeCode,
  welcomeCodesNeedingReminder,
} from "../repositories/welcome_code_repository";
import { OrderStore } from "../orders/order_store";

const logger = createLogger("newsletter");

/**
 * One document per subscribe or unsubscribe, never edited. It is the record of
 * when and where someone gave or withdrew consent. Resend holds the current
 * subscription state, including changes made on its hosted unsubscribe page.
 */
const CONSENT_LOG_COLLECTION = "newsletter_consent_log";

export type NewsletterSource = "footer" | "checkout" | "about" | "homepage" | "account" | "email-change";
const PUBLIC_SOURCES: NewsletterSource[] = ["footer", "checkout", "about", "homepage"];

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

/** "Thursday, November 19" for a YYYY-MM-DD calendar date. */
const formatExpiry = (calendarDate: string): string => {
  const [year, month, day] = calendarDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
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
   * Subscribes an email and returns its first-order welcome code. The first
   * time an email gets a code, the welcome email sends it; an email only ever
   * gets one code, so signing up again returns the same one. Checkout signups
   * get no code: they have just ordered, so it wouldn't apply.
   */
  static async subscribe(
    email: string,
    newsletters: NewsletterId[],
    context: ConsentContext,
  ): Promise<WelcomeCode | null> {
    await NewsletterService.setSubscriptions(
      email,
      Object.fromEntries(newsletters.map((id) => [id, true])),
      context,
    );
    if (context.source === "checkout") return null;

    let welcome: { code: WelcomeCode; issued: boolean };
    try {
      welcome = await ensureWelcomeCode(email);
    } catch (error: unknown) {
      // The subscription stands; they just don't get a code this time.
      logger.error("Error issuing welcome code", { error: (error as Error).message });
      return null;
    }
    if (welcome.issued) {
      try {
        await NewsletterService.sendWelcome(welcome.code, siteUrlFor(context.request?.header("origin")));
      } catch (error: unknown) {
        // They're subscribed and saw the code on screen, so this doesn't fail the signup.
        logger.error("Error sending newsletter welcome email", { error: (error as Error).message });
      }
    }
    return welcome.code;
  }

  /** Thanks a new subscriber and gives them their first-order code. */
  static async sendWelcome(code: WelcomeCode, siteUrl: string): Promise<void> {
    await sendResendTemplate({
      to: code.email,
      template: RESEND_TEMPLATES.newsletterWelcome,
      variables: {
        discount_code: code.code,
        percent_off: `${WELCOME_DISCOUNT.percentOff}%`,
        // Completes "Enter the code in your cart…" in the template; blank by default.
        expiry_note: ` and check out with this email by ${formatExpiry(code.expiresOn)}`,
        shop_url: `${siteUrl}/shop`,
      },
    }, "Newsletter welcome email error");
  }

  /**
   * Daily: reminds subscribers whose welcome code expires soon. Skips anyone
   * who has since ordered (the code no longer applies) or unsubscribed (it's a
   * marketing email). Each code gets at most one reminder, recorded even when
   * skipped so it isn't checked again.
   */
  static async sendExpiryReminders(): Promise<void> {
    const codes = await welcomeCodesNeedingReminder(WELCOME_DISCOUNT.reminderDaysLeft);
    let sent = 0;
    for (const code of codes) {
      try {
        if (!isWelcomeCodeActive(code)) continue;
        const subscribed = (await NewsletterService.getPreferences(code.email))
          .some((newsletter) => newsletter.subscribed);
        if (subscribed && !(await OrderStore.hasPreviousOrders([code.email]))) {
          await sendResendTemplate({
            to: code.email,
            template: RESEND_TEMPLATES.newsletterDiscountReminder,
            variables: {
              discount_code: code.code,
              percent_off: `${WELCOME_DISCOUNT.percentOff}%`,
              expires_on: formatExpiry(code.expiresOn),
              shop_url: `${siteUrlFor()}/shop`,
            },
          }, "Welcome code reminder email error");
          sent++;
        }
        await markWelcomeReminderSent(code.code);
      } catch (error: unknown) {
        // Left unmarked, so tomorrow's run tries again while the code is still active.
        logger.error("Error sending welcome code reminder", { code: code.code, error: (error as Error).message });
      }
    }
    logger.info("Welcome code reminders done", { due: codes.length, sent });
  }

  /**
   * POST /newsletter/subscribe — the footer, About page, and checkout signups.
   * Body: { email, firstName?, lastName?, source, website? }. Subscribes right
   * away and returns the subscriber's own first-order code to show on screen,
   * as { code, percentOff, expiresOn }, or null once it has expired. Its rules
   * (this email only, first order only, no other discounts) are checked when
   * it's used. Checkout signups get no code, since they have just ordered.
   * `website` is a hidden field that people never fill in; requests that fill
   * it are bots.
   */
  static async handleSubscribe(req: Request, res: Response): Promise<void> {
    const source = PUBLIC_SOURCES.includes(req.body?.source) ? req.body.source as NewsletterSource : "footer";
    if (req.body?.website) {
      res.json({ ok: true, discount: null });
      return;
    }
    const email = normalizeNewsletterEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }
    try {
      const code = await NewsletterService.subscribe(email, [DEFAULT_NEWSLETTER], {
        source,
        firstName: cleanName(req.body?.firstName),
        lastName: cleanName(req.body?.lastName),
        request: req,
      });
      const discount = code && isWelcomeCodeActive(code) ?
        { code: code.code, percentOff: WELCOME_DISCOUNT.percentOff, expiresOn: code.expiresOn } :
        null;
      res.json({ ok: true, discount });
    } catch (error: unknown) {
      logger.error("Error subscribing to newsletter", { source, error: (error as Error).message });
      res.status(500).json({ error: "We couldn't sign you up right now. Please try again." });
    }
  }
}
