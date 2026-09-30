import React from 'react';
import Catering, { CateringPageConfig } from '../Catering';

const page: CateringPageConfig = {
  title: 'Coffee cart catering for your next corporate event.',
  seoTitle: 'Corporate Coffee Cart Catering | Koinonia Coffee Project',
  description: 'Mobile espresso bar catering for corporate events, office parties, conferences, and employee appreciation days in Los Angeles, Orange County, and the Inland Empire.',
  path: '/catering/corporate-events',
  breadcrumbName: 'Corporate Events',
  serviceType: 'Corporate event coffee catering',
};

const CorporateEventsCatering: React.FC<{ availableHeight: number }> = ({ availableHeight }) => (
  <Catering availableHeight={availableHeight} page={page} />
);

export default CorporateEventsCatering;
