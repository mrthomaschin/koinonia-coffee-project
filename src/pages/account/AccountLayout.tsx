import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAccount } from '../../contexts/AccountContext';

const AccountLayout: React.FC = () => {
  const navigate = useNavigate();
  const { account, logout } = useAccount();
  if (!account) return null;
  const isPartner = account.label === 'wholesale' || account.label === 'church-ministry';
  const handleLogout = async (): Promise<void> => { await logout(); navigate('/'); };

  return <main className="account-page">
    <div className="account-hero"><div><p className="account-kicker">ACCOUNT</p><h1>Welcome back, {account.user.firstName}.</h1></div></div>
    <div className="account-layout"><aside className="account-sidebar"><nav aria-label="Account navigation">
      <NavLink to="/account/orders">Orders</NavLink>
      <NavLink to="/account/subscriptions">Subscriptions</NavLink>
      {isPartner && <NavLink to="/account/partner-store">Partner store</NavLink>}
      <NavLink to="/account/details">Account details</NavLink>
      <button className="account-sign-out" onClick={() => void handleLogout()}>Sign out</button>
    </nav></aside><section className="account-content"><Outlet /></section></div>
  </main>;
};

export default AccountLayout;
