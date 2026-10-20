import { createHash } from "crypto";
import {
  calendarDateOffset,
  isRoastDateDue,
  pacificCalendarDate,
} from "../domain/dates/calendar_dates";
import { weightInPounds } from "../domain/shipping/weight";

/** Fields that decide whether a subscription's upcoming roast is charged. */
export interface RenewalState {
  status: string;
  upcomingRoastDate: string;
  // Roast date (YYYY-MM-DD) the customer skipped. A skip applies only to that
  // date, so it expires on its own once the subscription advances past it.
  skippedRoastDate?: string | null;
  // Roast date (YYYY-MM-DD) the customer asked to order right away. It makes
  // that roast chargeable before its normal renewal window opens.
  orderNowRoastDate?: string | null;
}

export type SubscriptionCadence =
  | "every-session"
  | "every-other-session"
  | "every-third-session";

const CADENCE_STEPS: Record<SubscriptionCadence, number> = {
  "every-session": 1,
  "every-other-session": 2,
  "every-third-session": 3,
};

/** What the renewal processor must do for a subscription right now. */
export type RenewalAction = "none" | "charge" | "advance-skipped";

const REMINDER_LEAD_DAYS = 3;

/** Pure subscription domain rules. No account, prior-order, or API state. */
export class SubscriptionService {
  static roastDateKey(value: string): string {
    return value.slice(0, 10);
  }

  /** Whether the customer skipped the upcoming roast. */
  static isSkipped(subscription: RenewalState): boolean {
    return (
      !!subscription.skippedRoastDate &&
      subscription.skippedRoastDate ===
        SubscriptionService.roastDateKey(subscription.upcomingRoastDate)
    );
  }

  /** Whether the upcoming roast should be charged and fulfilled. */
  static isRenewable(subscription: RenewalState): boolean {
    return (
      subscription.status === "active" &&
      !SubscriptionService.isSkipped(subscription)
    );
  }

  /** Whether the customer asked to order the upcoming roast right away. */
  static isOrderNowRequested(subscription: RenewalState): boolean {
    return (
      !!subscription.orderNowRoastDate &&
      subscription.orderNowRoastDate ===
        SubscriptionService.roastDateKey(subscription.upcomingRoastDate)
    );
  }

  /**
   * The single eligibility rule shared by the scheduler, the renewal claim,
   * and reminders. A due, skipped roast advances without a charge; an
   * order-now request is charged immediately.
   */
  static dueAction(
    subscription: RenewalState,
    now: Date = new Date(),
  ): RenewalAction {
    if (subscription.status !== "active") return "none";
    if (SubscriptionService.isOrderNowRequested(subscription)) return "charge";
    if (!isRoastDateDue(subscription.upcomingRoastDate, now)) return "none";
    return SubscriptionService.isSkipped(subscription)
      ? "advance-skipped"
      : "charge";
  }

  /** Whether the pre-charge reminder window has opened for a renewable roast. */
  static isReminderDue(
    subscription: RenewalState,
    now: Date = new Date(),
  ): boolean {
    const roastDate = SubscriptionService.roastDateKey(
      subscription.upcomingRoastDate,
    );
    return (
      SubscriptionService.isRenewable(subscription) &&
      calendarDateOffset(roastDate, -REMINDER_LEAD_DAYS) <=
        pacificCalendarDate(now)
    );
  }

  /**
   * Order number for one subscription's roast. Deterministic, so every retry of
   * a renewal refers to the same order and the same Stripe payment.
   */
  static renewalOrderId(subscriptionId: string, roastDate: string): string {
    return createHash("sha256")
      .update(
        `${subscriptionId}:${SubscriptionService.roastDateKey(roastDate)}`,
      )
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();
  }

  static isDue(
    upcomingRoastDate: string,
    today: string,
    leadDays = 0,
  ): boolean {
    const [year, month, day] = SubscriptionService.roastDateKey(
      upcomingRoastDate,
    )
      .split("-")
      .map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - leadDays);
    return date.toISOString().slice(0, 10) <= today;
  }

  /**
   * The earliest roast session still taking orders. Orders close at 11:59pm
   * Pacific the day before a roast, so anything placed on a roast day goes to
   * the next one. Renewals for a roast are charged once its orders close.
   */
  static earliestOpenSession(calendar: string[], today: string): string | null {
    return (
      calendar.find((date) => SubscriptionService.roastDateKey(date) > today) ||
      null
    );
  }

  static nextSession(
    calendar: string[],
    currentRoastDate: string,
    cadence: SubscriptionCadence,
    today: string,
    leadDays = 0,
  ): string | null {
    const current = SubscriptionService.roastDateKey(currentRoastDate);
    const currentIndex = calendar.reduce(
      (latest, value, index) =>
        SubscriptionService.roastDateKey(value) <= current ? index : latest,
      -1,
    );
    if (currentIndex < 0) return null;
    const step = CADENCE_STEPS[cadence];
    for (
      let index = currentIndex + step;
      index < calendar.length;
      index += step
    ) {
      if (!SubscriptionService.isDue(calendar[index], today, leadDays))
        return calendar[index];
    }
    return null;
  }
}

export interface RecurringOrderItemInput {
  itemName: string;
  itemSku: string;
  bagCount: number;
  weight: string;
  unitAmount: number;
  addOnWeight?: number;
}

/** Creates an order snapshot solely from the saved subscription configuration. */
export class RecurringOrderService {
  /**
   * Inventory quantity, matching checkout: pounds for partner (-WS) coffee,
   * bag count for everything else.
   */
  static internalQuantity(subscription: RecurringOrderItemInput): number {
    if (!subscription.itemSku.endsWith("-WS")) return subscription.bagCount;
    return (
      weightInPounds(subscription.weight) * subscription.bagCount +
      (subscription.addOnWeight || 0)
    );
  }

  static items(subscription: RecurringOrderItemInput) {
    return [
      {
        name: subscription.itemName,
        sku: subscription.itemSku,
        quantity: subscription.bagCount,
        internalQuantity: RecurringOrderService.internalQuantity(subscription),
        price: subscription.unitAmount / 100,
        selections: { weight: subscription.weight },
      },
    ];
  }

  static summary(subscription: RecurringOrderItemInput): string {
    const addOn = subscription.addOnWeight
      ? ` + ${subscription.addOnWeight} lb add-on`
      : "";
    return `${subscription.bagCount}x ${subscription.itemName} (${subscription.weight})${addOn}`;
  }
}
