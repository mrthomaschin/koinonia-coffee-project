/** Converts the supported display-weight formats to pounds. */
export const weightInPounds = (value: string): number => {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return 0;
  const normalized = value.toLowerCase();
  if (normalized.includes("kg")) return amount * 2.20462;
  if (normalized.includes("g")) return amount / 453.592;
  if (normalized.includes("oz")) return amount / 16;
  return normalized.includes("lb") ? amount : 0;
};
