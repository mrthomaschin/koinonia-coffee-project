import { getDatabase } from "../integrations/firebase_admin";
import { createLogger } from "../logger";
import type { StaffMember } from "../admin/staff_repository";
import { EmailService } from "../services/email_service";
import { newOrderId } from "./checkout_orders";
import { AdminOrder, newPaidOrderStatus } from "./order_model";
import { generateReceipt } from "./order_documents";
import { OrderRepository } from "./order_repository";

/**
 * Orders staff create in the dashboard: comps and gifts, in-person and phone
 * sales, invoices. They live in orders/{id} like every other order (source
 * "manual"), so status emails, labels, refunds and customer history all work.
 */
const logger = createLogger("manual_orders");

export const PAYMENT_METHODS = ["cash", "venmo", "square", "stripe", "comp", "invoice", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const DELIVERY_METHODS = ["pickup", "shipping", "in_person"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export class ManualOrderError extends Error {}

/** Products staff can add, from the website inventory cache. */
export const catalog = async () => {
  const cached = (await getDatabase().collection("inventory_cache").doc("latest").get()).data();
  const items: any[] = Array.isArray(cached?.items) ? cached!.items : [];
  return items.flatMap((item) => {
    const variants: any[] = Array.isArray(item.variants) ? item.variants : [];
    const image = item.firebaseImageUrls?.[0] || item.thumbnailUrls?.[0] || null;
    if (!variants.length) {
      return [{ sku: item.sku, name: item.name, variation: "", price: Number(item.price) || 0, image, itemType: item.itemType || "" }];
    }
    return variants
      .filter((variant) => variant?.sku)
      .map((variant) => ({
        sku: variant.sku,
        name: item.name,
        variation: [variant.weight, variant.size, variant.color].filter(Boolean).join(", "),
        price: Number(variant.price) || Number(item.price) || 0,
        image,
        itemType: item.itemType || "",
      }));
  });
};

const text = (value: unknown, max = 500): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const money = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : NaN;
};

export interface ManualOrderInput {
  customer: { name: string; email: string; phone: string };
  items: Array<{ sku: string; name: string; variation: string; quantity: number; price: number }>;
  delivery: { method: DeliveryMethod; shippingAddress: string; orderPickupId: string };
  payment: { method: PaymentMethod; paid: boolean; reference: string };
  shipping: number;
  tax: number;
  discount: number;
  orderDate: string | null;
  note: string;
  sendConfirmation: boolean;
}

/** Validates the dashboard's form. Throws ManualOrderError with a message to show. */
export const parseManualOrder = (body: any): ManualOrderInput => {
  const customer = {
    name: text(body?.customer?.name, 120),
    email: text(body?.customer?.email, 254).toLowerCase(),
    phone: text(body?.customer?.phone, 40),
  };
  if (!customer.name) throw new ManualOrderError("Enter the customer's name.");
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new ManualOrderError("That email doesn't look right.");

  const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 50).map((item: any) => ({
    sku: text(item?.sku, 80),
    name: text(item?.name, 160),
    variation: text(item?.variation, 120),
    quantity: Math.round(Number(item?.quantity)),
    price: money(item?.price),
  }));
  if (!items.length) throw new ManualOrderError("Add at least one item.");
  for (const item of items) {
    if (!item.name) throw new ManualOrderError("Every item needs a name.");
    if (!(item.quantity >= 1 && item.quantity <= 999)) throw new ManualOrderError(`Check the quantity for ${item.name}.`);
    if (Number.isNaN(item.price)) throw new ManualOrderError(`Check the price for ${item.name}.`);
  }

  const method = body?.delivery?.method as DeliveryMethod;
  if (!(DELIVERY_METHODS as readonly string[]).includes(method)) throw new ManualOrderError("Choose how the order gets to the customer.");
  const shippingAddress = text(body?.delivery?.shippingAddress);
  if (method === "shipping" && !shippingAddress) throw new ManualOrderError("Enter the shipping address.");

  const paymentMethod = body?.payment?.method as PaymentMethod;
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) throw new ManualOrderError("Choose how it was paid.");

  const shipping = money(body?.shipping ?? 0);
  const tax = money(body?.tax ?? 0);
  const discount = money(body?.discount ?? 0);
  if ([shipping, tax, discount].some(Number.isNaN)) throw new ManualOrderError("Check the shipping, tax and discount amounts.");

  const orderDate = text(body?.orderDate, 10);
  if (orderDate && !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) throw new ManualOrderError("Check the order date.");

  return {
    customer,
    items,
    delivery: { method, shippingAddress, orderPickupId: text(body?.delivery?.orderPickupId, 120) },
    payment: {
      method: paymentMethod,
      // A comp is settled by definition; an invoice starts unpaid unless marked paid.
      paid: paymentMethod === "comp" ? true : body?.payment?.paid !== false,
      reference: text(body?.payment?.reference, 120),
    },
    shipping,
    tax,
    discount,
    orderDate: orderDate || null,
    note: text(body?.note, 4000),
    sendConfirmation: body?.sendConfirmation === true && !!customer.email,
  };
};

const cents = (value: number) => Math.round(value * 100);

export const createManualOrder = async (input: ManualOrderInput, staff: StaffMember): Promise<AdminOrder> => {
  const subtotal = input.items.reduce((sum, item) => sum + cents(item.price) * item.quantity, 0);
  const totalCents = subtotal + cents(input.shipping) + cents(input.tax) - cents(input.discount);
  if (totalCents < 0) throw new ManualOrderError("The discount is more than the order total.");

  const id = await newOrderId();
  const now = new Date().toISOString();
  // A date picked in the form is a Pacific calendar day; noon keeps it on that day.
  const createdAt = input.orderDate ? new Date(`${input.orderDate}T12:00:00-08:00`).toISOString() : now;
  const isPickup = input.delivery.method !== "shipping";
  const status = newPaidOrderStatus();
  const items = input.items.map((item) => ({
    name: item.name,
    sku: item.sku,
    quantity: item.quantity,
    internalQuantity: item.quantity,
    price: item.price,
    selections: item.variation ? { variations: item.variation } : {},
  }));

  const order = {
    ...status,
    id,
    origin: "firestore",
    source: "manual",
    seq: null,
    customerName: input.customer.name,
    email: input.customer.email,
    emailNormalized: input.customer.email,
    phone: input.customer.phone || null,
    createdAt,
    status: input.payment.paid ? "completed" : "pending",
    paymentStatus: input.payment.paid ? "paid" : "pending",
    // Handed over in person: nothing left to fulfill or email about.
    fulfillmentStatus: input.delivery.method === "in_person" ? "picked_up" : "pending",
    emails: {
      ...status.emails,
      orderConfirmed: false,
      ...(input.delivery.method === "in_person" ? { pickedUp: true, readyForPickup: true, delivered: true } : {}),
    },
    totalAmount: totalCents / 100,
    subtotal: subtotal / 100,
    shippingCharged: input.shipping,
    taxAmount: input.tax,
    discountAmount: input.discount,
    discountCode: null,
    shippingLabelPrice: null,
    firstTimer: false,
    items,
    itemsSummary: items.map((item) =>
      `${item.quantity}x ${item.name}${item.selections.variations ? ` (${item.selections.variations})` : ""}`).join("\n"),
    isLocalPickup: isPickup,
    orderPickupId: input.delivery.method === "pickup" ? input.delivery.orderPickupId || null : null,
    shippingAddress: isPickup ? null : input.delivery.shippingAddress,
    shippingBox: null,
    shipmentId: null,
    trackingNumber: null,
    trackingCarrier: null,
    shippingService: null,
    trackingLabelUrl: null,
    paymentIntentId: null,
    paymentMethod: input.payment.method,
    paymentReference: input.payment.reference || null,
    receiptUrl: null,
    notion: null,
    createdBy: { email: staff.email, name: staff.name },
    updatedAt: now,
    adminUpdatedAt: now,
  };
  await getDatabase().collection("orders").doc(id).create(order);

  const actor = { email: staff.email, name: staff.name };
  await OrderRepository.addEvent(id, {
    type: "note",
    actor,
    message: `Created by hand (${input.payment.method}${input.payment.paid ? "" : ", unpaid"}${input.payment.reference ? ` · ${input.payment.reference}` : ""})` +
      (input.note ? `\n${input.note}` : ""),
  });

  // Receipt for staff (Cloud Storage). Best-effort.
  if (input.payment.paid) await generateReceipt(id);

  // Best-effort confirmation email.
  if (input.sendConfirmation) {
    try {
      await EmailService.sendCustomerConfirmation({
        customerEmail: input.customer.email,
        customerName: input.customer.name,
        items: items.map((item) => ({
          name: item.name, sku: item.sku, quantity: item.quantity, price: item.price,
          ...(item.selections.variations ? { variations: item.selections.variations } : {}),
        })),
        subtotal: subtotal / 100,
        ...(input.discount ? { discountAmount: input.discount } : {}),
        shipping: input.shipping,
        tax: input.tax,
        totalAmount: totalCents / 100,
        orderDate: createdAt,
        orderId: id,
      });
      await OrderRepository.update(id, { emails: { orderConfirmed: true } } as Record<string, unknown>);
      await OrderRepository.addEvent(id, { type: "email", actor: null, message: `Order confirmation sent to ${input.customer.email}` });
    } catch (error) {
      logger.warn("Couldn't send manual order confirmation", { orderId: id, error: (error as Error).message });
      await OrderRepository.addEvent(id, { type: "email", actor: null, message: `Order confirmation couldn't be sent: ${(error as Error).message}` });
    }
  }
  return (await OrderRepository.get(id))!;
};
