import React, { createContext, useContext, useState, ReactNode } from 'react';

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
  submitForm: () => boolean;
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

  const submitForm = (): boolean => {
    if (validateForm()) {
      alert('Message sent successfully!');
      setFormData({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        message: ''
      });
      return true;
    }
    return false;
  };

  return (
    <ContactContext.Provider value={{ formData, errors, updateField, submitForm }}>
      {children}
    </ContactContext.Provider>
  );
};
