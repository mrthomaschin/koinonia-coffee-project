import emailjs from '@emailjs/browser';

interface ContactFormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  message: string;
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
