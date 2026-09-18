import React from 'react';
import SEO from '../../components/SEO';
import './LegalPage.css';

type LegalPageType = 'terms' | 'privacy' | 'refund';

const content: Record<LegalPageType, { title: string; path: string; description: string; sections: { heading: string; paragraphs: string[] }[] }> = {
  terms: {
    title: 'Terms of Service',
    path: '/terms-of-service',
    description: 'Terms for using the Koinonia Coffee Project website, store, and services.',
    sections: [
      { heading: 'Using this site', paragraphs: ['These Terms of Service apply to your use of the Koinonia Coffee Project website and any purchases or services offered through it. By using the site, you agree to these terms. If you do not agree, please do not use the site.', 'You must provide accurate information when placing an order or creating an account. You are responsible for activity under your account and for keeping your sign-in credentials secure.'] },
      { heading: 'Products, pricing, and orders', paragraphs: ['We do our best to keep product descriptions, availability, and prices accurate. Product offerings, prices, and promotions may change, and an item may become unavailable. We may correct errors or cancel an order when necessary; if payment has been collected for an order we cancel, we will issue a refund.', 'Prices are shown in U.S. dollars. Applicable taxes and shipping charges are presented during checkout. Your order is an offer to purchase; an order confirmation does not guarantee acceptance if we identify an error, payment issue, or availability problem.'] },
      { heading: 'Payments and delivery', paragraphs: ['Payments are processed by third-party payment providers, including Stripe. We do not receive or store your full payment card number through this website. Shipping options, estimated timing, and charges are shown during checkout. Delivery dates are estimates unless we expressly state otherwise.', 'You agree to provide a complete and accurate delivery address. Risk of loss and ownership transfer as permitted by applicable law.'] },
      { heading: 'Subscriptions', paragraphs: ['Some coffee offerings may be recurring subscriptions. The frequency, price, and other material terms will be shown before you enroll. When you place a subscription order, you authorize recurring charges according to the terms presented at enrollment until the subscription is canceled.', 'You can manage or cancel an eligible subscription through your account. Cancellation or changes may not affect an order already being prepared or processed. Any required renewal notices, consent, and cancellation rights under applicable law will apply.'] },
      { heading: 'Acceptable use and intellectual property', paragraphs: ['Do not misuse the site, interfere with its operation, attempt unauthorized access, or use it in violation of law. The site and its content, including text, images, branding, and design, belong to Koinonia Coffee Project or its licensors and may not be copied or used commercially without permission.'] },
      { heading: 'Disclaimers and limits', paragraphs: ['The site and its content are provided “as is” and “as available” to the extent permitted by law. We do not guarantee uninterrupted or error-free operation. Nothing in these terms limits rights or remedies that cannot be limited under applicable law.', 'To the extent permitted by law, Koinonia Coffee Project will not be liable for indirect, incidental, special, or consequential damages arising from use of the site or products. These terms do not exclude liability that applicable law does not allow us to exclude.'] },
      { heading: 'Changes and contact', paragraphs: ['We may update these terms by posting a revised version here. The “Last updated” date indicates when changes were made. Continued use of the site after an update means you accept the revised terms to the extent permitted by law.', 'Questions about these terms? Email hello@koinoniacoffeeproject.com. These terms are governed by the laws applicable where Koinonia Coffee Project operates, without limiting any mandatory consumer protections that apply to you.'] }
    ]
  },
  privacy: {
    title: 'Privacy Policy',
    path: '/privacy-policy',
    description: 'How Koinonia Coffee Project collects and uses information through this website and store.',
    sections: [
      { heading: 'Information we collect', paragraphs: ['We collect information you provide when you place an order, create or use an account, contact us, or sign up for updates. This may include your name, email address, phone number, billing or shipping address, order details, and messages you send us.', 'When you use the site, we and service providers may collect technical and usage information such as your IP address, browser and device details, pages viewed, and interactions with the store. Our site uses Google Analytics to measure page views and activity. Payment card details are handled by our payment processor, such as Stripe, and are not stored in full by us.'] },
      { heading: 'How we use information', paragraphs: ['We use information to process and deliver orders, manage accounts and subscriptions, respond to questions, provide customer support, operate and improve the website, prevent fraud, maintain business records, and meet legal obligations. If you sign up for marketing messages, we may use your contact details to send them; you can unsubscribe from marketing emails using the link in the message.'] },
      { heading: 'When information is shared', paragraphs: ['We share information with service providers that help us run the store and provide services, such as payment processing, website hosting, analytics, account and order management, and communications. They may use information only as needed to provide services to us or as otherwise permitted by law.', 'We may also disclose information when required by law, to protect people or our rights, or as part of a business transfer. We do not sell personal information for money. Some analytics or advertising technologies may be treated as “sharing” under certain privacy laws; contact us to ask about your choices.'] },
      { heading: 'Cookies and analytics', paragraphs: ['The site and its service providers may use cookies or similar technologies to remember preferences, support site functions, and understand site usage. You can manage cookies through your browser settings. Blocking cookies may affect some site features.'] },
      { heading: 'Retention and security', paragraphs: ['We keep information for as long as reasonably needed for the purposes described here, including to fulfill orders, maintain account and financial records, resolve disputes, and meet legal requirements. We use reasonable safeguards, but no online service can guarantee absolute security.'] },
      { heading: 'Your choices and privacy rights', paragraphs: ['Depending on where you live, you may have rights to request access to, correction or deletion of certain personal information, or to opt out of certain processing. To make a request, email hello@koinoniacoffeeproject.com with “Privacy Request” in the subject. We may need to verify your identity and will respond as required by applicable law.', 'You can opt out of marketing emails at any time using the unsubscribe link. Browser “Do Not Track” signals may not be interpreted uniformly by all services used on this site.'] },
      { heading: 'Children and policy updates', paragraphs: ['This site is intended for a general audience and is not directed to children under 13. We do not knowingly collect personal information from children under 13.', 'We may update this policy from time to time by posting a revised version on this page. The “Last updated” date indicates when it was most recently changed. Contact hello@koinoniacoffeeproject.com with questions.'] }
    ]
  },
  refund: {
    title: 'Refund Policy',
    path: '/refund-policy',
    description: 'How to request help with an order from Koinonia Coffee Project.',
    sections: [
      { heading: 'We’re here to help', paragraphs: ['If there is a problem with your order, please contact us at hello@koinoniacoffeeproject.com with your order number and a description of the issue. For damaged, incorrect, or missing items, contact us as soon as possible after delivery and include photos when helpful so we can make it right.'] },
      { heading: 'Coffee and perishable items', paragraphs: ['Because coffee and other food items are perishable, we generally cannot accept returns or exchanges for preference changes after an order has shipped. If your coffee arrives damaged, incorrect, or otherwise not as described, contact us within 7 days of delivery. We will review the issue and, where appropriate, arrange a replacement or refund.'] },
      { heading: 'Merchandise', paragraphs: ['Unused, non-food merchandise in its original condition and packaging may be eligible for a return request within 30 days of delivery. Please contact us before sending an item back. Unless the item is defective, damaged, or incorrect, return shipping costs are the customer’s responsibility. Original shipping charges are not refundable unless required by law.'] },
      { heading: 'Subscriptions and cancellations', paragraphs: ['You can cancel an eligible subscription through your account. Cancellation stops future renewals but may not stop an order already prepared, processed, or shipped. Charges for fulfilled subscription orders are not refundable except where required by law or where we determine there was a problem with the order.', 'If you believe you were charged in error, contact us promptly with the charge date and associated account or order details.'] },
      { heading: 'Events, catering, and refunds', paragraphs: ['Any deposit, payment, cancellation window, or refund terms for a catering booking or ticketed event will be provided with that specific booking or event. If no separate terms are provided, contact us as soon as possible and we will review the request.'] },
      { heading: 'Refund timing and delayed orders', paragraphs: ['Approved refunds are returned to the original payment method. Your financial institution may take additional time to post the credit. If we cannot ship an order within the promised timeframe, we will contact you with options, including cancellation and a refund as required by law.', 'To request help, email orders@koinoniacoffeeproject.com. This policy does not limit any rights you have under applicable consumer protection laws.'] }
    ]
  }
};

const LegalPage: React.FC<{ type: LegalPageType }> = ({ type }) => {
  const page = content[type];
  return (
    <main className="legal-page">
      <SEO title={`${page.title} | Koinonia Coffee Project`} description={page.description} path={page.path} />
      <header className="legal-page-header">
        <p className="legal-eyebrow">Koinonia Coffee Project</p>
        <h1>{page.title}</h1>
        <p className="legal-updated">Last updated: September 18, 2026</p>
      </header>
      <article className="legal-page-content">
        {page.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
        <p className="legal-draft-note">These policies are a starting point and should be reviewed against your business practices and applicable law.</p>
      </article>
    </main>
  );
};

export const TermsOfServicePage: React.FC = () => <LegalPage type="terms" />;
export const PrivacyPolicyPage: React.FC = () => <LegalPage type="privacy" />;
export const RefundPolicyPage: React.FC = () => <LegalPage type="refund" />;

export default LegalPage;
