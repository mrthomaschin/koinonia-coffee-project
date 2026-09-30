import React from 'react';
import Catering, { CateringPageConfig } from '../Catering';

const page: CateringPageConfig = {
  title: 'Coffee cart catering in Ontario Ranch.',
  seoTitle: 'Coffee Cart Catering Ontario Ranch, CA | Koinonia Coffee Project',
  description: 'Book a mobile coffee cart in Ontario Ranch for weddings, community events, and private gatherings, serving Ontario, Chino, Eastvale, and the surrounding Inland Empire.',
  path: '/catering/ontario-ranch',
  breadcrumbName: 'Ontario Ranch',
  areaServed: [
    { '@type': 'Place', name: 'Ontario Ranch, Ontario, CA' },
    { '@type': 'City', name: 'Ontario, CA' },
  ],
};

const OntarioRanchCatering: React.FC<{ availableHeight: number }> = ({ availableHeight }) => (
  <Catering availableHeight={availableHeight} page={page} />
);

export default OntarioRanchCatering;
