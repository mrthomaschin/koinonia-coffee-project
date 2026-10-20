/** Returns a date key in the Pacific calendar used by roast fulfillment. */
export const pacificCalendarDate = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** Adds calendar days without allowing timezone offsets to alter the date. */
export const calendarDateOffset = (dateValue: string, days: number): string => {
  const [year, month, day] = dateValue.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Whether a roast's orders have closed, so its renewals are charged. */
export const isRoastDateDue = (
  roastDate: string,
  now: Date = new Date(),
): boolean => roastDate.slice(0, 10) <= pacificCalendarDate(now);
