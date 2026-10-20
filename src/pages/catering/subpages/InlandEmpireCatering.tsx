import React from "react";
import Catering, { CateringPageConfig } from "../Catering";

const page: CateringPageConfig = {
  title: "Coffee cart catering in the Inland Empire.",
  seoTitle: "Coffee Cart Catering Inland Empire | Koinonia Coffee Project",
  description:
    "Book a mobile coffee cart in the Inland Empire for weddings, corporate events, and private gatherings in Riverside, San Bernardino, Ontario, Rancho Cucamonga, and beyond.",
  path: "/catering/inland-empire",
  breadcrumbName: "Inland Empire",
  areaServed: [
    { "@type": "AdministrativeArea", name: "Inland Empire, CA" },
    { "@type": "AdministrativeArea", name: "Riverside County, CA" },
    { "@type": "AdministrativeArea", name: "San Bernardino County, CA" },
  ],
};

const InlandEmpireCatering: React.FC<{ availableHeight: number }> = ({
  availableHeight,
}) => <Catering availableHeight={availableHeight} page={page} />;

export default InlandEmpireCatering;
