import React, { useEffect, useState } from 'react';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { Order } from '../../models/OrderModel';

const AccountOrdersPage: React.FC = () => {
  const { token } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    accountService.getOrders(token).then(({ orders: loadedOrders }) => setOrders(loadedOrders)).catch((requestError: Error) => setError(requestError.message)).finally(() => setLoading(false));
  }, [token]);
  return <><p className="account-section-kicker">Your Orders</p><h2>Your recent orders</h2>{loading && <p className="account-empty">Loading your orders…</p>}{error && <p className="account-error">{error}</p>}{!loading && !error && orders.length === 0 && <p className="account-empty">No orders are associated with this email yet.</p>}{orders.map((order) => <article className="order-row" key={order.id}><div><strong>{order.itemsSummary || `Order #${order.id}`}</strong><span>Order #{order.id} · {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span></div><div><span className={`order-status order-status-${order.status}`}>{order.status}</span><span>1 item · ${order.totalAmount.toFixed(2)}</span></div><button className="account-view-order">View order</button></article>)}</>;
};

export default AccountOrdersPage;
