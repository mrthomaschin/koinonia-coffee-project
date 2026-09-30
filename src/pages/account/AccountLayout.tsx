import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';

/** Shown on every account page until the account's email is confirmed. */
const VerificationBanner: React.FC = () => {
  const { account, resendVerification } = useAccount();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  // Sessions saved before verification existed lack the field; only an explicit false shows the banner.
  if (!account || account.emailVerified !== false) return null;

  const resend = async (): Promise<void> => {
    setError('');
    setMessage('');
    setSending(true);
    try {
      setMessage(`We sent a new link to ${await resendVerification()}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  return <div className="account-verify-banner" role="status">
    <p><strong>Please confirm your email.</strong> We sent a link to {account.user.email}. Once it’s confirmed, orders you placed as a guest appear in your order history.</p>
    {message && <p className="account-success">{message}</p>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <button className="account-link" onClick={() => void resend()} disabled={sending}>{sending ? 'Sending…' : 'Resend email'}</button>
  </div>;
};

const AccountLayout: React.FC = () => {
  const navigate = useNavigate();
  const { account, logout } = useAccount();
  if (!account) return null;
  const isPartner = account.label === 'wholesale' || account.label === 'church-ministry';
  const handleLogout = async (): Promise<void> => { await logout(); navigate('/'); };

  return <main className="account-page">
    <div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back, {account.user.firstName}.</h1></div></div>
    <div className="account-layout"><aside className="account-sidebar"><nav aria-label="Account navigation">
      <NavLink to="/account/orders">Orders</NavLink>
      {!isPartner && <NavLink to="/account/subscriptions">Subscriptions</NavLink>}
      {isPartner && <NavLink to="/account/partner-store">Partner store</NavLink>}
      <NavLink to="/account/details">Account details</NavLink>
      <button className="account-sign-out" onClick={() => void handleLogout()}>Sign out</button>
    </nav></aside><section className="account-content"><VerificationBanner /><Outlet /></section></div>
  </main>;
};

export default AccountLayout;
