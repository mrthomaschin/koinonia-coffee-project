/** Aliases of the published Resend templates (resend.com/templates). */
export const RESEND_TEMPLATES = {
  contactForm: "contact-form",
  newOrderNotification: "new-order-notification",
  orderConfirmation: "order-confirmation",
  orderShipped: "order-shipped",
  orderOutForDelivery: "order-out-for-delivery",
  orderDelivered: "order-delivered",
  orderReadyForPickup: "order-ready-for-pickup",
  orderPickedUp: "order-picked-up",
  subscriptionRenewalReminder: "subscription-renewal-reminder",
  verifyEmail: "verify-email",
  reviewRequest: "review-request",
} as const;

export type ResendTemplate = typeof RESEND_TEMPLATES[keyof typeof RESEND_TEMPLATES];

export const escapeHtml = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/**
 * Resend inserts {{{variables}}} without escaping, while EmailJS escaped {{variables}}.
 * Escape every value except prebuilt markup (keys ending in `_html`) to keep that behavior.
 * Missing values are left out so the template's fallback applies.
 */
const toTemplateVariables = (variables: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(variables)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, key.endsWith("_html") ? String(value) : escapeHtml(String(value))]));

/** Resend rejects template sends where any variable value is longer than this. */
const MAX_TEMPLATE_VARIABLE_LENGTH = 2000;

interface PublishedTemplate {
  html: string;
  subject: string | null;
  from: string | null;
  reply_to: string[] | null;
  variables: { key: string; fallback_value: string | number | null }[];
}

const resendRequest = async (apiKey: string, path: string, init: RequestInit, errorPrefix: string): Promise<Response> => {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${errorPrefix}: ${response.status} - ${await response.text()}`);
  }
  return response;
};

const fillTemplate = (content: string, values: Record<string, string>): string =>
  content.replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_match, key: string) => values[key] ?? "");

/**
 * Sends a published Resend template while preserving the provider's response errors.
 * `subject` overrides the template's subject; pass it when the subject holds user text,
 * since escaped variables would show as entities in a plain-text subject line.
 *
 * Long values (item lists, long messages) exceed Resend's per-variable limit. Those emails
 * are filled in here from the published template and sent as HTML, so the template in
 * Resend stays the single source for every email.
 */
export const sendResendTemplate = async (
  params: { to: string | string[]; template: ResendTemplate; variables: Record<string, unknown>; replyTo?: string; subject?: string },
  errorPrefix = "Resend API error",
): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error(`${errorPrefix}: RESEND_API_KEY is not configured`);
  const variables = toTemplateVariables(params.variables);
  const recipient = {
    to: params.to,
    ...(params.replyTo ? { reply_to: params.replyTo } : {}),
  };

  if (Object.values(variables).every((value) => value.length <= MAX_TEMPLATE_VARIABLE_LENGTH)) {
    await resendRequest(apiKey, "/emails", {
      method: "POST",
      body: JSON.stringify({
        ...recipient,
        template: { id: params.template, variables },
        ...(params.subject ? { subject: params.subject } : {}),
      }),
    }, errorPrefix);
    return;
  }

  const template = await (await resendRequest(apiKey, `/templates/${params.template}`, { method: "GET" }, errorPrefix))
    .json() as PublishedTemplate;
  const fallbacks = Object.fromEntries(template.variables
    .filter((variable) => variable.fallback_value !== null)
    .map((variable) => [variable.key, String(variable.fallback_value)]));
  const htmlValues = { ...fallbacks, ...variables };
  // Subjects are plain text, so they take the values before HTML escaping.
  const subjectValues = { ...fallbacks, ...Object.fromEntries(Object.entries(params.variables)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)])) };
  if (!template.from) throw new Error(`${errorPrefix}: template ${params.template} has no sender`);
  await resendRequest(apiKey, "/emails", {
    method: "POST",
    body: JSON.stringify({
      reply_to: template.reply_to?.length ? template.reply_to : undefined,
      ...recipient,
      from: template.from,
      subject: params.subject || fillTemplate(template.subject || "", subjectValues),
      html: fillTemplate(template.html, htmlValues),
    }),
  }, errorPrefix);
};
