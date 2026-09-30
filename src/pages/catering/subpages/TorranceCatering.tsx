import React from 'react';
import Catering, { CateringPageConfig } from '../Catering';

const page: CateringPageConfig = {
  title: 'Coffee cart catering in Torrance.',
  seoTitle: 'Coffee Cart Catering Torrance, CA | Koinonia Coffee Project',
  description: 'Book a mobile coffee cart in Torrance and the South Bay for weddings, corporate events, and private gatherings, with full setup, service, and tear-down.',
  path: '/catering/torrance',
  breadcrumbName: 'Torrance',
  areaServed: [
    { '@type': 'City', name: 'Torrance, CA' },
    { '@type': 'Place', name: 'South Bay, Los Angeles' },
  ],
};

const TorranceCatering: React.FC<{ availableHeight: number }> = ({ availableHeight }) => (
  <Catering availableHeight={availableHeight} page={page} />
);

export default TorranceCatering;
