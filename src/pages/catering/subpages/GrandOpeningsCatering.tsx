import React from 'react';
import Catering, { CateringPageConfig } from '../Catering';

const page: CateringPageConfig = {
  title: 'Coffee cart catering for your grand opening.',
  seoTitle: 'Grand Opening Coffee Cart Catering | Koinonia Coffee Project',
  description: 'Celebrate your grand opening or ribbon cutting with a mobile espresso bar that brings people through the door. Serving Los Angeles, Orange County, and the Inland Empire.',
  path: '/catering/grand-openings',
  breadcrumbName: 'Grand Openings',
  serviceType: 'Grand opening coffee catering',
};

const GrandOpeningsCatering: React.FC<{ availableHeight: number }> = ({ availableHeight }) => (
  <Catering availableHeight={availableHeight} page={page} />
);

export default GrandOpeningsCatering;
