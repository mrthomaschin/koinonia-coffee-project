import React from "react";
import Catering, { CateringPageConfig } from "../Catering";

const page: CateringPageConfig = {
  title: "Coffee cart catering in Los Angeles.",
  seoTitle: "Los Angeles Coffee Cart Catering | Koinonia Coffee Project",
  description:
    "Book a mobile coffee cart in Los Angeles for weddings, corporate events, and private gatherings. Espresso, matcha, and hojicha drinks with full setup and service.",
  path: "/catering/los-angeles",
  breadcrumbName: "Los Angeles",
  areaServed: [
    { "@type": "City", name: "Los Angeles, CA" },
    { "@type": "AdministrativeArea", name: "Los Angeles County, CA" },
  ],
};

const LosAngelesCatering: React.FC<{ availableHeight: number }> = ({
  availableHeight,
}) => <Catering availableHeight={availableHeight} page={page} />;

export default LosAngelesCatering;
