import React, { useEffect, useState } from 'react';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { SUBSCRIPTION_PLANS, Subscription } from '../../models/AccountModel';

const formatRenewalDate = (roastDate: string): string => {
  const renewalDate = new Date(roastDate);
  renewalDate.setDate(renewalDate.getDate() - 4);
  return renewalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const AccountSubscriptionsPage: React.FC = () => {
  const { account, token } = useAccount();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [error, setError] = useState('');
  const [addOnWeights, setAddOnWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token) return;
    accountService.getSubscriptions(token).then(({ subscriptions: loadedSubscriptions }) => setSubscriptions(loadedSubscriptions)).catch((requestError: Error) => setError(requestError.message));
  }, [token]);

  const updateSubscription = async (subscriptionId: string, action: 'cancel' | 'skip'): Promise<void> => {
    if (!token) return;
    setError('');
    try {
      const result = action === 'cancel' ? await accountService.cancelSubscription(token, subscriptionId) : await accountService.skipSubscription(token, subscriptionId);
      setSubscriptions((current) => current.map((item) => item.id === result.subscription.id ? result.subscription : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Please try again.');
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

  return <><p className="account-section-kicker">Your Subscriptions</p><h2>Roast subscriptions</h2>{error && <p className="account-error" role="alert">{error}</p>}{subscriptions.length === 0 && <p className="account-empty">You do not have any subscriptions yet.</p>}{subscriptions.map((subscription) => <article className="subscription-row" key={subscription.id}><div><strong>{subscription.itemName} · {subscription.weight}</strong><span>{SUBSCRIPTION_PLANS.find((plan) => plan.id === subscription.plan)?.label}{account?.label !== 'wholesale' && subscription.discountPercent > 0 ? ` · ${subscription.discountPercent}% off` : ''}{subscription.freeShipping ? ' · Free shipping' : ''}{subscription.isLocalPickup ? ' · Free pickup' : ''}{subscription.skipNextDelivery ? ' · Next delivery skipped' : ''}</span><span>Renews {formatRenewalDate(subscription.upcomingRoastDate)}</span>{subscription.addOnWeight ? <span>Next round includes an additional {subscription.addOnWeight} lb</span> : null}{account?.label === 'church-ministry' && subscription.status === 'active' && <span className="subscription-add-on"><label>Add to next round (lb)<input type="number" min="0.5" step="0.5" value={addOnWeights[subscription.id] || ''} onChange={(event) => setAddOnWeights((current) => ({ ...current, [subscription.id]: Number(event.target.value) }))} /></label><button className="account-link" onClick={() => void addSubscriptionCoffee(subscription)}>Add coffee</button></span>}</div><div><span className={`order-status order-status-${subscription.status}`}>{subscription.status}</span>{subscription.status === 'active' && <span className="subscription-actions">{!subscription.skipNextDelivery && <button className="account-cancel" onClick={() => void updateSubscription(subscription.id, 'skip')}>Skip next</button>}<button className="account-cancel" onClick={() => void updateSubscription(subscription.id, 'cancel')}>Cancel</button></span>}</div></article>)}</>;
};

export default AccountSubscriptionsPage;
