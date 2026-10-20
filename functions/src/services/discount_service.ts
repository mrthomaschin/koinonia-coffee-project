import { Request, Response } from "express";
import { createLogger } from "../logger";
import { AccountProfile, emailsForAccount, sessionAccount } from "./account_service";
import {
  DiscountCode,
  findDiscountCode,
  hasPreviousOrders,
} from "../repositories/notion_discount_repository";
import { normalizeNewsletterEmail } from "./newsletter_service";

const logger = createLogger("discounts");

/** What a code's rules need to know about the order. */
interface DiscountContext {
  // Every email the buyer is known by: the checkout email and the account's emails.
  emails: string[];
  hasSubscription: boolean;
  hasPartnerPricing: boolean;
}

interface CartLine {
  subscriptionPlan?: string;
  isPartnerOrder?: boolean;
}

const PARTNER_LABELS = ["partner", "wholesale", "church-ministry"];

const contextFor = async (account: AccountProfile | null, email: string | null, items: CartLine[]): Promise<DiscountContext> => ({
  emails: [...(email ? [email] : []), ...(account ? await emailsForAccount(account) : [])],
  hasSubscription: items.some((item) => !!item.subscriptionPlan),
  hasPartnerPricing: items.some((item) => !!item.isPartnerOrder) || PARTNER_LABELS.includes(account?.label || ""),
});

/** Why the code can't be used on this order, or null when it can. */
const ruleViolation = async (discount: DiscountCode, context: DiscountContext): Promise<string | null> => {
  if (discount.noOtherDiscounts && context.hasSubscription) {
    return "This code can't be combined with subscriptions. Remove the subscription from your cart to use it.";
  }
  if (discount.noOtherDiscounts && context.hasPartnerPricing) {
    return "This code can't be combined with partner pricing.";
  }
  if (discount.firstOrderOnly && await hasPreviousOrders(context.emails)) {
    return "This code is only valid on your first order.";
  }
  return null;
};

const cartLines = (value: unknown): CartLine[] =>
  Array.isArray(value) ? value.filter((line) => line && typeof line === "object") : [];

export class DiscountService {
  /**
   * POST /validate-discount-code — body { code, email?, items? }, with the
   * session token when signed in. The cart sends items before the buyer's
   * email is known; checkout sends the email before taking payment, which is
   * when first-order codes are checked for guests.
   */
  static async handleValidate(req: Request, res: Response): Promise<void> {
    const { code } = req.body || {};
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Discount code is required" });
      return;
    }
    try {
      const lookup = await findDiscountCode(code);
      if (!lookup.valid) {
        res.json({ valid: false, message: lookup.message });
        return;
      }
      const context = await contextFor(
        await sessionAccount(req),
        normalizeNewsletterEmail(req.body?.email),
        cartLines(req.body?.items),
      );
      const violation = await ruleViolation(lookup.discount, context);
      if (violation) {
        res.json({ valid: false, message: violation });
        return;
      }
      const { discount } = lookup;
      logger.info("Discount code validated", { code: discount.code, percentOff: discount.percentOff });
      res.json({
        valid: true,
        code: discount.code,
        percentOff: discount.percentOff,
        message: discount.firstOrderOnly ?
          `${discount.percentOff}% off your first order applied!` :
          `${discount.percentOff}% discount applied!`,
      });
    } catch (error: unknown) {
      logger.error("Error validating discount code", { error: (error as Error).message });
      res.status(500).json({ error: "Unable to validate discount code. Please try again later." });
    }
  }

  /**
   * The discount to apply to a checkout, re-checked on the server so a code
   * that no longer applies (an item added after applying it, an expired code,
   * or a returning buyer) can't reach Stripe.
   */
  static async checkoutDiscount(
    code: string,
    account: AccountProfile | null,
    email: string | null,
    items: CartLine[],
  ): Promise<{ ok: true; discount: DiscountCode } | { ok: false; message: string }> {
    const lookup = await findDiscountCode(code);
    if (!lookup.valid) return { ok: false, message: lookup.message };
    const violation = await ruleViolation(lookup.discount, await contextFor(account, normalizeNewsletterEmail(email), items));
    return violation ? { ok: false, message: violation } : { ok: true, discount: lookup.discount };
  }
}
