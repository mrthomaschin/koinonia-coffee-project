/** Pure subscription domain rules. No account, prior-order, or API state. */
export class SubscriptionService {
  static roastDateKey(value: string): string {
    return value.slice(0, 10);
  }

  static isDue(upcomingRoastDate: string, today: string, leadDays = 4): boolean {
    const [year, month, day] = SubscriptionService.roastDateKey(upcomingRoastDate).split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() - leadDays);
    return date.toISOString().slice(0, 10) <= today;
  }

  static nextSession(calendar: string[], currentRoastDate: string, cadence: "every-session" | "every-other-session", today: string, leadDays = 4): string | null {
    const current = SubscriptionService.roastDateKey(currentRoastDate);
    const currentIndex = calendar.reduce((latest, value, index) =>
      SubscriptionService.roastDateKey(value) <= current ? index : latest, -1);
    if (currentIndex < 0) return null;
    const step = cadence === "every-session" ? 1 : 2;
    for (let index = currentIndex + step; index < calendar.length; index += step) {
      if (!SubscriptionService.isDue(calendar[index], today, leadDays)) return calendar[index];
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
}

/** Creates an order snapshot solely from the saved subscription configuration. */
export class RecurringOrderService {
  static items(subscription: RecurringOrderItemInput) {
    return [{ name: subscription.itemName, sku: subscription.itemSku, quantity: subscription.bagCount,
      internalQuantity: subscription.bagCount, price: subscription.unitAmount / 100,
      selections: { weight: subscription.weight } }];
  }

  static summary(subscription: RecurringOrderItemInput): string {
    return `${subscription.bagCount}x ${subscription.itemName} (${subscription.weight})`;
  }
}
