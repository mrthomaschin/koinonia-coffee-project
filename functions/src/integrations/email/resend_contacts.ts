import { resendRequest } from "./resend_client";

/**
 * Resend contacts, segments, and topics (resend.com/docs/api-reference/contacts).
 * Resend looks contacts up by exact email, so callers pass lowercased addresses.
 */

const ERROR_PREFIX = "Resend contacts API error";

export type TopicSubscription = "opt_in" | "opt_out";

export interface ResendContact {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  // True after "unsubscribe from all": no broadcast reaches the contact, whatever its topics say.
  unsubscribed: boolean;
}

const apiKey = (): string => {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    throw new Error(`${ERROR_PREFIX}: RESEND_API_KEY is not configured`);
  return key;
};

const contactPath = (email: string): string =>
  `/contacts/${encodeURIComponent(email)}`;

const send = (
  path: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [],
): Promise<Response> =>
  resendRequest(apiKey(), path, init, ERROR_PREFIX, allowedStatuses);

/** The contact for an email, or null when Resend has none. */
export const findContact = async (
  email: string,
): Promise<ResendContact | null> => {
  const response = await send(contactPath(email), { method: "GET" }, [404]);
  return response.status === 404
    ? null
    : ((await response.json()) as ResendContact);
};

export const createContact = async (contact: {
  email: string;
  firstName?: string;
  lastName?: string;
  segmentIds: string[];
  topics: { id: string; subscription: TopicSubscription }[];
}): Promise<void> => {
  await send("/contacts", {
    method: "POST",
    body: JSON.stringify({
      email: contact.email,
      first_name: contact.firstName || undefined,
      last_name: contact.lastName || undefined,
      unsubscribed: false,
      segments: contact.segmentIds.map((id) => ({ id })),
      topics: contact.topics,
    }),
  });
};

export const setContactUnsubscribed = async (
  email: string,
  unsubscribed: boolean,
): Promise<void> => {
  await send(contactPath(email), {
    method: "PATCH",
    body: JSON.stringify({ unsubscribed }),
  });
};

/** Adding a contact to a segment it is already in is a no-op. */
export const addContactToSegment = async (
  email: string,
  segmentId: string,
): Promise<void> => {
  await send(`${contactPath(email)}/segments/${segmentId}`, { method: "POST" });
};

/** Topic IDs the contact is opted in to. */
export const optedInTopicIds = async (email: string): Promise<Set<string>> => {
  const response = await send(`${contactPath(email)}/topics?limit=100`, {
    method: "GET",
  });
  const { data } = (await response.json()) as {
    data: { id: string; subscription: TopicSubscription }[];
  };
  return new Set(
    data
      .filter((topic) => topic.subscription === "opt_in")
      .map((topic) => topic.id),
  );
};

export const updateContactTopics = async (
  email: string,
  topics: { id: string; subscription: TopicSubscription }[],
): Promise<void> => {
  // The endpoint takes a bare array, not { topics: [...] }.
  await send(`${contactPath(email)}/topics`, {
    method: "PATCH",
    body: JSON.stringify(topics),
  });
};
