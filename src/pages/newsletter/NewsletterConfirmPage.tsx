import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SEO from '../../components/SEO';
import { confirmNewsletter, NewsletterConfirmation } from '../../services/newsletterService';
import '../account/AccountPage.css';
import './NewsletterConfirmPage.css';

type ConfirmState =
  | { status: 'confirming' }
  | ({ status: 'confirmed' } & NewsletterConfirmation)
  | { status: 'failed'; message: string };

/** Landing page for the newsletter confirmation link (/newsletter/confirm?token=…). */
const NewsletterConfirmPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<ConfirmState>({ status: 'confirming' });
  // Links are single-use, so the token must be submitted exactly once, even
  // when React runs effects twice in development.
  const submittedToken = useRef<string | null>(null);
  const token = searchParams.get('token') || '';

  useEffect(() => {
    if (!token) {
      setState({ status: 'failed', message: 'This link is missing its confirmation code.' });
      return;
    }
    if (submittedToken.current === token) return;
    submittedToken.current = token;
    // Keep the token out of browser history once it has been read.
    window.history.replaceState(null, '', window.location.pathname);
    confirmNewsletter(token)
      .then((confirmation) => setState({ status: 'confirmed', ...confirmation }))
      .catch((error: unknown) => setState({ status: 'failed', message: error instanceof Error ? error.message : 'Please try again.' }));
  }, [token]);

  return <main className="account-page">
    <SEO title="Confirm Newsletter | Koinonia Coffee Project" description="Confirm your Koinonia Coffee Project newsletter subscription." path="/newsletter/confirm" />
    <div className="account-hero"><div><p className="account-kicker">NEWSLETTER</p><h1>Follow along the journey.</h1></div></div>
    <section className="account-login-wrap"><div className="account-login-card" aria-live="polite">
      <p className="account-kicker">KOINONIA COFFEE PROJECT</p>
      {state.status === 'confirming' && <><h1>Confirming…</h1><p className="account-intro">One moment while we confirm your subscription.</p></>}
      {state.status === 'confirmed' && <>
        <h1>You're subscribed!</h1>
        <p className="account-intro">Thanks for joining us. Here's {state.percentOff}% off your first order. We've also emailed it to {state.email}.</p>
        <p className="newsletter-confirm-code">{state.discountCode}</p>
        <p className="account-hint">Enter the code in your cart. First orders only; can't be combined with other discounts, subscriptions, or partner pricing.</p>
      </>}
      {state.status === 'failed' && <><h1>We couldn’t confirm that link.</h1><p className="account-error" role="alert">{state.message}</p></>}
      {state.status !== 'confirming' && <button className="account-submit account-verify-continue" onClick={() => navigate('/shop')}>
        Shop coffee
      </button>}
    </div></section>
  </main>;
};

export default NewsletterConfirmPage;
