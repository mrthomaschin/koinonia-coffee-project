import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { SUBSCRIPTION_CADENCES, SUBSCRIPTION_PLANS, Subscription, SubscriptionCadence } from '../../models/AccountModel';

const formatRoastDate = (roastDate: string): string =>
  new Date(roastDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const isRoastSkipped = (subscription: Subscription): boolean =>
  !!subscription.skippedRoastDate && subscription.skippedRoastDate === subscription.upcomingRoastDate.slice(0, 10);

const cadenceLabel = (cadence: SubscriptionCadence): string =>
  (SUBSCRIPTION_CADENCES.find((option) => option.id === cadence)?.label || 'Every roast session').toLowerCase();

const orderNowPrompt = (subscription: Subscription): string => {
  const productAmount = (subscription.unitAmount * subscription.bagCount + (subscription.addOnUnitAmount || 0)) / 100;
  const shippingNote = subscription.isLocalPickup || subscription.freeShipping ? '' : ' plus shipping';
  return `Order now?\n\nYour saved payment method will be charged now for your next subscription order: ${subscription.bagCount}x ${subscription.itemName} (${subscription.weight}), $${productAmount.toFixed(2)}${shippingNote}.\n\nIt will go into the next roast session that is still taking orders (orders close at 11:59pm the night before a roast), and your following deliveries will continue ${cadenceLabel(subscription.cadence)} from there.`;
};

const AccountSubscriptionsPage: React.FC = () => {
  const { account, token } = useAccount();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busySubscriptionId, setBusySubscriptionId] = useState('');
  const [addOnWeights, setAddOnWeights] = useState<Record<string, number>>({});

  const loadSubscriptions = (sessionToken: string): Promise<void> =>
    accountService.getSubscriptions(sessionToken).then(({ subscriptions: loadedSubscriptions }) => setSubscriptions(loadedSubscriptions)).catch((requestError: Error) => setError(requestError.message));

  useEffect(() => {
    if (!token) return;
    accountService.getSubscriptions(token).then(({ subscriptions: loadedSubscriptions }) => setSubscriptions(loadedSubscriptions)).catch((requestError: Error) => setError(requestError.message));
  }, [token]);

  const replaceSubscription = (updated: Subscription): void =>
    setSubscriptions((current) => current.map((item) => item.id === updated.id ? updated : item));

  if (account?.label === 'wholesale' || account?.label === 'church-ministry') return <Navigate to="/account/partner-store" replace />;

  const updateSubscription = async (subscription: Subscription, action: 'cancel' | 'skip' | 'unskip'): Promise<void> => {
    if (!token) return;
    if (action === 'skip' && !window.confirm(`Skip your ${formatRoastDate(subscription.upcomingRoastDate)} roast? You won't be charged for it, and your subscription continues with the following roast.`)) return;
    setError('');
    setNotice('');
    try {
      const request = {
        cancel: accountService.cancelSubscription,
        skip: accountService.skipSubscription,
        unskip: accountService.unskipSubscription,
      }[action];
      const result = await request.call(accountService, token, subscription.id);
      replaceSubscription(result.subscription);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    }
  };

  const changeFrequency = async (subscription: Subscription, cadence: SubscriptionCadence): Promise<void> => {
    if (!token || cadence === subscription.cadence) return;
    setError('');
    setNotice('');
    setBusySubscriptionId(subscription.id);
    try {
      const { subscription: updated } = await accountService.changeSubscriptionFrequency(token, subscription.id, cadence);
      replaceSubscription(updated);
      setNotice(`${updated.itemName} now ships ${cadenceLabel(cadence)}, starting after your ${formatRoastDate(updated.upcomingRoastDate)} roast.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    } finally {
      setBusySubscriptionId('');
    }
  };

  const orderNow = async (subscription: Subscription): Promise<void> => {
    if (!token || !window.confirm(orderNowPrompt(subscription))) return;
    setError('');
    setNotice('');
    setBusySubscriptionId(subscription.id);
    try {
      const result = await accountService.orderSubscriptionNow(token, subscription.id);
      replaceSubscription(result.subscription);
      setNotice(result.status === 'ordered'
        ? `Order ${result.orderId} placed. Check your email for a confirmation. Your next delivery is now the ${formatRoastDate(result.subscription.upcomingRoastDate)} roast.`
        : 'Your order is processing. You will get a confirmation email once the charge goes through.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
      await loadSubscriptions(token);
    } finally {
      setBusySubscriptionId('');
    }
  };

  const addSubscriptionCoffee = async (subscription: Subscription): Promise<void> => {
    if (!token) return;
    const addOnWeight = addOnWeights[subscription.id] || 0;
    const baseWeight = Number.parseFloat(subscription.weight) || 1;
    if (addOnWeight <= 0 || addOnWeight % 0.5 !== 0) {
      setError('Add-on coffee must be entered in half-pound increments.');
      return;
    }
    try {
      const pricePerPound = (subscription.unitAmount / 100) / baseWeight;
      const { subscription: updated } = await accountService.addSubscriptionAddOn(token, subscription.id, addOnWeight, pricePerPound * addOnWeight);
      setSubscriptions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setAddOnWeights((current) => ({ ...current, [subscription.id]: 0 }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
    }
  };

  return <>
    <p className="account-section-kicker">Your Subscriptions</p>
    <h2>Roast subscriptions</h2>
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-success" role="status">{notice}</p>}
    {subscriptions.length === 0 && <p className="account-empty">You do not have any subscriptions yet.</p>}
    {subscriptions.map((subscription) => {
      const busy = busySubscriptionId === subscription.id;
      const orderProcessing = !!subscription.orderNowRoastDate;
      return <article className="subscription-row" key={subscription.id}>
        <div>
          <strong>{subscription.itemName} · {subscription.weight}</strong>
          <span>{SUBSCRIPTION_PLANS.find((plan) => plan.id === subscription.plan)?.label}{account?.label === 'consumer' && subscription.discountPercent > 0 ? ` · ${subscription.discountPercent}% off` : ''}{subscription.freeShipping ? ' · Free shipping' : ''}{subscription.isLocalPickup ? ' · Free pickup' : ''}</span>
          {orderProcessing ? <span>Order for the {formatRoastDate(subscription.upcomingRoastDate)} roast is processing</span> : isRoastSkipped(subscription) ? <span>{formatRoastDate(subscription.upcomingRoastDate)} roast skipped · You won't be charged</span> : <span>Renews {formatRoastDate(subscription.upcomingRoastDate)}</span>}
          {subscription.addOnWeight ? <span>Next round includes an additional {subscription.addOnWeight} lb</span> : null}
          {subscription.status !== 'canceled' && <label className="subscription-frequency-select">Frequency
            <select value={subscription.cadence} disabled={busy} onChange={(event) => void changeFrequency(subscription, event.target.value as SubscriptionCadence)}>
              {SUBSCRIPTION_CADENCES.map((cadence) => <option key={cadence.id} value={cadence.id}>{cadence.label}</option>)}
            </select>
          </label>}
          {account?.label === 'church-ministry' && subscription.status === 'active' && <span className="subscription-add-on"><label>Add to next round (lb)<input type="number" min="0.5" step="0.5" value={addOnWeights[subscription.id] || ''} onChange={(event) => setAddOnWeights((current) => ({ ...current, [subscription.id]: Number(event.target.value) }))} /></label><button className="account-link" onClick={() => void addSubscriptionCoffee(subscription)}>Add coffee</button></span>}
        </div>
        <div>
          <span className={`order-status order-status-${subscription.status}`}>{subscription.status}</span>
          {subscription.status === 'active' && <span className="subscription-actions">
            <button className="account-cancel" disabled={busy || orderProcessing} onClick={() => void orderNow(subscription)}>{busy ? 'Working…' : 'Order now'}</button>
            {isRoastSkipped(subscription) ? <button className="account-cancel" disabled={busy} onClick={() => void updateSubscription(subscription, 'unskip')}>Undo skip</button> : <button className="account-cancel" disabled={busy || orderProcessing} onClick={() => void updateSubscription(subscription, 'skip')}>Skip next</button>}
            <button className="account-cancel" disabled={busy} onClick={() => void updateSubscription(subscription, 'cancel')}>Cancel</button>
          </span>}
        </div>
      </article>;
    })}
  </>;
};

export default AccountSubscriptionsPage;
