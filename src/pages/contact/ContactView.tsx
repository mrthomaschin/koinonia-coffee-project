import React, { useEffect, useState } from 'react';
import ContactViewModel from './ContactViewModel';
import './ContactView.css';
import { FormData, FormErrors } from './ContactModel';
import InstagramEmbed from '../../components/InstagramEmbed';

interface ContactProps { availableHeight: number; }
interface FormSectionProps {
  formData: FormData; errors: FormErrors;
  updateField: (field: keyof FormData, value: string) => void;
  submitForm: () => Promise<boolean>; isSubmitting: boolean; submitSuccess: boolean;
}

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="contact-field-label">{children}</span>
);

const FormSection: React.FC<FormSectionProps> = ({ formData, errors, updateField, submitForm, isSubmitting, submitSuccess }) => {
  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    await submitForm();
  };
  return (
    <div className="contact-form-column">
      <div className="contact-form-heading">Send us a note.</div>
      <form onSubmit={handleSubmit} className="contact-form">
        <div className="contact-form-grid">
          <label className="contact-field"><FieldLabel>First name</FieldLabel><input aria-label="First name" type="text" placeholder="Enter your first name" value={formData.firstName} onChange={(e) => updateField('firstName', e.target.value)} className={errors.firstName ? 'error' : ''} />{errors.firstName && <span className="error-text">{errors.firstName}</span>}</label>
          <label className="contact-field"><FieldLabel>Last name</FieldLabel><input aria-label="Last name" type="text" placeholder="Enter your last name" value={formData.lastName} onChange={(e) => updateField('lastName', e.target.value)} className={errors.lastName ? 'error' : ''} />{errors.lastName && <span className="error-text">{errors.lastName}</span>}</label>
          <label className="contact-field"><FieldLabel>Email address</FieldLabel><input aria-label="Email address" type="email" placeholder="Enter your email" value={formData.email} onChange={(e) => updateField('email', e.target.value)} className={errors.email ? 'error' : ''} />{errors.email && <span className="error-text">{errors.email}</span>}</label>
          <label className="contact-field"><FieldLabel>What’s this about?</FieldLabel><select aria-label="What’s this about?" value={formData.subject} onChange={(e) => updateField('subject', e.target.value)} className={errors.subject ? 'error' : ''}><option value="">Select one</option><option value="General questions">General questions</option><option value="Host an event">Host an event</option><option value="Collaborate">Collaborate</option></select>{errors.subject && <span className="error-text">{errors.subject}</span>}</label>
          <label className="contact-field contact-message-field"><FieldLabel>Message</FieldLabel><textarea aria-label="Message" placeholder="Tell us a little more" value={formData.message} onChange={(e) => updateField('message', e.target.value)} className={errors.message ? 'error' : ''} rows={5} />{errors.message && <span className="error-text">{errors.message}</span>}</label>
        </div>
        <div className="contact-submit-row"><button type="submit" className="submit-button" disabled={isSubmitting || submitSuccess}>{submitSuccess ? 'Message sent' : isSubmitting ? 'Sending...' : 'Send message'}</button><span className="submit-note">We’ll get back to you as soon as we can.</span></div>
      </form>
    </div>
  );
};

const Contact: React.FC<ContactProps> = ({ availableHeight }) => {
  const [viewModel] = useState(() => new ContactViewModel());
  const [, forceUpdate] = useState({});
  useEffect(() => { viewModel.setOnStateChange(() => forceUpdate({})); }, [viewModel]);

  return (
    <main className="contact-page" style={{ minHeight: availableHeight }}>
      <section className="contact-main-section">
        <div className="contact-intro"><p className="eyebrow">Start here</p><h2>Good things<br />usually begin with<br />a conversation.</h2><p className="intro-copy">Questions, ideas, event plans, or just want to talk<br className="desktop-break" /> coffee? We’d love to hear from you.</p><a className="contact-email" href="mailto:hello@koinoniacoffeeproject.com">hello@koinoniacoffeeproject.com</a><div className="contact-links"><a href="mailto:hello@koinoniacoffeeproject.com"></a></div></div>
        <div id="contact-form"><FormSection formData={viewModel.formData} errors={viewModel.errors} updateField={(field, value) => viewModel.updateField(field, value)} submitForm={() => viewModel.submitForm()} isSubmitting={viewModel.isSubmitting} submitSuccess={viewModel.submitSuccess} /></div>
      </section>
      <section className="instagram-section"><div className="instagram-copy"><p className="eyebrow">Follow along</p><h2>See where we're headed next.</h2><p>Find us at the next gathering and follow the project as it grows.</p></div><InstagramEmbed /></section>
    </main>
  );
};

export default Contact;
