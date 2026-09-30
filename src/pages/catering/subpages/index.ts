import React from 'react';
import CorporateEventsCatering from './CorporateEventsCatering';
import WeddingsCatering from './WeddingsCatering';
import RealEstateCatering from './RealEstateCatering';
import GrandOpeningsCatering from './GrandOpeningsCatering';
import BrandActivationsCatering from './BrandActivationsCatering';
import OrangeCountyCatering from './OrangeCountyCatering';
import InlandEmpireCatering from './InlandEmpireCatering';
import TorranceCatering from './TorranceCatering';
import LosAngelesCatering from './LosAngelesCatering';
import OntarioRanchCatering from './OntarioRanchCatering';

export const cateringSubpages: { path: string; Component: React.FC<{ availableHeight: number }> }[] = [
  { path: '/catering/corporate-events', Component: CorporateEventsCatering },
  { path: '/catering/weddings', Component: WeddingsCatering },
  { path: '/catering/real-estate', Component: RealEstateCatering },
  { path: '/catering/grand-openings', Component: GrandOpeningsCatering },
  { path: '/catering/brand-activations', Component: BrandActivationsCatering },
  { path: '/catering/orange-county', Component: OrangeCountyCatering },
  { path: '/catering/inland-empire', Component: InlandEmpireCatering },
  { path: '/catering/torrance', Component: TorranceCatering },
  { path: '/catering/los-angeles', Component: LosAngelesCatering },
  { path: '/catering/ontario-ranch', Component: OntarioRanchCatering },
];
