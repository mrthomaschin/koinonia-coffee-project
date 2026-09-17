import React, { useEffect, useMemo, useState } from 'react';
import { useAccount } from '../../contexts/AccountContext';
import { useCart } from '../../contexts/CartContext';
import { useInventory } from '../../contexts/InventoryContext';
import { accountService } from '../../services/accountService';
import { AccountLabel } from '../../models/AccountModel';
import { Item, ItemType } from '../shop/item/ItemModel';
import './PartnerSubscriptionBuilder.css';

interface Props { accountLabel: Extract<AccountLabel, 'wholesale' | 'church-ministry'> }
interface OrderRow { item: Item; variant: NonNullable<Item['variants']>[number]; retailPrice: number; key: string }
const isWholesaleVariant = (variant: NonNullable<Item['variants']>[number]): boolean =>
  variant.isWholesale === true || variant.sku.trim().toUpperCase().endsWith('-WS');
const isPartnerCoffeeSize = (item: Item, variant: NonNullable<Item['variants']>[number]): boolean =>
  item.itemType === ItemType.coffee && ['200g', '1lb', '3lb', '5lb'].includes((variant.weight || '').replace(/\s/g, '').toLowerCase());
const money = (amount: number): string => `$${amount.toFixed(2)} USD`;

const PartnerSubscriptionBuilder: React.FC<Props> = ({ accountLabel }) => {
  const { token } = useAccount();
  const { items } = useInventory();
  const { cart, forceUpdate, showToast } = useCart();
  const [query, setQuery] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [partnerPrices, setPartnerPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token || accountLabel !== 'church-ministry') return;
    accountService.getPartnerPrices(token).then(({ prices }) => setPartnerPrices(prices)).catch(() => setPartnerPrices({}));
  }, [accountLabel, token]);

  const rows = useMemo<OrderRow[]>(() => items.flatMap((item) => {
    const variants = (item.variants || []).filter((variant) => variant.active !== false);
    const partnerVariants = variants.filter((variant) => isWholesaleVariant(variant)
      || (accountLabel === 'wholesale' && isPartnerCoffeeSize(item, variant)))
      .sort((first, second) => Number(isWholesaleVariant(second)) - Number(isWholesaleVariant(first)));
    // Prefer a dedicated wholesale variant when both it and a regular bag size exist.
    const chosen = partnerVariants.filter((variant, index) => !partnerVariants.slice(0, index).some((previous) =>
      (previous.weight || '').toLowerCase() === (variant.weight || '').toLowerCase()
      && (previous.size || '').toLowerCase() === (variant.size || '').toLowerCase()
      && (previous.color || '').toLowerCase() === (variant.color || '').toLowerCase()));
    return chosen.map((variant) => {
      const baseSku = variant.sku.trim().toUpperCase().replace(/-WS$/, '');
      const retail = variants.find((candidate) => candidate.sku.trim().toUpperCase() === baseSku && !isWholesaleVariant(candidate))
        || variants.find((candidate) => !isWholesaleVariant(candidate)
          && candidate.weight === variant.weight && candidate.size === variant.size && candidate.color === variant.color);
      return { item, variant, retailPrice: retail?.price || variant.price || item.price, key: variant.sku };
    });
  }), [accountLabel, items]);
  const visibleRows = rows.filter(({ item, variant }) => `${item.name} ${item.itemSummary} ${variant.sku} ${variant.size || ''} ${variant.weight || ''}`.toLowerCase().includes(query.toLowerCase()));

  const addItem = (row: OrderRow): void => {
    const quantity = Math.max(0, quantities[row.key] || 0);
    if (!quantity) return;
    const price = partnerPrices[row.variant.sku] ?? row.variant.price;
    const result = cart.addItem(row.item, quantity, {
      variantSku: row.variant.sku,
      variantPrice: price,
      variantShippingWeight: row.variant.shippingWeight,
      ...(row.variant.weight ? { weight: row.variant.weight } : {}),
      ...(row.variant.size ? { size: row.variant.size } : {}),
      ...(row.variant.color ? { color: row.variant.color } : {}),
      isPartnerOrder: true,
    });
    forceUpdate();
    if (result.success) setQuantities((current) => ({ ...current, [row.key]: 0 }));
    showToast(result.message, result.success ? 'success' : 'error');
  };

  return <section className="partner-order-catalog">
    <div className="partner-order-intro"><span>Wholesale Pricing</span><h3>Quick order form</h3><p>Choose quantities and add wholesale items directly to your cart.</p></div>
    <label className="partner-order-search">Search products<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all products" /></label>
    <div className="partner-order-table-wrap"><table className="partner-order-table">
      <thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Total</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
      <tbody>{visibleRows.map((row) => {
        const quantity = Math.max(0, quantities[row.key] || 0);
        const price = partnerPrices[row.variant.sku] ?? row.variant.price;
        const stock = row.variant.quantity;
        const outOfStock = stock <= 0;
        const variation = [row.variant.weight, row.variant.size, row.variant.color].filter(Boolean).join(' · ');
        return <tr key={row.key}>
          <td className="partner-order-product"><img src={row.item.firebaseImageUrls?.[0] || '/assets/images/shop_placeholder.png'} alt="" /><span><strong>{row.item.name}</strong>{variation && <small>{variation}</small>}{outOfStock && <small>Out of stock</small>}</span></td>
          <td className="partner-order-price"><strong>{money(price)}</strong><small>Retail price</small><s>{money(row.retailPrice)}</s></td>
          <td><input aria-label={`Quantity for ${row.item.name}${variation ? ` ${variation}` : ''}`} type="number" min="0" step="1" max={stock > 0 ? stock : undefined} disabled={outOfStock} value={quantity} onChange={(event) => setQuantities((current) => ({ ...current, [row.key]: Math.max(0, Number(event.target.value) || 0) }))} /></td>
          <td className="partner-order-total">{money(price * quantity)}</td>
          <td><button type="button" className="partner-order-add" disabled={!quantity || outOfStock} onClick={() => addItem(row)}>Add</button></td>
        </tr>;
      })}{visibleRows.length === 0 && <tr><td colSpan={5} className="partner-order-empty">No wholesale products found.</td></tr>}</tbody>
    </table></div>
  </section>;
};

export default PartnerSubscriptionBuilder;
