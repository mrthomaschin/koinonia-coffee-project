import emailjs from '@emailjs/browser';

interface ContactFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  message: string;
}

interface PurchaseItem {
  name: string;
  sku: string;
  quantity: number;
  price: number;
  variations?: string;
}

interface PurchaseNotificationData {
  customerEmail: string;
  customerName?: string;
  items: PurchaseItem[];
  totalAmount: number;
  orderDate: string;
  sessionId: string;
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
      phone: formData.phone,
      message: formData.message,
      to_name: 'Koinonia Coffee Project',
    };

    await emailjs.send(serviceId, templateId, templateParams, publicKey);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendPurchaseNotification = async (purchaseData: PurchaseNotificationData): Promise<void> => {
  const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
  const purchaseTemplateId = process.env.REACT_APP_EMAILJS_PURCHASE_TEMPLATE_ID;
  const publicKey = process.env.REACT_APP_EMAILJS_PUBLIC_KEY;

  console.log('EmailJS Config Check:', {
    serviceId: serviceId ? '✓ Set' : '✗ Missing',
    purchaseTemplateId: purchaseTemplateId ? '✓ Set' : '✗ Missing',
    publicKey: publicKey ? '✓ Set' : '✗ Missing'
  });

  if (!serviceId || !purchaseTemplateId || !publicKey) {
    console.error('EmailJS purchase notification configuration is missing.');
    throw new Error('EmailJS purchase notification configuration is missing. Please check your environment variables.');
  }

  try {
    console.log('Preparing email with purchase data:', purchaseData);
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

    const subtotal = purchaseData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create a shorter order ID from session ID (last 8 characters)
    const orderId = purchaseData.sessionId.slice(-8).toUpperCase();

    const templateParams = {
      customer_email: purchaseData.customerEmail,
      customer_name: purchaseData.customerName || 'N/A',
      order_items: itemsList.trim(),
      subtotal: `$${subtotal.toFixed(2)}`,
      total_amount: `$${purchaseData.totalAmount.toFixed(2)}`,
      order_date: purchaseData.orderDate,
      order_id: orderId,
      session_id: purchaseData.sessionId,
      to_name: 'Koinonia Coffee Project',
    };

    console.log('Sending email via EmailJS with params:', templateParams);
    const response = await emailjs.send(serviceId, purchaseTemplateId, templateParams, publicKey);
    console.log('EmailJS response:', response);
  } catch (error) {
    console.error('Error sending purchase notification email:', error);
    throw error;
  }
};
