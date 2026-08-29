import React, { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';
import { AccountLabel } from '../../models/AccountModel';
import './AccountPage.css';
import AccountLayout from './AccountLayout';

interface AccountPageProps {
  initialMode?: 'login' | 'create';
  partnerMode?: boolean;
}

const AccountPage: React.FC<AccountPageProps> = ({ initialMode = 'login', partnerMode = false }) => {
  const navigate = useNavigate();
  const { account, isAuthenticated, isLoading, login, createAccount } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [partnerLabel, setPartnerLabel] = useState<AccountLabel>('wholesale');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    if (initialMode === 'create' && password !== repeatPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      if (initialMode === 'login') await login(username, password);
      else await createAccount({ firstName, lastName, email, username, password, ...(partnerMode ? { label: partnerLabel } : {}) });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <main className="account-page"><div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back.</h1></div></div><div className="account-login-wrap"><p className="account-empty">Loading your profile…</p></div></main>;
  if (initialMode === 'login' && (!isAuthenticated || !account)) return <Navigate to="/account-login" replace />;
  if (isAuthenticated && account) return <AccountLayout />;

  return <main className="account-page">
    <div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back.</h1></div></div>
    <section className="account-login-wrap"><div className="account-login-card">
      <p className="account-kicker">KOINONIA COFFEE PROJECT</p>
      <h1>{partnerMode ? 'Create a partner account.' : 'Create your account.'}</h1>
      <p className="account-intro">{partnerMode ? 'Create an account for an approved Koinonia partner program.' : 'Create an account to keep your orders together.'}</p>
      <form onSubmit={submit} className="account-form">
        {partnerMode && <label>Partner program<select value={partnerLabel} onChange={(event) => setPartnerLabel(event.target.value as AccountLabel)}><option value="wholesale">Wholesale</option><option value="church-ministry">Church &amp; Ministry</option></select></label>}
        <div className="account-name-row"><label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required /></label><label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required /></label></div>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <label>Repeat password<input type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        {error && <p className="account-error" role="alert">{error}</p>}
        <button type="submit" className="account-submit" disabled={submitting}>{submitting ? 'Please wait…' : 'Create account'}</button>
      </form>
      <button className="account-switch" onClick={() => navigate('/account-login')}>Already have an account? Log in</button>
    </div></section>
  </main>;
};

export default AccountPage;
