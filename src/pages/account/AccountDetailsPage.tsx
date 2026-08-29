import React from 'react';
import { useAccount } from '../../contexts/AccountContext';

const AccountDetailsPage: React.FC = () => {
  const { account } = useAccount();
  if (!account) return null;
  return <><p className="account-section-kicker">Your information</p><h2>Account details</h2><div className="account-detail-grid"><article className="account-detail-card"><h3>Contact information</h3><p>{account.user.firstName} {account.user.lastName}<br />{account.user.email}</p><button className="account-link">Manage details</button></article><article className="account-detail-card"><h3>Saved addresses</h3><p>No saved addresses yet. Add one for a faster checkout next time.</p><button className="account-link">Add an address</button></article></div></>;
};

export default AccountDetailsPage;
