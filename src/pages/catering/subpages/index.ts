import React from "react";
import Catering from "../Catering";
import { cateringPages } from "../cateringPages";

export const cateringSubpages: {
  path: string;
  Component: React.FC<{ availableHeight: number }>;
}[] = cateringPages.map((page) => ({
  path: page.path,
  Component: ({ availableHeight }) =>
    React.createElement(Catering, { availableHeight, page }),
}));
