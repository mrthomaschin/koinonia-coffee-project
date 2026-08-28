import React, { FormEvent, useEffect, useState } from 'react';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { SUBSCRIPTION_PLANS, Subscription } from '../../models/AccountModel';
import './AccountPage.css';
import { Order } from '../../models/OrderModel';

type AccountSection = 'orders' | 'details' | 'subscriptions';

const formatRenewalDate = (roastDate: string): string => {
  const renewalDate = new Date(roastDate);
  renewalDate.setDate(renewalDate.getDate() - 4);
  return renewalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const AccountPage: React.FC = () => {
  const { account, token, isAuthenticated, isLoading, login, createAccount, logout } = useAccount();
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [activeSection, setActiveSection] = useState<AccountSection>('orders');
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

  if (isLoading) return <main className="account-page"><div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back.</h1></div></div><div className="account-login-wrap"><p className="account-empty">Loading your profile…</p></div></main>;
  if (!isAuthenticated || !account) {
    return (
      <main className="account-page">
        <div className="account-hero">
          <div><p className="account-kicker">ACCOUNT</p><h1>Welcome back.</h1></div>
        </div>
        <section className="account-login-wrap">
          <div className="account-login-card">
            <p className="account-kicker">KOINONIA COFFEE PROJECT</p>
            <h1>{mode === 'login' ? 'Sign in.' : 'Create your account.'}</h1>
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
          </div>
        </section>
      </main>
    );
  }

  return <main className="account-page">
    <div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back.</h1></div></div>
    <div className="account-layout">
      <aside className="account-sidebar"><nav aria-label="Account navigation">
        <button aria-current={activeSection === 'orders' ? 'page' : undefined} onClick={() => setActiveSection('orders')}>Orders</button><button aria-current={activeSection === 'subscriptions' ? 'page' : undefined} onClick={() => setActiveSection('subscriptions')}>Subscriptions</button><button aria-current={activeSection === 'details' ? 'page' : undefined} onClick={() => setActiveSection('details')}>Account details</button><button className="account-sign-out" onClick={() => void logout()}>Sign out</button>
      </nav></aside>
      <section className="account-content">
        {activeSection === 'orders' && <><p className="account-section-kicker">Your Orders</p><h2>Your recent orders</h2>{ordersLoading && <p className="account-empty">Loading your orders…</p>}{ordersError && <p className="account-error">{ordersError}</p>}{!ordersLoading && !ordersError && orders.length === 0 && <p className="account-empty">No orders are associated with this email yet.</p>}{orders.map((order) => <article className="order-row" key={order.id}><div><strong>{order.itemsSummary || `Order #${order.id}`}</strong><span>Order #{order.id} · {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span></div><div><span className={`order-status order-status-${order.status}`}>{order.status}</span><span>1 item · ${order.totalAmount.toFixed(2)}</span></div><button className="account-view-order">View order</button></article>)}</>}
        {activeSection === 'details' && <><p className="account-section-kicker">Your information</p><h2>Account details</h2><div className="account-detail-grid"><article className="account-detail-card"><h3>Contact information</h3><p>{account.user.firstName} {account.user.lastName}<br />{account.user.email}</p><button className="account-link">Manage details</button></article><article className="account-detail-card"><h3>Saved addresses</h3><p>No saved addresses yet. Add one for a faster checkout next time.</p><button className="account-link">Add an address</button></article></div></>}
        {activeSection === 'subscriptions' && <section className="account-subscriptions account-subscriptions-active"><p className="account-section-kicker">Your Subscriptions</p><h2>Roast subscriptions</h2>{subscriptionError && <p className="account-error" role="alert">{subscriptionError}</p>}{subscriptions.length === 0 && <p className="account-empty">You do not have any subscriptions yet.</p>}{subscriptions.map((subscription) => <article className="subscription-row" key={subscription.id}><div><strong>{subscription.itemName} · {subscription.weight}</strong><span>{SUBSCRIPTION_PLANS.find((plan) => plan.id === subscription.plan)?.label} · 5% off{subscription.freeShipping ? ' · Free shipping' : ''}{subscription.isLocalPickup ? ' · Local pickup' : ''}{subscription.skipNextDelivery ? ' · Next delivery skipped' : ''}</span><span>Renews {formatRenewalDate(subscription.upcomingRoastDate)}</span></div><div><span className={`order-status order-status-${subscription.status}`}>{subscription.status}</span>{subscription.status === 'active' && <span className="subscription-actions">{!subscription.skipNextDelivery && <button className="account-cancel" onClick={() => void skipSubscription(subscription.id)}>Skip next</button>}<button className="account-cancel" onClick={() => void cancelSubscription(subscription.id)}>Cancel</button></span>}</div></article>)}</section>}
      </section>
    </div>
  </main>;
};

export default AccountPage;
