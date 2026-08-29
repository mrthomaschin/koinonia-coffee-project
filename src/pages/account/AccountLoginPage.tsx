import React, { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';
import './AccountPage.css';

const AccountLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAccount();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/account');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="account-page">
      <div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back.</h1></div></div>
      <section className="account-login-wrap">
        <div className="account-login-card">
          <p className="account-kicker">KOINONIA COFFEE PROJECT</p>
          <h1>Sign in.</h1>
          <p className="account-intro">Sign in to see your order history and account details.</p>
          <form onSubmit={submit} className="account-form">
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            {error && <p className="account-error" role="alert">{error}</p>}
            <button type="submit" className="account-submit" disabled={submitting}>{submitting ? 'Please wait…' : 'Log in'}</button>
          </form>
          <button className="account-switch" onClick={() => navigate('/create-account')}>Create account</button>
        </div>
      </section>
    </main>
  );
};

export default AccountLoginPage;
