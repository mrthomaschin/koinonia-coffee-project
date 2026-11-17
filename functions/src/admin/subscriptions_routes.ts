import { NextFunction, Request, Response, Router } from "express";
import { AccountAdmin } from "../services/account_service";
import { SubscriptionService } from "../services/subscription_domain";
import type { SubscriptionCadence } from "../services/subscription_domain";
import { AuditLog } from "./audit_log";
import { currentStaff, requirePermission } from "./admin_auth";

/**
 * Subscriptions in the admin dashboard: every subscriber, what's coming up at
 * the next roast, failed renewal payments, and the same controls customers
 * have (skip, frequency, cancel) plus pause and resume.
 */
type Handler = (req: Request, res: Response) => Promise<void>;
const route = (handler: Handler) => (req: Request, res: Response, next: NextFunction) =>
  handler(req, res).catch(next);

const CADENCES: SubscriptionCadence[] = ["every-session", "every-other-session", "every-third-session"];
const ACTIONS = ["skip", "unskip", "pause", "resume", "cancel", "frequency"] as const;
type Action = (typeof ACTIONS)[number];

const roastKey = (value: string) => SubscriptionService.roastDateKey(value || "");

const listAll = async () => {
  const [{ subscriptions, claims }, accounts] = await Promise.all([
    AccountAdmin.allSubscriptions(),
    AccountAdmin.list(),
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  return subscriptions.map((subscription) => {
    const account = accountsById.get(subscription.accountId);
    const claim = claims.get(subscription.id);
    const skipped = SubscriptionService.isSkipped(subscription);
    // A failed claim for the roast still upcoming means its renewal charge failed.
    const failing = claim?.status === "failed" && roastKey(claim.dueDate) === roastKey(subscription.upcomingRoastDate);
    const bagsPerRoast = subscription.bagCount;
    return {
      id: subscription.id,
      accountId: subscription.accountId,
      customer: {
        key: `acct_${subscription.accountId}`,
        name: account?.name || "",
        email: account?.email || "",
        label: account?.label || null,
      },
      itemName: subscription.itemName,
      itemSku: subscription.itemSku,
      weight: subscription.weight,
      bagCount: subscription.bagCount,
      cadence: subscription.cadence,
      status: subscription.status,
      unitAmount: subscription.unitAmount,
      discountPercent: subscription.discountPercent,
      freeShipping: subscription.freeShipping,
      isLocalPickup: !!subscription.isLocalPickup,
      upcomingRoastDate: roastKey(subscription.upcomingRoastDate),
      skipped,
      addOnWeight: subscription.addOnWeight || 0,
      createdAt: subscription.createdAt,
      bagsPerRoast,
      renewal: claim ? {
        status: failing ? "failed" : claim.status,
        dueDate: roastKey(claim.dueDate),
        lastError: failing ? claim.lastError || "Payment failed" : null,
      } : null,
    };
  });
};

export const subscriptionsRouter = Router();

subscriptionsRouter.get("/", requirePermission("subscriptions.read"), route(async (req, res) => {
  const all = await listAll();
  const status = String(req.query.status || "active");
  const q = String(req.query.q || "").trim().toLowerCase();
  const filtered = all
    .filter((subscription) => {
      if (status === "failing") return subscription.renewal?.status === "failed" && subscription.status === "active";
      if (status === "skipped") return subscription.status === "active" && subscription.skipped;
      if (status !== "all" && subscription.status !== status) return false;
      return true;
    })
    .filter((subscription) => !q || [subscription.customer.name, subscription.customer.email, subscription.itemName]
      .some((value) => value.toLowerCase().includes(q)))
    .sort((a, b) => a.upcomingRoastDate.localeCompare(b.upcomingRoastDate) || a.customer.name.localeCompare(b.customer.name));

  // What the next roast needs: active, not skipped, due on the earliest upcoming date.
  const active = all.filter((subscription) => subscription.status === "active");
  const nextRoast = active.map((subscription) => subscription.upcomingRoastDate).filter(Boolean).sort()[0] || null;
  const dueNext = active.filter((subscription) => subscription.upcomingRoastDate === nextRoast && !subscription.skipped);
  const byCoffee = new Map<string, { itemName: string; weight: string; bags: number }>();
  for (const subscription of dueNext) {
    const key = `${subscription.itemSku}|${subscription.weight}`;
    const entry = byCoffee.get(key) || { itemName: subscription.itemName, weight: subscription.weight, bags: 0 };
    entry.bags += subscription.bagsPerRoast;
    byCoffee.set(key, entry);
  }

  res.json({
    subscriptions: filtered,
    counts: {
      active: active.length,
      paused: all.filter((subscription) => subscription.status === "paused").length,
      canceled: all.filter((subscription) => subscription.status === "canceled").length,
      skipped: active.filter((subscription) => subscription.skipped).length,
      failing: active.filter((subscription) => subscription.renewal?.status === "failed").length,
      all: all.length,
    },
    nextRoast: nextRoast && {
      date: nextRoast,
      subscriptions: dueNext.length,
      skipped: active.filter((subscription) => subscription.upcomingRoastDate === nextRoast && subscription.skipped).length,
      bags: dueNext.reduce((sum, subscription) => sum + subscription.bagsPerRoast, 0),
      pickup: dueNext.filter((subscription) => subscription.isLocalPickup).length,
      byCoffee: [...byCoffee.values()].sort((a, b) => b.bags - a.bags),
      // Product revenue if every due renewal charges (before shipping and tax), in dollars.
      expectedRevenue: Math.round(dueNext.reduce((sum, subscription) => sum + subscription.unitAmount * subscription.bagCount, 0)) / 100,
    },
  });
}));

subscriptionsRouter.post("/:id/:action", requirePermission("subscriptions.edit"), route(async (req, res) => {
  const action = req.params.action as Action;
  if (!(ACTIONS as readonly string[]).includes(action)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const before = await AccountAdmin.subscription(req.params.id);
  if (!before) {
    res.status(404).json({ error: "Subscription not found." });
    return;
  }
  let updated;
  try {
    if (action === "frequency") {
      const cadence = req.body?.cadence as SubscriptionCadence;
      if (!CADENCES.includes(cadence)) {
        res.status(400).json({ error: "Choose a valid frequency." });
        return;
      }
      updated = await AccountAdmin.changeSubscription(before.id, { action, cadence });
    } else {
      updated = await AccountAdmin.changeSubscription(before.id, { action });
    }
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  await AuditLog.record(currentStaff(res), {
    action: `subscription.${action}`,
    target: { type: "subscription", id: before.id },
    before: { status: before.status, cadence: before.cadence, upcomingRoastDate: before.upcomingRoastDate, skippedRoastDate: before.skippedRoastDate ?? null },
    after: { status: updated.status, cadence: updated.cadence, upcomingRoastDate: updated.upcomingRoastDate, skippedRoastDate: updated.skippedRoastDate ?? null },
    note: `Customer ${before.accountId}`,
  });
  res.json({ ok: true });
}));
