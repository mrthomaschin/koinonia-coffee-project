import React from "react";
import Catering, { CateringPageConfig } from "../Catering";

const page: CateringPageConfig = {
  title: "Coffee cart catering in Orange County.",
  seoTitle: "Coffee Cart Catering Orange County | Koinonia Coffee Project",
  description:
    "Book a mobile coffee cart in Orange County for weddings, corporate events, and private gatherings, from Irvine and Anaheim to Huntington Beach and Newport Beach.",
  path: "/catering/orange-county",
  breadcrumbName: "Orange County",
  areaServed: [{ "@type": "AdministrativeArea", name: "Orange County, CA" }],
};

const OrangeCountyCatering: React.FC<{ availableHeight: number }> = ({
  availableHeight,
}) => <Catering availableHeight={availableHeight} page={page} />;

export default OrangeCountyCatering;
