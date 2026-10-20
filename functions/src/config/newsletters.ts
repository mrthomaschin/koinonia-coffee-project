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
 * The code shown to new subscribers and sent in their welcome email. Its rules
 * (first order only, no other discounts) live on its row in the Notion
 * discount codes database and are checked when it's used; keep the percentage
 * here in step with that row.
 */
export const WELCOME_DISCOUNT = {
  code: "NEWSLETTER10",
  percentOff: 10,
} as const;
