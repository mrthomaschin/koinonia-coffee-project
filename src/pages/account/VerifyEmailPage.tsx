import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import './AccountPage.css';

type VerificationState =
  | { status: 'verifying' }
  | { status: 'verified'; email: string }
  | { status: 'failed'; message: string };

/** Landing page for emailed verification links (/verify-email?token=…). */
const VerifyEmailPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, applyVerifiedAccount } = useAccount();
  const [state, setState] = useState<VerificationState>({ status: 'verifying' });
  // Links are single-use, so the token must be submitted exactly once, even
  // when React runs effects twice in development.
  const submittedToken = useRef<string | null>(null);
  const token = searchParams.get('token') || '';

  useEffect(() => {
    if (!token) {
      setState({ status: 'failed', message: 'This link is missing its verification code.' });
      return;
    }
    if (submittedToken.current === token) return;
    submittedToken.current = token;
    // Keep the token out of browser history once it has been read.
    window.history.replaceState(null, '', window.location.pathname);
    accountService.verifyEmail(token)
      .then(({ account }) => {
        applyVerifiedAccount(account);
        setState({ status: 'verified', email: account.user.email });
      })
      .catch((error: unknown) => setState({ status: 'failed', message: error instanceof Error ? error.message : 'Please try again.' }));
  }, [token, applyVerifiedAccount]);

  return <main className="account-page">
    <div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Confirm your email.</h1></div></div>
    <section className="account-login-wrap"><div className="account-login-card" aria-live="polite">
      <p className="account-kicker">KOINONIA COFFEE PROJECT</p>
      {state.status === 'verifying' && <><h1>Confirming…</h1><p className="account-intro">One moment while we confirm your email.</p></>}
      {state.status === 'verified' && <><h1>Email confirmed.</h1><p className="account-intro">{state.email} is confirmed for your account.</p></>}
      {state.status === 'failed' && <><h1>We couldn’t confirm that link.</h1><p className="account-error" role="alert">{state.message}</p></>}
      {state.status !== 'verifying' && <button className="account-submit account-verify-continue" onClick={() => navigate(isAuthenticated ? '/account/details' : '/account-login')}>
        {isAuthenticated ? 'Go to your account' : 'Log in'}
      </button>}
    </div></section>
  </main>;
};

export default VerifyEmailPage;
