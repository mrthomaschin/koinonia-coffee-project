import React, { useState, useEffect } from 'react';
import ContactViewModel from './ContactViewModel';
import InstagramEmbed from '../../components/InstagramEmbed';
import './ContactView.css';
import { FormData, FormErrors } from './ContactModel';

interface ContactProps {
  availableHeight: number;
}

const TextSection: React.FC = () => (
  <div className="contact-text-section">
    <h1 className="contact-title">Contact us!</h1>
    <p className="contact-description">
      We'd love to hear from you! Whether you have a question, feedback, or just
      want to say hello, feel free to reach out.
    </p>
    <div className="contact-email-info">
      <p className="email-label">Email:</p>
      <p className="email-address">hello@koinoniacoffeeproject.com</p>
    </div>
  </div>
);

interface FormSectionProps {
  formData: FormData;
  errors: FormErrors;
  updateField: (field: keyof FormData, value: string) => void;
  submitForm: () => Promise<boolean>;
  isSubmitting: boolean;
  submitSuccess: boolean;
}

const FormSection: React.FC<FormSectionProps> = ({
  formData,
  errors,
  updateField,
  submitForm,
  isSubmitting,
  submitSuccess
}) => {
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await submitForm();
  };

  return (
    <div className="contact-form-container">
      <form onSubmit={handleSubmit} className="contact-form">
        <div className="form-row">
          <div className="form-field">
            <input
              type="text"
              placeholder="First Name"
              value={formData.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              className={errors.firstName ? 'error' : ''}
            />
            {errors.firstName && <span className="error-text">{errors.firstName}</span>}
          </div>
          <div className="form-field">
            <input
              type="text"
              placeholder="Last Name"
              value={formData.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              className={errors.lastName ? 'error' : ''}
            />
            {errors.lastName && <span className="error-text">{errors.lastName}</span>}
          </div>
        </div>

        <div className="form-field">
          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            className={errors.phone ? 'error' : ''}
          />
          {errors.phone && <span className="error-text">{errors.phone}</span>}
        </div>

        <div className="form-field">
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => updateField('email', e.target.value)}
            className={errors.email ? 'error' : ''}
          />
          {errors.email && <span className="error-text">{errors.email}</span>}
        </div>

        <div className="form-field">
          <textarea
            placeholder="Message"
            value={formData.message}
            onChange={(e) => updateField('message', e.target.value)}
            className={errors.message ? 'error' : ''}
            rows={5}
          />
          {errors.message && <span className="error-text">{errors.message}</span>}
        </div>

        <button
          type="submit"
          className={`submit-button ${submitSuccess ? 'success' : ''}`}
          disabled={isSubmitting || submitSuccess}
        >
          {submitSuccess ? 'MESSAGE SENT!' : isSubmitting ? 'SENDING...' : 'SEND MESSAGE'}
        </button>
      </form>
    </div>
  );
};

const Contact: React.FC<ContactProps> = ({ availableHeight }) => {
  const [viewModel] = useState(() => new ContactViewModel());
  const [, forceUpdate] = useState({});
  const [screenWidth, setScreenWidth] = useState<number>(window.innerWidth);

  useEffect(() => {
    viewModel.setOnStateChange(() => {
      forceUpdate({});
    });
  }, [viewModel]);

  useEffect(() => {
    const handleResize = (): void => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile: boolean = screenWidth < 768;

  return (
    <div className="contact-page" style={{ minHeight: availableHeight }}>
      {isMobile ? (
        <>
          <div className="contact-mobile">
            <TextSection />
            <FormSection
              formData={viewModel.formData}
              errors={viewModel.errors}
              updateField={(field, value) => viewModel.updateField(field, value)}
              submitForm={() => viewModel.submitForm()}
              isSubmitting={viewModel.isSubmitting}
              submitSuccess={viewModel.submitSuccess}
            />
          </div>
          <div className="instagram-row">
            <InstagramEmbed />
          </div>
        </>
      ) : (
        <>
          <div className="contact-desktop">
            <div className="contact-left">
              <TextSection />
            </div>
            <div className="contact-right">
              <FormSection
                formData={viewModel.formData}
                errors={viewModel.errors}
                updateField={(field, value) => viewModel.updateField(field, value)}
                submitForm={() => viewModel.submitForm()}
                isSubmitting={viewModel.isSubmitting}
                submitSuccess={viewModel.submitSuccess}
              />
            </div>
          </div>
          <div className="instagram-row">
            <InstagramEmbed />
          </div>
        </>
      )}
    </div>
  );
};

export default Contact;
