import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';
import { useCart } from '../../contexts/CartContext';
import { useInventory } from '../../contexts/InventoryContext';
import { accountService } from '../../services/accountService';
import { AccountLabel } from '../../models/AccountModel';
import { SubscriptionPlan } from '../../models/AccountModel';
import { ItemType } from '../shop/item/ItemModel';
import { generateSlug } from '../shop/shopData';
import { Item } from '../shop/item/ItemModel';
import './PartnerSubscriptionBuilder.css';

interface PartnerSubscriptionBuilderProps {
  accountLabel: Extract<AccountLabel, 'wholesale' | 'church-ministry'>;
}

const WHOLESALE_SKUS = ['B-KOIN-WS', 'B-ETH-W-WS'];

const normalizeSku = (sku: string): string => sku.trim().toUpperCase();

const wholesaleVariantFor = (item: Item) => item.variants?.find((variant) =>
  WHOLESALE_SKUS.includes(normalizeSku(variant.sku))
);

const toPounds = (weight: string): number => {
  const value = Number.parseFloat(weight);
  if (!Number.isFinite(value)) return 0;
  if (weight.toLowerCase().includes('kg')) return value * 2.20462;
  if (weight.toLowerCase().includes('g')) return value / 453.592;
  if (weight.toLowerCase().includes('oz')) return value / 16;
  return weight.toLowerCase().includes('lb') ? value : 0;
};

const pricePerPound = (item: Item): number => {
  const pricedVariants = (item.variants || [])
    .map((variant) => ({ pounds: toPounds(variant.weight || ''), price: variant.price }))
    .filter((variant) => variant.pounds > 0 && variant.price > 0);
  const largestVariant = pricedVariants.sort((first, second) => second.pounds - first.pounds)[0];
  if (largestVariant) return largestVariant.price / largestVariant.pounds;
  return item.price;
};

const PartnerSubscriptionBuilder: React.FC<PartnerSubscriptionBuilderProps> = ({ accountLabel }) => {
  const { token } = useAccount();
  const { items } = useInventory();
  const { cart, forceUpdate, showToast } = useCart();
  const [selectedSku, setSelectedSku] = useState('');
  const [weight, setWeight] = useState(accountLabel === 'wholesale' ? 5 : 1);
  const [purchaseType, setPurchaseType] = useState<'subscription' | 'one-time'>('subscription');
  const [frequency, setFrequency] = useState<'every-session' | 'every-other-session'>('every-session');
  const [partnerPrices, setPartnerPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token || accountLabel !== 'church-ministry') return;
    accountService.getPartnerPrices(token)
      .then(({ prices }) => setPartnerPrices(prices))
      .catch(() => setPartnerPrices({}));
  }, [accountLabel, token]);

  const coffeeItems = useMemo(() => items.filter((item) => item.itemType === ItemType.coffee && ['B-KOIN', 'B-ETH-W'].includes(normalizeSku(item.sku)) && !!wholesaleVariantFor(item)), [items]);
  const selectedItem = coffeeItems.find((item) => item.sku === selectedSku) || coffeeItems[0];
  const minimum = accountLabel === 'wholesale' ? 5 : 1;
  const subscriptionPlan: SubscriptionPlan = `one-bag-${frequency}`;
  const selectedWholesaleVariant = selectedItem ? wholesaleVariantFor(selectedItem) : undefined;
  // WS variants are priced as one pound even when their Notion Variant Weight
  // property is blank. The selected amount is the number of pounds ordered.
  const partnerVariantPricePerPound = selectedWholesaleVariant && selectedWholesaleVariant.price > 0
    ? selectedWholesaleVariant.price / (toPounds(selectedWholesaleVariant.weight || '') || 1)
    : undefined;
  const overriddenPricePerPound = selectedWholesaleVariant ? partnerPrices[selectedWholesaleVariant.sku] : undefined;
  const perPound = overriddenPricePerPound ?? partnerVariantPricePerPound ?? (selectedItem ? pricePerPound(selectedItem) : 0);
  const totalPrice = perPound * weight;

  const addSelection = (): void => {
    if (!selectedItem || weight < minimum || weight % 0.5 !== 0) return;
    const wholesaleVariant = wholesaleVariantFor(selectedItem);
    const result = cart.addItem(selectedItem, 1, {
      weight: `${weight}lb`,
      variantSku: wholesaleVariant?.sku,
      variantPrice: Number(totalPrice.toFixed(2)),
      variantShippingWeight: weight * 453.592,
      ...(purchaseType === 'subscription' ? { subscriptionPlan } : {}),
      isPartnerOrder: accountLabel === 'wholesale' || accountLabel === 'church-ministry',
    });
    forceUpdate();
    showToast(result.message, result.success ? 'success' : 'error');
  };

  return (
    <section className="partner-subscription-builder">
      <div className="partner-subscription-heading">
        <p>{accountLabel === 'wholesale' ? 'Wholesale purchases start at 5 lb.' : 'Church & Ministry purchases start at 1 lb.'} Choose half-pound increments and add coffee to your cart.</p>
      </div>
      {!selectedItem && <p className="account-empty">Coffee offerings are loading…</p>}
      <div className="partner-coffee-grid">
        {coffeeItems.map((item) => <div className={`partner-coffee-card ${selectedItem?.sku === item.sku ? 'selected' : ''}`} key={item.sku}>
          <button onClick={() => setSelectedSku(item.sku)} type="button"><img src={item.firebaseImageUrls?.[0] || '/assets/images/shop_placeholder.png'} alt={item.name} /><span>{item.name}</span></button>
          <Link to={`/shop/${generateSlug(item.name)}`} className="partner-coffee-link">View offering</Link>
        </div>)}
      </div>
      {selectedItem && <div className="partner-subscription-controls">
        <label>Amount (lb)<input type="number" min={minimum} step="0.5" value={weight} onChange={(event) => setWeight(Number(event.target.value))} /></label>
        <fieldset><legend>Purchase type</legend><label><input type="radio" checked={purchaseType === 'subscription'} onChange={() => setPurchaseType('subscription')} /> Start a subscription</label><label><input type="radio" checked={purchaseType === 'one-time'} onChange={() => setPurchaseType('one-time')} /> One-time purchase</label></fieldset>
        {purchaseType === 'subscription' && <fieldset><legend>Frequency</legend><label><input type="radio" checked={frequency === 'every-session'} onChange={() => setFrequency('every-session')} /> Every roast session</label><label><input type="radio" checked={frequency === 'every-other-session'} onChange={() => setFrequency('every-other-session')} /> Every other roast session</label></fieldset>}
        <strong>${totalPrice.toFixed(2)}{purchaseType === 'subscription' ? ' per delivery' : ''}</strong>
        <button className="account-submit" type="button" onClick={addSelection}>Add {purchaseType === 'subscription' ? 'subscription' : 'coffee'} to cart</button>
      </div>}
    </section>
  );
};

export default PartnerSubscriptionBuilder;
