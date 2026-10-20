import { createLogger } from "../util/logger";

const logger = createLogger("EmailService");

interface ContactFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
}

interface PurchaseItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  variations?: string;
  image?: string;
}

interface PurchaseNotificationData {
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
  items: PurchaseItem[];
  subtotal?: number;
  discountCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  totalAmount: number;
  orderDate: string;
  sessionId: string;
  shippingAddress?: string;
  billingAddress?: string;
  shippingMethod?: string;
  isLocalPickup?: boolean;
}

interface CustomerConfirmationData {
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  items: PurchaseItem[];
  subtotal: number;
  discountCode?: string;
  discountPercent?: number;
  discountAmount?: number;
  shipping: number;
  tax: number;
  totalAmount: number;
  orderDate: string;
  orderId: string;
}

const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

// Emails are sent by the backend through Resend, which keeps the API key off the browser.
const postEmail = async (path: string, payload: unknown): Promise<void> => {
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      `Email request failed: ${response.status} - ${await response.text()}`,
    );
  }
};

export const submitContactForm = async (
  formData: ContactFormData,
): Promise<void> => {
  try {
    await postEmail("/email/contact", formData);
  } catch (error) {
    logger.error("Error sending email:", error);
    throw error;
  }
};

export const sendPurchaseNotification = async (
  purchaseData: PurchaseNotificationData,
): Promise<void> => {
  try {
    logger.log("Sending purchase notification with data:", purchaseData);
    await postEmail("/email/purchase-notification", purchaseData);
  } catch (error) {
    logger.error("Error sending purchase notification email:", error);
    throw error;
  }
};

export const sendCustomerConfirmation = async (
  confirmationData: CustomerConfirmationData,
): Promise<void> => {
  try {
    logger.log("Sending customer confirmation:", confirmationData);
    await postEmail("/email/customer-confirmation", confirmationData);
  } catch (error) {
    logger.error("Error sending customer confirmation email:", error);
    throw error;
  }
};
