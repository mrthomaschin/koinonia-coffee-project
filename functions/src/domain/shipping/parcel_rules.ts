/** Parcel dimensions are measured in inches and weight in ounces. */
export interface SubscriptionParcel {
  length: number;
  width: number;
  height: number;
  weight: number;
  boxSize: string;
}

/** Preserves the subscription parcel-selection rules used by renewals. */
export const subscriptionParcel = (
  shippingWeight: number | undefined,
  displayWeight: string,
  quantity: number,
): SubscriptionParcel => {
  const sourceWeight = Number.isFinite(shippingWeight) && Number(shippingWeight) > 0
    ? Number(shippingWeight)
    : displayWeight;
  const weightText = String(sourceWeight).toLowerCase().trim();
  const numericWeight = typeof sourceWeight === "number"
    ? sourceWeight
    : Number.parseFloat(weightText.match(/\d+(?:\.\d+)?/)?.[0] || "0");
  const itemWeightOunces = typeof sourceWeight === "number"
    ? sourceWeight === 200 ? 7 : sourceWeight === 5 ? 80 : sourceWeight / 28.35
    : weightText.includes("lb") ? numericWeight * 16
      : weightText.includes("oz") ? numericWeight
        : weightText.includes("g") || numericWeight > 100 ? numericWeight / 28.35
          : numericWeight;
  const totalWeightOunces = itemWeightOunces * quantity;
  const box = totalWeightOunces <= 12 ? { length: 6, width: 4, height: 2, boxWeight: 4 }
    : totalWeightOunces <= 28 ? { length: 8, width: 6, height: 3, boxWeight: 6 }
      : totalWeightOunces <= 96 ? { length: 10, width: 8, height: 4, boxWeight: 8 }
        : totalWeightOunces <= 160 ? { length: 12, width: 10, height: 6, boxWeight: 12 }
          : { length: 18, width: 14, height: 10, boxWeight: 20 };
  return {
    length: box.length,
    width: box.width,
    height: box.height,
    weight: Math.round(totalWeightOunces + box.boxWeight),
    boxSize: `${box.length}x${box.width}x${box.height}`,
  };
};
