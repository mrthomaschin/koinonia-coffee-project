import React, { FormEvent, useEffect, useState } from 'react';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { SUBSCRIPTION_PLANS, Subscription } from '../../models/AccountModel';
import './AccountPage.css';
import { Order } from '../../models/OrderModel';

const AccountPage: React.FC = () => {
  const { account, token, isAuthenticated, isLoading, login, createAccount, logout } = useAccount();
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersError, setOrdersError] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionError, setSubscriptionError] = useState('');

  useEffect(() => {
    if (!token) {
      setOrders([]);
      setOrdersError('');
      setOrdersLoading(false);
      return;
    }

    setOrdersError('');
    setOrdersLoading(true);
    accountService.getOrders(token)
      .then(({ orders: loadedOrders }) => {
        setOrders(loadedOrders);
        setOrdersError('');
      })
      .catch((requestError: Error) => setOrdersError(requestError.message))
      .finally(() => setOrdersLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) {
      setSubscriptions([]);
      setSubscriptionError('');
      return;
    }

    setSubscriptionError('');
    accountService.getSubscriptions(token)
      .then(({ subscriptions: loadedSubscriptions }) => {
        setSubscriptions(loadedSubscriptions);
        setSubscriptionError('');
      })
      .catch((requestError: Error) => setSubscriptionError(requestError.message));
  }, [token]);

  const cancelSubscription = async (subscriptionId: string): Promise<void> => {
    if (!token) return;
    setSubscriptionError('');
    try {
      const { subscription } = await accountService.cancelSubscription(token, subscriptionId);
      setSubscriptions((current) => current.map((item) => item.id === subscription.id ? subscription : item));
    } catch (requestError) {
      setSubscriptionError(requestError instanceof Error ? requestError.message : 'Please try again.');
    }
  };

  const skipSubscription = async (subscriptionId: string): Promise<void> => {
    if (!token) return;
    setSubscriptionError('');
    try {
      const { subscription } = await accountService.skipSubscription(token, subscriptionId);
      setSubscriptions((current) => current.map((item) => item.id === subscription.id ? subscription : item));
    } catch (requestError) {
      setSubscriptionError(requestError instanceof Error ? requestError.message : 'Please try again.');
    }
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    if (mode === 'create' && password !== repeatPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') await login(username, password);
      else await createAccount({ firstName, lastName, email, username, password });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <main className="account-page"><p>Loading your profile…</p></main>;
  if (!isAuthenticated || !account) {
    return (
      <main className="account-page">
        <section className="account-card">
          <p className="account-kicker">KOINONIA COFFEE PROJECT</p>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="account-intro">{mode === 'login' ? 'Sign in to see your order history.' : 'Create an account to keep your orders together.'}</p>
          <form onSubmit={submit} className="account-form">
            {mode === 'create' && <div className="account-name-row">
              <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required /></label>
              <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" required /></label>
            </div>}
            {mode === 'create' && <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>}
            <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'create' ? 8 : undefined} required /></label>
            {mode === 'create' && <label>Repeat password<input type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>}
            {error && <p className="account-error" role="alert">{error}</p>}
            <button type="submit" className="account-submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
          </form>
          <button className="account-switch" onClick={() => { setMode(mode === 'login' ? 'create' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Create account' : 'Already have an account? Log in'}
          </button>
        </section>
      </main>
    );
  }

  return <main className="account-page"><section className="account-card account-dashboard">
    <div className="account-dashboard-heading"><div><p className="account-kicker">YOUR PROFILE</p><h1>Hello, {account.user.firstName}</h1><p>{account.user.email}</p></div><button className="account-switch" onClick={() => void logout()}>Log out</button></div>
    <h2>Your orders</h2>
    {ordersLoading && <p>Loading your orders…</p>}
    {ordersError && <p className="account-error">{ordersError}</p>}
    {!ordersLoading && !ordersError && orders.length === 0 && <p className="account-empty">No orders are associated with this email yet.</p>}
    {orders.map((order) => <article className="order-row" key={order.id}><div><strong>Order #{order.id}</strong><span>{new Date(order.createdAt).toLocaleDateString()}</span></div><div><span className={`order-status order-status-${order.status}`}>{order.status}</span><strong>${order.totalAmount.toFixed(2)}</strong></div></article>)}
    <h2>Roast subscriptions</h2>
    <p className="account-intro">Manage subscriptions started from a coffee product page. Roast dates usually fall every 2–3 weeks.</p>
    {subscriptionError && <p className="account-error" role="alert">{subscriptionError}</p>}
    {subscriptions.length === 0 && <p className="account-empty">You do not have any subscriptions yet.</p>}
    {subscriptions.map((subscription) => <article className="subscription-row" key={subscription.id}><div><strong>{subscription.itemName} · {subscription.weight}</strong><span>{SUBSCRIPTION_PLANS.find((plan) => plan.id === subscription.plan)?.label} · 5% off{subscription.freeShipping ? ' · Free shipping' : ''}{subscription.skipNextDelivery ? ' · Next delivery skipped' : ''}</span></div><div><span className={`order-status order-status-${subscription.status}`}>{subscription.status}</span>{subscription.status === 'active' && <span className="subscription-actions">{!subscription.skipNextDelivery && <button className="account-cancel" onClick={() => void skipSubscription(subscription.id)}>Skip next</button>}<button className="account-cancel" onClick={() => void cancelSubscription(subscription.id)}>Cancel</button></span>}</div></article>)}
  </section></main>;
};

export default AccountPage;
