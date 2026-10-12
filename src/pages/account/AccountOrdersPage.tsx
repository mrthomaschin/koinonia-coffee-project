import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';
import { accountService } from '../../services/accountService';
import { Order } from '../../models/OrderModel';

const AccountOrdersPage: React.FC = () => {
  const { token } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [openingReview, setOpeningReview] = useState('');
  const navigate = useNavigate();
  const writeReview = async (orderId: string) => {
    if (!token) return;
    setOpeningReview(orderId);
    setError('');
    try {
      const { path } = await accountService.getOrderReviewPath(token, orderId);
      navigate(path);
    } catch (requestError) {
      setError((requestError as Error).message);
      setOpeningReview('');
    }
  };
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    accountService.getOrders(token).then(({ orders: loadedOrders }) => setOrders(loadedOrders)).catch((requestError: Error) => setError(requestError.message)).finally(() => setLoading(false));
  }, [token]);
  return <><p className="account-section-kicker">Your Orders</p><h2>Your recent orders</h2>{loading && <p className="account-empty">Loading your orders…</p>}{error && <p className="account-error">{error}</p>}{!loading && !error && orders.length === 0 && <p className="account-empty">No orders are associated with this email yet.</p>}{orders.map((order) => <article className="order-row" key={order.id}><div><strong>{order.itemsSummary || `Order #${order.id}`}</strong><span>Order #{order.id} · {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span></div><div><span className={`order-status order-status-${order.status}`}>{order.status}</span><span>1 item · ${order.totalAmount.toFixed(2)}</span>{order.reviewable && <button className="account-link order-review-link" onClick={() => writeReview(order.id)} disabled={openingReview === order.id}>{openingReview === order.id ? 'Opening…' : order.reviewed ? 'Edit review' : 'Write a review'}</button>}</div></article>)}</>;
};

export default AccountOrdersPage;
