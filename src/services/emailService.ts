import emailjs from '@emailjs/browser';
import { createLogger } from '../util/logger';

const logger = createLogger('EmailService');

// Helper function to extract first name from full name
function getFirstName(fullName: string | undefined): string {
  if (!fullName) return 'Customer';
  const trimmed = fullName.trim();
  const firstSpace = trimmed.indexOf(' ');
  return firstSpace > 0 ? trimmed.substring(0, firstSpace) : trimmed;
}

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

export const submitContactForm = async (formData: ContactFormData): Promise<void> => {
  const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
  const templateId = process.env.REACT_APP_EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS configuration is missing. Please check your environment variables.');
  }

  try {
    const templateParams = {
      from_name: `${formData.firstName} ${formData.lastName}`,
      from_email: formData.email,
      subject: formData.subject,
      phone: formData.phone,
      message: formData.message,
      to_name: 'Koinonia Coffee Project',
    };

    await emailjs.send(serviceId, templateId, templateParams, publicKey);
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
};

export const sendPurchaseNotification = async (purchaseData: PurchaseNotificationData): Promise<void> => {
  const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
  const purchaseTemplateId = process.env.REACT_APP_EMAILJS_PURCHASE_TEMPLATE_ID;
  const publicKey = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

  logger.log('EmailJS Config Check:', {
    serviceId: serviceId ? '✓ Set' : '✗ Missing',
    purchaseTemplateId: purchaseTemplateId ? '✓ Set' : '✗ Missing',
    publicKey: publicKey ? '✓ Set' : '✗ Missing'
  });

  if (!serviceId || !purchaseTemplateId || !publicKey) {
    logger.error('EmailJS purchase notification configuration is missing.');
    throw new Error('EmailJS purchase notification configuration is missing. Please check your environment variables.');
  }

  try {
    logger.log('Preparing email with purchase data:', purchaseData);
    const itemsList = purchaseData.items
      .map((item, index) => {
        const itemNumber = `${index + 1}.`;
        const itemName = item.variations ? `${item.name} (${item.variations})` : item.name;
        const itemPrice = `$${item.price.toFixed(2)}`;
        const lineTotal = `$${(item.price * item.quantity).toFixed(2)}`;

        return [
          `${itemNumber} ${itemName}`,
          `   SKU: ${item.sku}`,
          `   Quantity: ${item.quantity}`,
          `   Unit Price: ${itemPrice}`,
          `   Line Total: ${lineTotal}`,
          ''
        ].join('\n');
      })
      .join('\n');

    const subtotal = purchaseData.subtotal || purchaseData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create a shorter order ID from session ID (last 8 characters)
    const orderId = purchaseData.sessionId.slice(-8).toUpperCase();

    const templateParams = {
      customer_email: purchaseData.customerEmail,
      customer_name: purchaseData.customerName || 'Customer',
      customer_phone: purchaseData.customerPhone || 'N/A',
      order_items: itemsList.trim(),
      subtotal: `$${subtotal.toFixed(2)}`,
      discount_code: purchaseData.discountCode || '',
      discount_percent: purchaseData.discountPercent || 0,
      discount_amount: purchaseData.discountAmount ? `$${purchaseData.discountAmount.toFixed(2)}` : '$0.00',
      has_discount: purchaseData.discountCode ? true : false,
      total_amount: `$${purchaseData.totalAmount.toFixed(2)}`,
      order_date: purchaseData.orderDate,
      order_id: orderId,
      session_id: purchaseData.sessionId,
      to_name: 'Koinonia Coffee Project',
    };

    logger.log('Sending email via EmailJS with params:', templateParams);
    const response = await emailjs.send(serviceId, purchaseTemplateId, templateParams, publicKey);
    logger.log('EmailJS response:', response);
  } catch (error) {
    logger.error('Error sending purchase notification email:', error);
    throw error;
  }
};

export const sendCustomerConfirmation = async (confirmationData: CustomerConfirmationData): Promise<void> => {
  const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
  const customerTemplateId = process.env.REACT_APP_EMAILJS_CUSTOMER_TEMPLATE_ID;
  const publicKey = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

  logger.log('EmailJS Customer Confirmation Config Check:', {
    serviceId: serviceId ? '✓ Set' : '✗ Missing',
    customerTemplateId: customerTemplateId ? '✓ Set' : '✗ Missing',
    publicKey: publicKey ? '✓ Set' : '✗ Missing'
  });

  if (!serviceId || !customerTemplateId || !publicKey) {
    logger.error('EmailJS customer confirmation configuration is missing.');
    throw new Error('EmailJS customer confirmation configuration is missing. Please check your environment variables.');
  }

  try {
    logger.log('Preparing customer confirmation email:', confirmationData);

    // Format items as HTML with inline images
    const itemsHtml = confirmationData.items
      .map((item, index) => {
        const itemName = item.variations ? `${item.name} (${item.variations})` : item.name;
        const lineTotal = item.price * item.quantity;

        // Convert relative URLs to absolute URLs
        let imageUrl = item.image || '';
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `https://koinoniacoffeeproject.com${imageUrl}`;
        }
        if (!imageUrl) {
          imageUrl = 'https://koinoniacoffeeproject.com/assets/logos/logo_circle.png';
        }

        return `
          <div style="display: table; width: 100%; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #f0f0f0;">
            <div style="display: table-cell; width: 80px; vertical-align: top;">
              <img src="${imageUrl}" alt="${item.name}" style="width: 64px; height: 64px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e5e5;">
            </div>
            <div style="display: table-cell; vertical-align: top; padding-left: 16px;">
              <div style="font-size: 14px; font-weight: 500; color: #000000; margin-bottom: 4px;">${itemName}</div>
              <div style="font-size: 13px; color: #666666; margin-bottom: 4px;">SKU: ${item.sku}</div>
              <div style="font-size: 13px; color: #666666; margin-bottom: 8px;">Qty: ${item.quantity}</div>
              <div style="font-size: 14px; font-weight: 500; color: #000000;">$${lineTotal.toFixed(2)}</div>
            </div>
          </div>
        `;
      })
      .join('');

    const templateParams = {
      to_email: confirmationData.customerEmail,
      customer_name: confirmationData.customerName,
      customer_first_name: getFirstName(confirmationData.customerName),
      customer_phone: confirmationData.customerPhone || 'N/A',
      order_id: confirmationData.orderId,
      order_date: confirmationData.orderDate,
      items_html: itemsHtml,
      subtotal: `$${confirmationData.subtotal.toFixed(2)}`,
      discount_code: confirmationData.discountCode || '',
      discount_percent: confirmationData.discountPercent || 0,
      discount_amount: confirmationData.discountAmount ? `$${confirmationData.discountAmount.toFixed(2)}` : '$0.00',
      has_discount: confirmationData.discountCode ? true : false,
      shipping: `$${confirmationData.shipping.toFixed(2)}`,
      tax: `$${confirmationData.tax.toFixed(2)}`,
      total: `$${confirmationData.totalAmount.toFixed(2)}`,
    };

    logger.log('Sending customer confirmation via EmailJS...');
    const response = await emailjs.send(serviceId, customerTemplateId, templateParams, publicKey);
    logger.log('Customer confirmation EmailJS response:', response);
  } catch (error) {
    logger.error('Error sending customer confirmation email:', error);
    throw error;
  }
};
