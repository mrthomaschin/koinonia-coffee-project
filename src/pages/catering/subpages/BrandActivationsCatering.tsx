import React from "react";
import Catering, { CateringPageConfig } from "../Catering";

const page: CateringPageConfig = {
  title: "Coffee cart catering for brand activations and pop-ups.",
  seoTitle: "Brand Activation Coffee Cart | Koinonia Coffee Project",
  description:
    "Branded mobile coffee cart for brand activations, product launches, and pop-up events, with custom cups available. Serving Los Angeles, Orange County, and the Inland Empire.",
  path: "/catering/brand-activations",
  breadcrumbName: "Brand Activations",
  serviceType: "Brand activation coffee catering",
};

const BrandActivationsCatering: React.FC<{ availableHeight: number }> = ({
  availableHeight,
}) => <Catering availableHeight={availableHeight} page={page} />;

export default BrandActivationsCatering;
