import React, { createContext, useContext, useState, ReactNode } from 'react';
import { submitContactForm } from '../services/emailService';

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  message: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  message?: string;
}

interface ContactContextType {
  formData: FormData;
  errors: FormErrors;
  updateField: (field: keyof FormData, value: string) => void;
  submitForm: () => Promise<boolean>;
  isSubmitting: boolean;
  submitSuccess: boolean;
}

const ContactContext = createContext<ContactContextType | undefined>(undefined);

export const useContact = (): ContactContextType => {
  const context = useContext(ContactContext);
  if (!context) {
    throw new Error('useContact must be used within ContactProvider');
  }
  return context;
};

interface ContactProviderProps {
  children: ReactNode;
}

export const ContactProvider: React.FC<ContactProviderProps> = ({ children }) => {
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    message: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  const updateField = (field: keyof FormData, value: string): void => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'Please enter your first name';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Please enter your last name';
    }
    if (!formData.phone.trim()) {
      newErrors.phone = 'Please enter your phone number';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Please enter your email';
    } else if (!formData.email.includes('@')) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.message.trim()) {
      newErrors.message = 'Please enter your message';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitForm = async (): Promise<boolean> => {
    if (!validateForm()) {
      return false;
    }

    setIsSubmitting(true);
    try {
      await submitContactForm(formData);
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        message: ''
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 4000);
      return true;
    } catch (error) {
      console.error('Failed to submit form:', error);
      alert('Failed to send message. Please try again.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContactContext.Provider value={{ formData, errors, updateField, submitForm, isSubmitting, submitSuccess }}>
      {children}
    </ContactContext.Provider>
  );
};
