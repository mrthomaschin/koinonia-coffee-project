import React from 'react';
import Catering, { CateringPageConfig } from '../Catering';

const page: CateringPageConfig = {
  title: 'Coffee cart catering for open houses and real estate events.',
  seoTitle: 'Real Estate & Open House Coffee Cart | Koinonia Coffee Project',
  description: 'Draw more foot traffic to your open house, broker preview, or client appreciation event with a mobile coffee cart in Los Angeles, Orange County, and the Inland Empire.',
  path: '/catering/real-estate',
  breadcrumbName: 'Real Estate',
  serviceType: 'Open house and real estate event coffee catering',
};

const RealEstateCatering: React.FC<{ availableHeight: number }> = ({ availableHeight }) => (
  <Catering availableHeight={availableHeight} page={page} />
);

export default RealEstateCatering;
