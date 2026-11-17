import { Request, Response } from "express";
import { createLogger } from "../logger";
import {
  AccountProfile,
  emailsForAccount,
  sessionAccount,
} from "./account_service";
import {
  DiscountCode,
  DiscountCodeLookup,
  findAutomaticDiscountCodes,
  findDiscountCode,
} from "../repositories/notion_discount_repository";
import { OrderStore } from "../orders/order_store";
import {
  findWelcomeCode,
  isWelcomeCodeActive,
  isWelcomeCodeFormat,
} from "../repositories/welcome_code_repository";
import { WELCOME_DISCOUNT } from "../config/newsletters";
import { normalizeNewsletterEmail } from "./newsletter_service";

const logger = createLogger("discounts");

/**
 * Finds a code a customer entered: a subscriber's own welcome code in
 * Firestore, or any other code in the Notion discount codes database.
 */
const lookupDiscountCode = async (code: string): Promise<DiscountCodeLookup> => {
  if (!isWelcomeCodeFormat(code)) return findDiscountCode(code);
  const welcome = await findWelcomeCode(code);
  if (!welcome) return { valid: false, message: "Invalid discount code" };
  if (!isWelcomeCodeActive(welcome)) {
    return { valid: false, message: "This discount code has expired" };
  }
  return {
    valid: true,
    discount: {
      code: welcome.code,
      percentOff: WELCOME_DISCOUNT.percentOff,
      firstOrderOnly: true,
      noOtherDiscounts: true,
      subscriptionsOnly: false,
      ownerEmail: welcome.email,
    },
  };
};

/** What a code's rules need to know about the order. */
interface DiscountContext {
  // Every email the buyer is known by: the checkout email and the account's emails.
  emails: string[];
  // True once the buyer has entered their checkout email (at payment), when
  // codes tied to an email are checked.
  hasCheckoutEmail: boolean;
  hasSubscription: boolean;
  hasPartnerPricing: boolean;
}

interface CartLine {
  subscriptionPlan?: string;
  isPartnerOrder?: boolean;
}

const PARTNER_LABELS = ["partner", "wholesale", "church-ministry"];

const contextFor = async (
  account: AccountProfile | null,
  email: string | null,
  items: CartLine[],
): Promise<DiscountContext> => ({
  emails: [
    ...(email ? [email] : []),
    ...(account ? await emailsForAccount(account) : []),
  ],
  hasCheckoutEmail: !!email,
  hasSubscription: items.some((item) => !!item.subscriptionPlan),
  hasPartnerPricing:
    items.some((item) => !!item.isPartnerOrder) ||
    PARTNER_LABELS.includes(account?.label || ""),
});

/**
 * Which rule refused a code. "first-order" and "already-used" won't change for
 * this buyer; "wrong-email" means the code belongs to another email.
 */
type RuleViolationReason =
  | "subscription"
  | "no-subscription"
  | "partner-pricing"
  | "first-order"
  | "already-used"
  | "wrong-email";

interface RuleViolation {
  reason: RuleViolationReason;
  message: string;
}

/**
 * Why the code can't be used on this order, or null when it can. `entered` is
 * true for a code the customer typed; automatic promotions skip the
 * once-per-customer check, since they apply without being asked for.
 */
const ruleViolation = async (
  discount: DiscountCode,
  context: DiscountContext,
  entered = true,
): Promise<RuleViolation | null> => {
  // Checked once the checkout email is known; before that (the cart) the
  // buyer may not have said which email they're using.
  if (
    discount.ownerEmail &&
    context.hasCheckoutEmail &&
    !context.emails.includes(discount.ownerEmail)
  ) {
    return {
      reason: "wrong-email",
      message:
        "This code only works with the email address it was sent to. Check out with that email to use it.",
    };
  }
  if (discount.noOtherDiscounts && context.hasSubscription) {
    return {
      reason: "subscription",
      message:
        "This code can't be combined with subscriptions. Remove the subscription from your cart to use it.",
    };
  }
  if (discount.subscriptionsOnly && !context.hasSubscription) {
    return {
      reason: "no-subscription",
      message:
        "This code is for new subscriptions. Add a subscription to your cart to use it.",
    };
  }
  if (discount.noOtherDiscounts && context.hasPartnerPricing) {
    return {
      reason: "partner-pricing",
      message: "This code can't be combined with partner pricing.",
    };
  }
  if (discount.firstOrderOnly && (await OrderStore.hasPreviousOrders(context.emails))) {
    return {
      reason: "first-order",
      message: "This code is only valid on your first order.",
    };
  }
  if (entered && (await OrderStore.hasUsedDiscountCode(context.emails, discount.code))) {
    return {
      reason: "already-used",
      message: "You've already used this code.",
    };
  }
  return null;
};

const cartLines = (value: unknown): CartLine[] =>
  Array.isArray(value)
    ? value.filter((line) => line && typeof line === "object")
    : [];

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
      const lookup = await lookupDiscountCode(code);
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
        res.json({
          valid: false,
          message: violation.message,
          reason: violation.reason,
        });
        return;
      }
      const { discount } = lookup;
      logger.info("Discount code validated", {
        code: discount.code,
        percentOff: discount.percentOff,
      });
      res.json({
        valid: true,
        code: discount.code,
        percentOff: discount.percentOff,
        subscriptionsOnly: discount.subscriptionsOnly,
        message: discount.subscriptionsOnly
          ? `${discount.percentOff}% off your first subscription order applied!`
          : discount.firstOrderOnly
            ? `${discount.percentOff}% off your first order applied!`
            : `${discount.percentOff}% discount applied!`,
      });
    } catch (error: unknown) {
      logger.error("Error validating discount code", {
        error: (error as Error).message,
      });
      res.status(500).json({
        error: "Unable to validate discount code. Please try again later.",
      });
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
  ): Promise<
    { ok: true; discount: DiscountCode } | { ok: false; message: string }
  > {
    const lookup = await lookupDiscountCode(code);
    if (!lookup.valid) return { ok: false, message: lookup.message };
    const violation = await ruleViolation(
      lookup.discount,
      await contextFor(account, normalizeNewsletterEmail(email), items),
    );
    return violation
      ? { ok: false, message: violation.message }
      : { ok: true, discount: lookup.discount };
  }

  /**
   * The largest "Automatically Applied" code whose rules this order meets,
   * used when the customer hasn't entered a code. A Notion error means no
   * automatic discount rather than a failed checkout.
   */
  static async automaticDiscount(
    account: AccountProfile | null,
    email: string | null,
    items: CartLine[],
  ): Promise<DiscountCode | null> {
    try {
      const discounts = await findAutomaticDiscountCodes();
      if (!discounts.length) return null;
      const context = await contextFor(
        account,
        normalizeNewsletterEmail(email),
        items,
      );
      for (const discount of discounts) {
        if (!(await ruleViolation(discount, context, false))) return discount;
      }
      return null;
    } catch (error: unknown) {
      logger.error("Error finding automatic discount", {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * POST /automatic-discount — body { items, email? }, with the session token
   * when signed in. Returns { discount: { code, percentOff, subscriptionsOnly }
   * } for the cart to show, or { discount: null }.
   */
  static async handleAutomatic(req: Request, res: Response): Promise<void> {
    const discount = await DiscountService.automaticDiscount(
      await sessionAccount(req).catch(() => null),
      typeof req.body?.email === "string" ? req.body.email : null,
      cartLines(req.body?.items),
    );
    res.json({
      discount: discount && {
        code: discount.code,
        percentOff: discount.percentOff,
        subscriptionsOnly: discount.subscriptionsOnly,
      },
    });
  }
}
