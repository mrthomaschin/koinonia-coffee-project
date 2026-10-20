import React from "react";
import Catering, { CateringPageConfig } from "../Catering";

const page: CateringPageConfig = {
  title: "Coffee cart catering for your wedding day.",
  seoTitle: "Wedding Coffee Cart Catering | Koinonia Coffee Project",
  description:
    "Add a mobile coffee cart to your wedding. Espresso, matcha, and hojicha drinks served for your guests across Los Angeles, Orange County, and the Inland Empire.",
  path: "/catering/weddings",
  breadcrumbName: "Weddings",
  serviceType: "Wedding coffee cart catering",
};

const WeddingsCatering: React.FC<{ availableHeight: number }> = ({
  availableHeight,
}) => <Catering availableHeight={availableHeight} page={page} />;

export default WeddingsCatering;
