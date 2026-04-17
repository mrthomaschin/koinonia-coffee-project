import { submitContactForm } from '../../services/emailService';
import { FormData, FormErrors } from './ContactModel';

export class ContactViewModel {
  private _formData: FormData;
  private _errors: FormErrors;
  private _isSubmitting: boolean;
  private _submitSuccess: boolean;
  private _onStateChange?: () => void;

  constructor() {
    this._formData = {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      message: ''
    };
    this._errors = {};
    this._isSubmitting = false;
    this._submitSuccess = false;
  }

  get formData(): FormData {
    return this._formData;
  }

  get errors(): FormErrors {
    return this._errors;
  }

  get isSubmitting(): boolean {
    return this._isSubmitting;
  }

  get submitSuccess(): boolean {
    return this._submitSuccess;
  }

  get isFormValid(): boolean {
    return Object.keys(this._errors).length === 0 &&
      this._formData.firstName.trim() !== '' &&
      this._formData.lastName.trim() !== '' &&
      this._formData.phone.trim() !== '' &&
      this._formData.email.trim() !== '' &&
      this._formData.message.trim() !== '';
  }

  setOnStateChange(callback: () => void): void {
    this._onStateChange = callback;
  }

  private notifyStateChange(): void {
    if (this._onStateChange) {
      this._onStateChange();
    }
  }

  updateField(field: keyof FormData, value: string): void {
    this._formData = { ...this._formData, [field]: value };

    if (this._errors[field]) {
      this._errors = { ...this._errors, [field]: undefined };
    }

    this.notifyStateChange();
  }

  private validateForm(): boolean {
    const newErrors: FormErrors = {};

    if (!this._formData.firstName.trim()) {
      newErrors.firstName = 'Please enter your first name';
    }
    if (!this._formData.lastName.trim()) {
      newErrors.lastName = 'Please enter your last name';
    }
    if (!this._formData.phone.trim()) {
      newErrors.phone = 'Please enter your phone number';
    }
    if (!this._formData.email.trim()) {
      newErrors.email = 'Please enter your email';
    } else if (!this._formData.email.includes('@')) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!this._formData.message.trim()) {
      newErrors.message = 'Please enter your message';
    }

    this._errors = newErrors;
    this.notifyStateChange();
    return Object.keys(newErrors).length === 0;
  }

  async submitForm(): Promise<boolean> {
    if (!this.validateForm()) {
      return false;
    }

    this._isSubmitting = true;
    this.notifyStateChange();

    try {
      await submitContactForm(this._formData);

      this._formData = {
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        message: ''
      };
      this._submitSuccess = true;
      this.notifyStateChange();

      setTimeout(() => {
        this._submitSuccess = false;
        this.notifyStateChange();
      }, 4000);

      return true;
    } catch (error) {
      console.error('Failed to submit form:', error);
      alert('Failed to send message. Please try again.');
      return false;
    } finally {
      this._isSubmitting = false;
      this.notifyStateChange();
    }
  }

  resetForm(): void {
    this._formData = {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      message: ''
    };
    this._errors = {};
    this._isSubmitting = false;
    this._submitSuccess = false;
    this.notifyStateChange();
  }
}

export default ContactViewModel;
