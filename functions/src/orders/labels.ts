import { getEasyPostClient } from "../integrations/easypost/easypost_client";
import { createLogger } from "../logger";
import type { StaffMember } from "../admin/staff_repository";
import { Address, fetchShippingRates, Parcel, ShippingRate } from "../services/easypost_service";
import { AdminOrder } from "./order_model";
import { OrderRepository } from "./order_repository";
import { storeCurrentLabel } from "./order_documents";
import { autoPrintLabel } from "./printing";
import { carrierName } from "./order_store";

/**
 * Shipping labels from the order page: see the current label, get rates for
 * a new one (another box, weight, service or a corrected address), buy it, and
 * void the label it replaces.
 */
const logger = createLogger("labels");

/** The boxes checkout chooses from (domain/shipping/parcel_rules). */
export const BOXES = [
  { id: "6x4x2", label: "Small · 6×4×2", length: 6, width: 4, height: 2 },
  { id: "8x6x3", label: "Medium · 8×6×3", length: 8, width: 6, height: 3 },
  { id: "10x8x4", label: "Large · 10×8×4", length: 10, width: 8, height: 4 },
  { id: "12x10x6", label: "X-large · 12×10×6", length: 12, width: 10, height: 6 },
  { id: "18x14x10", label: "Bulk · 18×14×10", length: 18, width: 14, height: 10 },
] as const;

export class LabelError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface LabelInfo {
  address: Address | null;
  parcel: Parcel | null;
  label: {
    url: string;
    trackingNumber: string;
    carrier: string;
    service: string;
    rate: number | null;
    // EasyPost refund status once voided: "submitted", "refunded", "rejected".
    refundStatus: string | null;
  } | null;
}

const fromEasyPostAddress = (address: any): Address | null =>
  address?.street1 ? {
    name: address.name || undefined,
    street1: address.street1,
    street2: address.street2 || undefined,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country || "US",
    phone: address.phone || undefined,
    email: address.email || undefined,
  } as Address : null;

export const getLabelInfo = async (order: AdminOrder): Promise<LabelInfo> => {
  if (!order.shipmentId) return { address: null, parcel: null, label: null };
  const shipment: any = await getEasyPostClient().Shipment.retrieve(order.shipmentId);
  const parcel = shipment.parcel
    ? { length: shipment.parcel.length, width: shipment.parcel.width, height: shipment.parcel.height, weight: shipment.parcel.weight }
    : null;
  return {
    address: fromEasyPostAddress(shipment.to_address),
    parcel,
    label: shipment.postage_label?.label_url ? {
      url: shipment.postage_label.label_url,
      trackingNumber: shipment.tracking_code,
      carrier: shipment.selected_rate?.carrier || "",
      service: shipment.selected_rate?.service || "",
      rate: shipment.selected_rate?.rate ? Number(shipment.selected_rate.rate) : null,
      refundStatus: shipment.refund_status || null,
    } : null,
  };
};

const cleanAddress = (input: any, fallbackName: string): Address => {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const address: Address = {
    name: text(input?.name) || fallbackName,
    street1: text(input?.street1),
    city: text(input?.city),
    state: text(input?.state),
    zip: text(input?.zip),
    country: text(input?.country) || "US",
    ...(text(input?.street2) ? { street2: text(input.street2) } : {}),
    ...(text(input?.phone) ? { phone: text(input.phone) } : {}),
  } as Address;
  if (!address.street1 || !address.city || !address.state || !address.zip) {
    throw new LabelError(400, "Enter the full address: street, city, state and ZIP.");
  }
  return address;
};

/** Rates for a new label. Creates a new EasyPost shipment; nothing is bought yet. */
export const quoteLabel = async (
  order: AdminOrder,
  input: { address: unknown; boxId: string; weightOunces: number },
): Promise<{ shipmentId: string; rates: ShippingRate[] }> => {
  if (order.isLocalPickup) throw new LabelError(400, "This is a pickup order.");
  const box = BOXES.find((candidate) => candidate.id === input.boxId);
  if (!box) throw new LabelError(400, "Choose a box.");
  if (!(input.weightOunces > 0 && input.weightOunces < 1600)) throw new LabelError(400, "Enter the package weight in ounces.");
  const address = cleanAddress(input.address, order.customerName);
  try {
    const { shipmentId, rates } = await fetchShippingRates(
      address,
      undefined,
      { length: box.length, width: box.width, height: box.height, weight: Math.round(input.weightOunces) },
      `order-${order.id}`,
    );
    return { shipmentId, rates: rates.sort((a, b) => a.rate - b.rate) };
  } catch (error) {
    throw new LabelError(400, (error as Error).message.replace(/^Address verification failed: /, "EasyPost couldn't verify the address: "));
  }
};

const voidShipment = async (shipmentId: string): Promise<string> => {
  const refunded: any = await getEasyPostClient().Shipment.refund(shipmentId);
  return refunded.refund_status || "submitted";
};

/**
 * Buys the chosen rate on a shipment from quoteLabel and puts the label on the
 * order. `voidPrevious` asks EasyPost to refund the label it replaces.
 */
export const buyLabel = async (
  order: AdminOrder,
  staff: StaffMember,
  input: { shipmentId: string; rateId: string; voidPrevious: boolean },
): Promise<AdminOrder> => {
  if (!input.shipmentId.startsWith("shp_") || !input.rateId.startsWith("rate_")) throw new LabelError(400, "Choose a rate.");
  const client = getEasyPostClient();
  const shipment: any = await client.Shipment.retrieve(input.shipmentId);
  // Rates from quoteLabel carry the order number; another order's rates can't be bought here.
  if (shipment.reference?.startsWith("order-") && shipment.reference !== `order-${order.id}`) {
    throw new LabelError(400, "Those rates belong to another order. Get rates again.");
  }
  // Buying is idempotent: a shipment that already has a label is reused.
  const bought: any = shipment.postage_label?.label_url ? shipment : await client.Shipment.buy(shipment.id, input.rateId);

  const previous = order.shipmentId && order.shipmentId !== bought.id ? order.shipmentId : null;
  let voidStatus: string | null = null;
  if (previous && input.voidPrevious) {
    try {
      voidStatus = await voidShipment(previous);
    } catch (error) {
      // The new label is bought either way; say so rather than fail.
      voidStatus = `failed: ${(error as Error).message}`;
      logger.warn("Couldn't void the previous label", { orderId: order.id, shipmentId: previous });
    }
  }

  const carrier = bought.selected_rate?.carrier || "";
  const changes = {
    shipmentId: bought.id,
    shippingRateId: bought.selected_rate?.id || input.rateId,
    trackingNumber: bought.tracking_code,
    trackingLabelUrl: bought.postage_label.label_url,
    shippingCarrier: carrier,
    trackingCarrier: carrierName({ shippingCarrier: carrier }),
    shippingService: bought.selected_rate?.service || null,
    shippingLabelPrice: bought.selected_rate?.rate ? Number(bought.selected_rate.rate) : null,
    shippingBox: bought.parcel ? `${bought.parcel.length}x${bought.parcel.width}x${bought.parcel.height}` : order.shippingBox,
    shippingAddress: [bought.to_address?.street1, bought.to_address?.street2, bought.to_address?.city,
      bought.to_address?.state, bought.to_address?.zip, bought.to_address?.country].filter(Boolean).join(", ") || order.shippingAddress,
  };
  await OrderRepository.update(order.id, changes as Partial<AdminOrder>);
  await storeCurrentLabel(order.id);
  await OrderRepository.addEvent(order.id, {
    type: "label",
    actor: { email: staff.email, name: staff.name },
    message: `Bought a ${changes.trackingCarrier} ${changes.shippingService || ""} label`.replace(/\s+/g, " ").trim() +
      (changes.shippingLabelPrice !== null ? ` ($${changes.shippingLabelPrice.toFixed(2)})` : "") +
      (previous ? (input.voidPrevious ? ` and voided the previous label${voidStatus?.startsWith("failed") ? ` (void ${voidStatus})` : ""}` : "; the previous label was kept") : ""),
    data: { shipmentId: bought.id, trackingNumber: changes.trackingNumber, previousShipmentId: previous, voidStatus },
  });
  // A replacement label prints straight away when auto-print is on.
  if (bought.id !== order.shipmentId) await autoPrintLabel(order.id, bought.id);
  return (await OrderRepository.get(order.id))!;
};

/** Voids the order's current label (EasyPost refunds unused postage). */
export const voidCurrentLabel = async (order: AdminOrder, staff: StaffMember): Promise<string> => {
  if (!order.shipmentId) throw new LabelError(400, "This order has no label.");
  let status: string;
  try {
    status = await voidShipment(order.shipmentId);
  } catch (error) {
    throw new LabelError(400, `EasyPost couldn't void this label: ${(error as Error).message}`);
  }
  await OrderRepository.addEvent(order.id, {
    type: "label",
    actor: { email: staff.email, name: staff.name },
    message: `Voided the label ${order.trackingNumber || ""} (refund ${status})`.replace(/\s+/g, " "),
    data: { shipmentId: order.shipmentId, voidStatus: status },
  });
  return status;
};
