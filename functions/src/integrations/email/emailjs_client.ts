export interface EmailJsCredentials {
  serviceId: string;
  publicKey: string;
  privateKey: string;
}

/** Sends an EmailJS request while preserving the provider's response errors. */
export const sendEmailJs = async (
  credentials: EmailJsCredentials,
  templateId: string,
  templateParams: Record<string, unknown>,
  errorPrefix = "EmailJS API error",
): Promise<void> => {
  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: credentials.serviceId,
      template_id: templateId,
      user_id: credentials.publicKey,
      accessToken: credentials.privateKey,
      template_params: templateParams,
    }),
  });
  if (!response.ok) {
    throw new Error(`${errorPrefix}: ${response.status} - ${await response.text()}`);
  }
};
