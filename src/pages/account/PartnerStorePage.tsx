import React from 'react';
import { useAccount } from '../../contexts/AccountContext';
import PartnerSubscriptionBuilder from './PartnerSubscriptionBuilder';

const PartnerStorePage: React.FC = () => {
  const { account } = useAccount();

  const isPartnerStoreAccount = (label: string): label is 'wholesale' | 'church-ministry' =>
    label === 'wholesale' || label === 'church-ministry';

  if (!account || !isPartnerStoreAccount(account.label)) return null;
  return <><p className="account-section-kicker">Partner store</p><h2>Partner coffee</h2><PartnerSubscriptionBuilder accountLabel={account.label} /></>;
};

export default PartnerStorePage;
