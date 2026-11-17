/**
 * Marketing newsletters. Each one is a Resend topic (resend.com/audience/topics),
 * so subscribers can opt in or out of each separately, including from Resend's
 * hosted unsubscribe page. Every subscriber is also added to one Resend segment;
 * a broadcast targets that segment plus the newsletter's topic.
 *
 * To add a newsletter: create a topic in Resend with "opt_out" as the default
 * subscription, then add an entry here. The account page and the API list every
 * entry automatically.
 */
export const NEWSLETTER_SEGMENT_ID = "89092484-bb8c-4a23-b217-be454d0e04f1";

export const NEWSLETTERS = {
  monthly: {
    name: "Monthly newsletter",
    description:
      "New coffees, events, and stories from the roastery, once a month.",
    topicId: "264527a7-b014-4e03-bd35-4a86b989ef8d",
  },
} as const;

export type NewsletterId = keyof typeof NEWSLETTERS;
export const NEWSLETTER_IDS = Object.keys(NEWSLETTERS) as NewsletterId[];
/** The newsletter the site's signup forms subscribe people to. */
export const DEFAULT_NEWSLETTER: NewsletterId = "monthly";

export const isNewsletterId = (value: unknown): value is NewsletterId =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(NEWSLETTERS, value);

/**
 * The first-order discount for new subscribers. Each subscriber gets their own
 * code (PREFIX-XXXXXXXX, see welcome_code_repository.ts) that works only with
 * the email they subscribed with, once, on their first order, without other
 * discounts, through the end of the `validDays`th day after signing up
 * (Pacific). A reminder goes out `reminderDaysLeft` days before it expires.
 *
 * These codes don't have Notion rows; this is where their percentage and
 * rules live. The old shared code (NEWSLETTER10) still works from its Notion
 * row until it's switched off there.
 */
export const WELCOME_DISCOUNT = {
  prefix: "WELCOME",
  percentOff: 10,
  validDays: 7,
  reminderDaysLeft: 2,
} as const;
